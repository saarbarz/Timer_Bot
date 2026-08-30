import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openAppDatabase, type SqliteDatabase } from "../../src/db/Database.js";
import { createScheduledMessagesMigration } from "../../src/db/migrations/001_create_scheduled_messages.js";
import { addNextAttemptAtMigration } from "../../src/db/migrations/002_add_next_attempt_at.js";
import { ScheduledMessageRepository } from "../../src/db/ScheduledMessageRepository.js";
import type { Clock } from "../../src/domain/Clock.js";
import { ScheduleError, ScheduleService } from "../../src/domain/ScheduleService.js";
import { defaultUserId } from "../../src/domain/UserId.js";

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(value: string): void {
    this.current = new Date(value);
  }
}

interface TestContext {
  readonly dbPath: string;
  readonly db: SqliteDatabase;
  readonly repository: ScheduledMessageRepository;
  readonly service: ScheduleService;
  readonly clock: MutableClock;
  readonly tempDir: string;
}

const contexts: TestContext[] = [];

describe("ScheduleService SQLite integration", () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      if (context.db.open) {
        context.db.close();
      }
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    }
  });

  it("creates a future pending message and persists it after reopening the database", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");

    const message = context.service.create({
      recipient: "+972 50-123-4567",
      text: "test message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    expect(message).toMatchObject({
      id: "test-id-1",
      userId: defaultUserId,
      recipient: "972501234567",
      recipientJid: "972501234567@s.whatsapp.net",
      text: "test message",
      scheduledAtUtc: "2026-08-27T10:00:00.000Z",
      timezone: "Asia/Jerusalem",
      status: "pending",
      attempts: 0,
      createdAtUtc: "2026-08-27T09:00:00.000Z",
      updatedAtUtc: "2026-08-27T09:00:00.000Z"
    });

    context.db.close();
    const reopened = openAppDatabase(context.dbPath);
    const reopenedRepository = new ScheduledMessageRepository(reopened);
    expect(reopenedRepository.findById("test-id-1")).toEqual(message);
    reopened.close();
  });

  it("scopes list, find, update, and cancel operations by user id", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");
    const serviceA = createService(context.repository, context.clock, "test-user-a", "a-message");
    const serviceB = createService(context.repository, context.clock, "test-user-b", "b-message");

    const messageA = serviceA.create({
      recipient: "+972501234567",
      text: "message for a",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });
    const messageB = serviceB.create({
      recipient: "+972501234568",
      text: "message for b",
      scheduledAtLocal: "2026-08-27T13:05",
      timezone: "Asia/Jerusalem"
    });

    expect(serviceA.list().map((message) => message.id)).toEqual([messageA.id]);
    expect(serviceB.list().map((message) => message.id)).toEqual([messageB.id]);
    expect(context.repository.findById(messageA.id, "test-user-b")).toBeUndefined();

    expectScheduleError(() => serviceB.cancel(messageA.id), "scheduled_message_not_found");
    expect(serviceA.cancel(messageA.id).status).toBe("cancelled");
    expect(serviceB.list()[0]?.status).toBe("pending");
  });

  it("migrates existing single-user rows to the default local user id", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-old-sqlite-"));
    const dbPath = path.join(tempDir, "timer-bot.sqlite");

    try {
      const oldDb = new Database(dbPath);
      oldDb.exec(`
        CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at_utc TEXT NOT NULL
        );
        ${createScheduledMessagesMigration.sql}
        INSERT INTO schema_migrations (id, applied_at_utc)
        VALUES ('${createScheduledMessagesMigration.id}', '2026-08-27T09:00:00.000Z');
        ${addNextAttemptAtMigration.sql}
        INSERT INTO schema_migrations (id, applied_at_utc)
        VALUES ('${addNextAttemptAtMigration.id}', '2026-08-27T09:00:00.000Z');
      `);
      oldDb
        .prepare(
          `
            INSERT INTO scheduled_messages (
              id,
              recipient,
              recipient_jid,
              text,
              scheduled_at_utc,
              timezone,
              status,
              attempts,
              created_at_utc,
              updated_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          "legacy-message",
          "972501234567",
          "972501234567@s.whatsapp.net",
          "legacy text",
          "2026-08-27T10:00:00.000Z",
          "Asia/Jerusalem",
          "pending",
          0,
          "2026-08-27T09:00:00.000Z",
          "2026-08-27T09:00:00.000Z"
        );
      oldDb.close();

      const migratedDb = openAppDatabase(dbPath);
      const repository = new ScheduledMessageRepository(migratedDb);
      expect(repository.findById("legacy-message")?.userId).toBe(defaultUserId);
      migratedDb.close();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects past scheduled times before writing to SQLite", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");

    expectScheduleError(
      () =>
        context.service.create({
          recipient: "+972501234567",
          text: "test message",
          scheduledAtLocal: "2026-08-27T11:00",
          timezone: "Asia/Jerusalem"
        }),
      "scheduled_time_in_past"
    );

    expect(context.service.list()).toEqual([]);
  });

  it("cancels a pending message", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");
    context.service.create({
      recipient: "+972501234567",
      text: "test message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    context.clock.set("2026-08-27T09:05:00.000Z");
    const cancelled = context.service.cancel("test-id-1");

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.updatedAtUtc).toBe("2026-08-27T09:05:00.000Z");
  });

  it("rejects cancelling sent or processing messages", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");
    context.service.create({
      recipient: "+972501234567",
      text: "test message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    context.db
      .prepare("UPDATE scheduled_messages SET status = 'sent', sent_at_utc = ? WHERE id = ?")
      .run("2026-08-27T10:00:00.000Z", "test-id-1");
    expectScheduleError(() => context.service.cancel("test-id-1"), "scheduled_message_not_pending");

    context.db.prepare("UPDATE scheduled_messages SET status = 'processing' WHERE id = ?").run("test-id-1");
    expectScheduleError(() => context.service.cancel("test-id-1"), "scheduled_message_not_pending");
  });

  it("updates a pending message time and converts winter timezone offset to UTC", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");
    context.service.create({
      recipient: "+972501234567",
      text: "test message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    context.clock.set("2026-08-27T09:05:00.000Z");
    const updated = context.service.updateTime("test-id-1", {
      scheduledAtLocal: "2026-12-15T10:00",
      timezone: "Asia/Jerusalem"
    });

    expect(updated.status).toBe("pending");
    expect(updated.scheduledAtUtc).toBe("2026-12-15T08:00:00.000Z");
    expect(updated.updatedAtUtc).toBe("2026-08-27T09:05:00.000Z");
  });

  it("rejects updating sent messages", () => {
    const context = createContext("2026-08-27T09:00:00.000Z");
    context.service.create({
      recipient: "+972501234567",
      text: "test message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    context.db.prepare("UPDATE scheduled_messages SET status = 'sent' WHERE id = ?").run("test-id-1");

    expectScheduleError(
      () =>
        context.service.updateTime("test-id-1", {
          scheduledAtLocal: "2026-12-15T10:00",
          timezone: "Asia/Jerusalem"
        }),
      "scheduled_message_not_pending"
    );
  });
});

function createContext(nowIso: string): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-sqlite-"));
  const dbPath = path.join(tempDir, "timer-bot.sqlite");
  const db = openAppDatabase(dbPath);
  const repository = new ScheduledMessageRepository(db);
  const clock = new MutableClock(new Date(nowIso));
  let nextId = 1;
  const service = new ScheduleService(repository, {
    clock,
    idGenerator: () => `test-id-${nextId++}`
  });
  const context = { dbPath, db, repository, service, clock, tempDir };
  contexts.push(context);
  return context;
}

function createService(
  repository: ScheduledMessageRepository,
  clock: MutableClock,
  userId: string,
  nextId: string
): ScheduleService {
  return new ScheduleService(repository, {
    clock,
    userId,
    idGenerator: () => nextId
  });
}

function expectScheduleError(action: () => unknown, code: ScheduleError["code"]): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ScheduleError);
    expect((error as ScheduleError).code).toBe(code);
    return;
  }

  throw new Error(`Expected ScheduleError ${code}.`);
}
