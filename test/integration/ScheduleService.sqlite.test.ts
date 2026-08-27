import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openAppDatabase, type SqliteDatabase } from "../../src/db/Database.js";
import { ScheduledMessageRepository } from "../../src/db/ScheduledMessageRepository.js";
import type { Clock } from "../../src/domain/Clock.js";
import { ScheduleError, ScheduleService } from "../../src/domain/ScheduleService.js";

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
