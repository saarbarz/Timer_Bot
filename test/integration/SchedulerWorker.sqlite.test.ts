import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openAppDatabase, type SqliteDatabase } from "../../src/db/Database.js";
import { ScheduledMessageRepository } from "../../src/db/ScheduledMessageRepository.js";
import { createScheduledMessagesMigration } from "../../src/db/migrations/001_create_scheduled_messages.js";
import type { Clock } from "../../src/domain/Clock.js";
import type { ScheduledMessage } from "../../src/domain/ScheduledMessage.js";
import { ScheduleService } from "../../src/domain/ScheduleService.js";
import type { MessageSendResult, MessageSender } from "../../src/scheduler/MessageSender.js";
import { SchedulerWorker } from "../../src/scheduler/SchedulerWorker.js";

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
  readonly db: SqliteDatabase;
  readonly repository: ScheduledMessageRepository;
  readonly service: ScheduleService;
  readonly clock: MutableClock;
  readonly tempDir: string;
}

class FakeMessageSender implements MessageSender {
  private readonly queuedResults: MessageSendResult[];

  constructor(results: readonly MessageSendResult[] = [{ success: true, providerMessageId: "provider-message-id-1" }]) {
    this.queuedResults = [...results];
  }

  readonly send = vi.fn(async (_message: ScheduledMessage): Promise<MessageSendResult> => {
    return this.queuedResults.shift() ?? { success: true, providerMessageId: "provider-message-id-late" };
  });
}

const emptyRunResult = {
  claimed: 0,
  sent: 0,
  sendFailed: 0,
  retryScheduled: 0,
  failed: 0,
  recoveredStaleProcessing: 0
} as const;

const contexts: TestContext[] = [];

describe("SchedulerWorker SQLite integration", () => {
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      if (context.db.open) {
        context.db.close();
      }
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    }
  });

  it("allows only one of two concurrent workers to claim and send the same due message", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender();
    const workerA = new SchedulerWorker(context.repository, sender, { clock: context.clock });
    const workerB = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    const results = await Promise.all([workerA.runOnce(), workerB.runOnce()]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ claimed: 1, sent: 1, sendFailed: 0, retryScheduled: 0, failed: 0 }),
        emptyRunResult
      ])
    );
    expect(sender.send).toHaveBeenCalledOnce();
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ id: message.id, status: "processing" }));
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      providerMessageId: "provider-message-id-1",
      sentAtUtc: "2026-08-27T09:00:00.000Z"
    });
  });

  it("does not claim a future message", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = context.service.create({
      recipient: "+972501234567",
      text: "future message",
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    expect(sender.send).not.toHaveBeenCalled();
    expect(context.repository.findById(message.id)?.status).toBe("pending");
  });

  it("does not claim a cancelled message", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.service.cancel(message.id);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    expect(sender.send).not.toHaveBeenCalled();
    expect(context.repository.findById(message.id)?.status).toBe("cancelled");
  });

  it("marks a successfully sent claimed message as sent once", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    const result = await worker.runOnce();

    expect(result).toMatchObject({
      claimed: 1,
      sent: 1,
      sendFailed: 0,
      retryScheduled: 0,
      failed: 0,
      messageId: message.id,
      finalStatus: "sent",
      updatedAtUtc: "2026-08-27T09:00:00.000Z"
    });

    expect(sender.send).toHaveBeenCalledOnce();
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      attempts: 1,
      sentAtUtc: "2026-08-27T09:00:00.000Z",
      providerMessageId: "provider-message-id-1"
    });
  });

  it("does not send an already sent message on a later worker run", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await worker.runOnce();
    context.clock.set("2026-08-27T09:01:00.000Z");
    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    expect(sender.send).toHaveBeenCalledOnce();
    expect(context.repository.findById(message.id)?.status).toBe("sent");
  });

  it("sends an overdue pending message once after the worker starts late", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:02:00.000Z");
    const sender = new FakeMessageSender();
    const restartedWorker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(restartedWorker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      sendFailed: 0
    });

    const laterWorker = new SchedulerWorker(context.repository, sender, { clock: context.clock });
    await expect(laterWorker.runOnce()).resolves.toEqual(emptyRunResult);
    expect(sender.send).toHaveBeenCalledOnce();
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      sentAtUtc: "2026-08-27T09:02:00.000Z"
    });
  });

  it("does not send a message cancelled before its due time", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.service.cancel(message.id);
    context.clock.set("2026-08-27T09:02:00.000Z");
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    expect(sender.send).not.toHaveBeenCalled();
    expect(context.repository.findById(message.id)?.status).toBe("cancelled");
  });

  it("uses the updated scheduled time after a pending message is rescheduled", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T08:59:30.000Z");
    context.service.updateTime(message.id, {
      scheduledAtLocal: "2026-08-27T12:05",
      timezone: "Asia/Jerusalem"
    });
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    context.clock.set("2026-08-27T09:00:00.000Z");
    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    context.clock.set("2026-08-27T09:05:00.000Z");
    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      sendFailed: 0
    });

    expect(sender.send).toHaveBeenCalledOnce();
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      scheduledAtUtc: "2026-08-27T09:05:00.000Z",
      sentAtUtc: "2026-08-27T09:05:00.000Z"
    });
  });

  it("recovers stale processing messages and sends them once", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    expect(context.repository.claimNextDuePending(context.clock.now().toISOString())).toMatchObject({
      id: message.id,
      status: "processing"
    });

    context.clock.set("2026-08-27T09:10:00.000Z");
    const sender = new FakeMessageSender();
    const restartedWorker = new SchedulerWorker(context.repository, sender, {
      clock: context.clock,
      staleProcessingMs: 10 * 60 * 1_000
    });

    await expect(restartedWorker.runOnce()).resolves.toMatchObject({
      recoveredStaleProcessing: 1,
      claimed: 1,
      sent: 1,
      sendFailed: 0
    });

    await expect(restartedWorker.runOnce()).resolves.toEqual(emptyRunResult);
    expect(sender.send).toHaveBeenCalledOnce();
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      attempts: 1,
      sentAtUtc: "2026-08-27T09:10:00.000Z"
    });
  });

  it("does not recover fresh processing messages", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    context.repository.claimNextDuePending(context.clock.now().toISOString());
    context.clock.set("2026-08-27T09:09:59.000Z");
    const sender = new FakeMessageSender();
    const worker = new SchedulerWorker(context.repository, sender, {
      clock: context.clock,
      staleProcessingMs: 10 * 60 * 1_000
    });

    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);

    expect(sender.send).not.toHaveBeenCalled();
    expect(context.repository.findById(message.id)?.status).toBe("processing");
  });

  it("schedules retryable failures with backoff and does not reclaim before next attempt", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([{ success: false, errorCode: "transport_error", retryable: true }]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      sendFailed: 1,
      retryScheduled: 1,
      failed: 0
    });
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "pending",
      attempts: 1,
      nextAttemptAtUtc: "2026-08-27T09:00:10.000Z",
      lastError: "transport_error"
    });

    context.clock.set("2026-08-27T09:00:09.000Z");
    await expect(worker.runOnce()).resolves.toEqual(emptyRunResult);
    expect(sender.send).toHaveBeenCalledOnce();
  });

  it("marks terminal failures as failed immediately", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([{ success: false, errorCode: "invalid_recipient", retryable: false }]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      sendFailed: 1,
      retryScheduled: 0,
      failed: 1
    });

    expect(context.repository.findById(message.id)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "invalid_recipient"
    });
  });

  it("marks retryable failures as failed when max attempts is reached", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.db.prepare("UPDATE scheduled_messages SET attempts = ? WHERE id = ?").run(3, message.id);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([{ success: false, errorCode: "transport_error", retryable: true }]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      sendFailed: 1,
      retryScheduled: 0,
      failed: 1
    });

    expect(context.repository.findById(message.id)).toMatchObject({
      status: "failed",
      attempts: 4,
      lastError: "transport_error"
    });
  });

  it("sends successfully after retry and preserves the total attempt count", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([
      { success: false, errorCode: "transport_error", retryable: true },
      { success: true, providerMessageId: "provider-after-retry" }
    ]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await worker.runOnce();
    context.clock.set("2026-08-27T09:00:10.000Z");
    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      sendFailed: 0,
      retryScheduled: 0,
      failed: 0
    });

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(context.repository.findById(message.id)).toMatchObject({
      status: "sent",
      attempts: 2,
      providerMessageId: "provider-after-retry",
      sentAtUtc: "2026-08-27T09:00:10.000Z"
    });
  });

  it("sanitizes last_error and treats unknown failures as terminal by default", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([
      {
        success: false,
        errorCode: "auth/session payload: secret-token 123",
        retryable: undefined
      }
    ]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });

    await worker.runOnce();

    expect(context.repository.findById(message.id)).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "send_failed_sanitized"
    });
  });

  it("can be configured to retry unknown failures", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([{ success: false, errorCode: "unknown_provider_error" }]);
    const worker = new SchedulerWorker(context.repository, sender, {
      clock: context.clock,
      retryPolicy: { retryUnknownFailures: true }
    });

    await worker.runOnce();

    expect(context.repository.findById(message.id)).toMatchObject({
      status: "pending",
      attempts: 1,
      nextAttemptAtUtc: "2026-08-27T09:00:10.000Z",
      lastError: "unknown_provider_error"
    });
  });

  it("clears retry metadata when a pending retry is rescheduled", async () => {
    const context = createContext("2026-08-27T08:59:00.000Z");
    const message = createMessageDueAtNineUtc(context);
    context.clock.set("2026-08-27T09:00:00.000Z");
    const sender = new FakeMessageSender([{ success: false, errorCode: "transport_error", retryable: true }]);
    const worker = new SchedulerWorker(context.repository, sender, { clock: context.clock });
    await worker.runOnce();

    context.service.updateTime(message.id, {
      scheduledAtLocal: "2026-08-27T13:00",
      timezone: "Asia/Jerusalem"
    });

    expect(context.repository.findById(message.id)).toMatchObject({
      status: "pending",
      nextAttemptAtUtc: undefined,
      lastError: undefined
    });
  });

  it("migrates a Chunk 4 database and can claim existing pending messages", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-migrate-sqlite-"));
    const dbPath = path.join(tempDir, "timer-bot.sqlite");

    const oldDb = new Database(dbPath);
    let migratedDb: SqliteDatabase | undefined;

    try {
      oldDb.exec(`
        CREATE TABLE schema_migrations (
          id TEXT PRIMARY KEY,
          applied_at_utc TEXT NOT NULL
        );
      `);
      oldDb.exec(createScheduledMessagesMigration.sql);
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
          "legacy test",
          "2026-08-27T09:00:00.000Z",
          "Asia/Jerusalem",
          "pending",
          0,
          "2026-08-27T08:59:00.000Z",
          "2026-08-27T08:59:00.000Z"
        );
      oldDb
        .prepare("INSERT INTO schema_migrations (id, applied_at_utc) VALUES (?, ?)")
        .run(createScheduledMessagesMigration.id, "2026-08-27T08:59:00.000Z");
      oldDb.close();

      migratedDb = openAppDatabase(dbPath);
      const repository = new ScheduledMessageRepository(migratedDb);

      expect(repository.findById("legacy-message")).toMatchObject({
        status: "pending",
        nextAttemptAtUtc: undefined
      });
      expect(repository.claimNextDuePending("2026-08-27T09:00:00.000Z")).toMatchObject({
        id: "legacy-message",
        status: "processing"
      });
    } finally {
      if (oldDb.open) {
        oldDb.close();
      }
      if (migratedDb?.open) {
        migratedDb.close();
      }
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function createContext(nowIso: string): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-worker-sqlite-"));
  const db = openAppDatabase(path.join(tempDir, "timer-bot.sqlite"));
  const repository = new ScheduledMessageRepository(db);
  const clock = new MutableClock(new Date(nowIso));
  let nextId = 1;
  const service = new ScheduleService(repository, {
    clock,
    idGenerator: () => `test-id-${nextId++}`
  });
  const context = { db, repository, service, clock, tempDir };
  contexts.push(context);
  return context;
}

function createMessageDueAtNineUtc(context: TestContext): ScheduledMessage {
  return context.service.create({
    recipient: "+972501234567",
    text: "due message",
    scheduledAtLocal: "2026-08-27T12:00",
    timezone: "Asia/Jerusalem"
  });
}
