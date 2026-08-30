import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openAppDatabase } from "../../src/db/Database.js";
import { ScheduledMessageRepository } from "../../src/db/ScheduledMessageRepository.js";
import { startSingleUserService, type RunningSingleUserService } from "../../src/server/SingleUserService.js";
import type {
  NormalizedRecipient,
  RecipientOption,
  SendResult,
  WhatsAppAdapter,
  WhatsAppConnectionStatus
} from "../../src/whatsapp/WhatsAppAdapter.js";
import type { ConnectionController } from "../../src/server/ConnectionController.js";

class FakeWhatsAppAdapter implements WhatsAppAdapter {
  private status: WhatsAppConnectionStatus;
  readonly sentMessages: Array<{ recipient: NormalizedRecipient; text: string }> = [];
  readonly connect = vi.fn(async () => {
    this.status = "connected";
  });
  readonly disconnect = vi.fn(async () => {
    this.status = "idle";
  });

  constructor(status: WhatsAppConnectionStatus = "connected") {
    this.status = status;
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  getRecipientOptions(): RecipientOption[] {
    return [];
  }

  async sendText(recipient: NormalizedRecipient, text: string): Promise<SendResult> {
    this.sentMessages.push({ recipient, text });
    return { success: true, providerMessageId: `provider-${this.sentMessages.length}` };
  }
}

class FakeConnectionController implements ConnectionController {
  constructor(private readonly adapter: FakeWhatsAppAdapter) {}

  connect(): Promise<void> {
    return this.adapter.connect();
  }

  disconnect(): Promise<void> {
    return this.adapter.disconnect();
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.adapter.getStatus();
  }

  getQrTerminal(): string | undefined {
    return undefined;
  }

  getRecipientOptions(): RecipientOption[] {
    return [];
  }
}

interface TestContext {
  readonly tempDir: string;
  readonly dbPath: string;
  service?: RunningSingleUserService;
}

const contexts: TestContext[] = [];

describe("Single-user service", () => {
  afterEach(async () => {
    for (const context of contexts.splice(0)) {
      if (context.service !== undefined) {
        await context.service.stop();
      }
      fs.rmSync(context.tempDir, { recursive: true, force: true });
    }
  });

  it("runs migrations before worker polling and exposes health without sensitive data", async () => {
    const context = createContext();
    const adapter = new FakeWhatsAppAdapter("idle");
    context.service = await startSingleUserService({
      adapter,
      connection: new FakeConnectionController(adapter),
      databasePath: context.dbPath,
      port: 0,
      pollMs: 25,
      connectOnStart: false
    });

    const health = await requestHealth(context.service);

    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      ok: true,
      process: { alive: true },
      database: { reachable: true, migrated: true },
      whatsapp: { state: "degraded" }
    });
    expect(JSON.stringify(health.body)).not.toMatch(/972|@s\.whatsapp\.net|qr|auth|session|text/i);

    const db = openAppDatabase(context.dbPath);
    try {
      const migrations = db.prepare("SELECT id FROM schema_migrations ORDER BY id").all();
      expect(migrations).toEqual([{ id: "001_create_scheduled_messages" }, { id: "002_add_next_attempt_at" }]);
    } finally {
      db.close();
    }
  });

  it("keeps SQLite data across process-style restarts and does not duplicate a sent row", async () => {
    const context = createContext();
    insertDueMessage(context.dbPath, "restart-test-1");

    const firstAdapter = new FakeWhatsAppAdapter("connected");
    context.service = await startSingleUserService({
      adapter: firstAdapter,
      connection: new FakeConnectionController(firstAdapter),
      databasePath: context.dbPath,
      port: 0,
      pollMs: 25,
      connectOnStart: false
    });

    await waitForMessageStatus(context.dbPath, "restart-test-1", "sent");
    expect(firstAdapter.sentMessages).toHaveLength(1);
    await context.service.stop();
    context.service = undefined;

    const secondAdapter = new FakeWhatsAppAdapter("connected");
    context.service = await startSingleUserService({
      adapter: secondAdapter,
      connection: new FakeConnectionController(secondAdapter),
      databasePath: context.dbPath,
      port: 0,
      pollMs: 25,
      connectOnStart: false
    });

    await delay(75);
    expect(secondAdapter.sentMessages).toEqual([]);
    expect(readMessageStatus(context.dbPath, "restart-test-1")).toBe("sent");
  });

  it("rejects cleanly when the service port is already in use", async () => {
    const firstContext = createContext();
    const firstAdapter = new FakeWhatsAppAdapter("idle");
    firstContext.service = await startSingleUserService({
      adapter: firstAdapter,
      connection: new FakeConnectionController(firstAdapter),
      databasePath: firstContext.dbPath,
      port: 0,
      connectOnStart: false
    });

    const address = firstContext.service.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected service to listen on TCP.");
    }

    const secondContext = createContext();
    const secondAdapter = new FakeWhatsAppAdapter("idle");
    await expect(
      startSingleUserService({
        adapter: secondAdapter,
        connection: new FakeConnectionController(secondAdapter),
        databasePath: secondContext.dbPath,
        host: "127.0.0.1",
        port: address.port,
        connectOnStart: false
      })
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });
});

function createContext(): TestContext {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-service-"));
  const context = {
    tempDir,
    dbPath: path.join(tempDir, "timer-bot.sqlite")
  };
  contexts.push(context);
  return context;
}

function insertDueMessage(databasePath: string, id: string): void {
  const db = openAppDatabase(databasePath);
  try {
    new ScheduledMessageRepository(db).create({
      id,
      recipient: "972501234567",
      recipientJid: "972501234567@s.whatsapp.net",
      text: "restart-safe message",
      scheduledAtUtc: "2026-08-27T09:00:00.000Z",
      timezone: "Asia/Jerusalem",
      createdAtUtc: "2026-08-27T08:00:00.000Z",
      updatedAtUtc: "2026-08-27T08:00:00.000Z"
    });
  } finally {
    db.close();
  }
}

async function requestHealth(service: RunningSingleUserService): Promise<{ status: number; body: any }> {
  const address = service.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected service to listen on TCP.");
  }

  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  return {
    status: response.status,
    body: await response.json()
  };
}

async function waitForMessageStatus(databasePath: string, id: string, status: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (readMessageStatus(databasePath, id) === status) {
      return;
    }
    await delay(25);
  }

  throw new Error(`Timed out waiting for ${id} to reach ${status}.`);
}

function readMessageStatus(databasePath: string, id: string): string | undefined {
  const db = openAppDatabase(databasePath);
  try {
    return new ScheduledMessageRepository(db).findById(id)?.status;
  } finally {
    db.close();
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
