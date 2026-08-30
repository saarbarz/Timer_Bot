import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionController } from "../../src/server/ConnectionController.js";
import { createLocalWebServer } from "../../src/server/LocalWebServer.js";
import type { RecipientOption } from "../../src/whatsapp/WhatsAppAdapter.js";

interface TestContext {
  readonly tempDir: string;
  readonly dbPath: string;
  readonly server: http.Server;
  readonly baseUrl: string;
  readonly connection: FakeConnectionController;
}

class FakeConnectionController implements ConnectionController {
  readonly connect = vi.fn(async () => {
    this.status = "awaiting_qr";
    this.qr = "terminal qr";
  });
  readonly disconnect = vi.fn(async () => {});

  private status: ReturnType<ConnectionController["getStatus"]> = "idle";
  private qr: string | undefined;
  private recipientOptions: RecipientOption[] = [];

  getStatus(): ReturnType<ConnectionController["getStatus"]> {
    return this.status;
  }

  getQrTerminal(): string | undefined {
    return this.qr;
  }

  getRecipientOptions(): RecipientOption[] {
    return this.recipientOptions;
  }

  setRecipientOptions(recipientOptions: RecipientOption[]): void {
    this.recipientOptions = recipientOptions;
  }
}

let context: TestContext | undefined;

describe("Local web server", () => {
  beforeEach(async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-web-"));
    const dbPath = path.join(tempDir, "timer-bot.sqlite");
    const connection = new FakeConnectionController();
    const server = createLocalWebServer({ databasePath: dbPath, connection });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected server to listen on a TCP port.");
    }

    context = {
      tempDir,
      dbPath,
      server,
      baseUrl: `http://127.0.0.1:${address.port}`,
      connection
    };
  });

  afterEach(async () => {
    if (context !== undefined) {
      await new Promise<void>((resolve, reject) => {
        context?.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      fs.rmSync(context.tempDir, { recursive: true, force: true });
      context = undefined;
    }
  });

  it("serves the local UI", async () => {
    const response = await fetch(`${current().baseUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Timer Bot");
    expect(html).toContain("Schedule Message");
    expect(html).toContain("recipientOptions");
  });

  it("creates, lists, updates, and cancels scheduled messages through the API", async () => {
    const created = await api("POST", "/api/messages", {
      recipient: "+972501234567",
      text: "web test",
      scheduledAtLocal: "2026-12-15T12:00",
      timezone: "Asia/Jerusalem"
    });

    expect(created.status).toBe(201);
    expect(created.body.message).toMatchObject({
      recipient: "972501234567",
      text: "web test",
      status: "pending",
      scheduledAtLocal: "2026-12-15T12:00:00",
      scheduledAtUtc: "2026-12-15T10:00:00.000Z"
    });

    const id = String(created.body.message.id);
    const updated = await api("PATCH", `/api/messages/${id}`, {
      text: "updated web test",
      scheduledAtLocal: "2026-12-15T12:05",
      timezone: "Asia/Jerusalem"
    });

    expect(updated.status).toBe(200);
    expect(updated.body.message).toMatchObject({
      text: "updated web test",
      scheduledAtLocal: "2026-12-15T12:05:00",
      scheduledAtUtc: "2026-12-15T10:05:00.000Z"
    });

    const listed = await api("GET", "/api/messages");
    expect(listed.status).toBe(200);
    expect(listed.body.messages).toHaveLength(1);
    expect(listed.body.messages[0]).toMatchObject({ id, text: "updated web test" });

    const cancelled = await api("DELETE", `/api/messages/${id}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.message).toMatchObject({ id, status: "cancelled" });
  });

  it("returns 4xx for invalid schedule requests", async () => {
    const invalidRecipient = await api("POST", "/api/messages", {
      recipient: "not-a-number",
      text: "web test",
      scheduledAtLocal: "2026-12-15T12:00",
      timezone: "Asia/Jerusalem"
    });
    expect(invalidRecipient.status).toBe(400);
    expect(invalidRecipient.body).toMatchObject({ errorCode: "invalid_recipient" });

    const emptyText = await api("POST", "/api/messages", {
      recipient: "+972501234567",
      text: "",
      scheduledAtLocal: "2026-12-15T12:00",
      timezone: "Asia/Jerusalem"
    });
    expect(emptyText.status).toBe(400);
    expect(emptyText.body).toMatchObject({ errorCode: "empty_text" });
  });

  it("exposes optional recipient options and still accepts manual recipients when empty", async () => {
    current().connection.setRecipientOptions([
      {
        displayName: "Recent Person",
        recipient: {
          phoneNumber: "972501234567",
          jid: "972501234567@s.whatsapp.net"
        },
        source: "chat",
        lastSeenAtUtc: "2026-12-15T09:00:00.000Z"
      }
    ]);

    const recipients = await api("GET", "/api/recipients");
    expect(recipients.status).toBe(200);
    expect(recipients.body.recipients).toEqual([
      {
        displayName: "Recent Person",
        recipient: "972501234567",
        jid: "972501234567@s.whatsapp.net",
        source: "chat",
        lastSeenAtUtc: "2026-12-15T09:00:00.000Z"
      }
    ]);

    current().connection.setRecipientOptions([]);
    const emptyRecipients = await api("GET", "/api/recipients");
    expect(emptyRecipients.body).toEqual({ recipients: [] });

    const created = await api("POST", "/api/messages", {
      recipient: "+972509999999",
      text: "manual fallback",
      scheduledAtLocal: "2026-12-15T12:00",
      timezone: "Asia/Jerusalem"
    });
    expect(created.status).toBe(201);
    expect(created.body.message).toMatchObject({
      recipient: "972509999999",
      text: "manual fallback",
      status: "pending"
    });
  });

  it("exposes connection status and QR through memory-only endpoints", async () => {
    const initial = await api("GET", "/api/connection");
    expect(initial.body).toEqual({ status: "idle", qrAvailable: false });

    const connected = await api("POST", "/api/connection/connect");
    expect(connected.body).toEqual({ status: "awaiting_qr", qrAvailable: true });
    expect(current().connection.connect).toHaveBeenCalledOnce();

    const qr = await api("GET", "/api/connection/qr");
    expect(qr.body).toEqual({ status: "awaiting_qr", qr: "terminal qr" });
  });
});

async function api(method: string, pathName: string, body?: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`${current().baseUrl}${pathName}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

function current(): TestContext {
  if (context === undefined) {
    throw new Error("Test context has not been created.");
  }

  return context;
}
