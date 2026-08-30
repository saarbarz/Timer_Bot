import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ConnectionController } from "../../src/server/ConnectionController.js";
import { UserSessionManager, type UserSession } from "../../src/server/UserSessionManager.js";
import type {
  NormalizedRecipient,
  RecipientOption,
  SendResult,
  WhatsAppAdapter,
  WhatsAppConnectionStatus
} from "../../src/whatsapp/WhatsAppAdapter.js";

class FakeAdapter implements WhatsAppAdapter {
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  getStatus(): WhatsAppConnectionStatus {
    return "connected";
  }
  getRecipientOptions(): RecipientOption[] {
    return [];
  }
  async sendText(_recipient: NormalizedRecipient, _text: string): Promise<SendResult> {
    return { success: true };
  }
}

class FakeConnection implements ConnectionController {
  private status: WhatsAppConnectionStatus = "connected";
  readonly connect = vi.fn(async () => {});
  readonly disconnect = vi.fn(async () => {
    this.status = "idle";
  });
  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }
  getQrTerminal(): string | undefined {
    return undefined;
  }
  getRecipientOptions(): RecipientOption[] {
    return [];
  }
}

describe("UserSessionManager", () => {
  it("creates isolated sessions under per-user auth directories", () => {
    const created: UserSession[] = [];
    const manager = new UserSessionManager({
      userIds: ["test-user-a", "test-user-b"],
      authRootDir: "C:\\timer-bot\\auth\\users",
      createSession: (userId, authDir) => {
        const session = {
          userId,
          authDir,
          adapter: new FakeAdapter(),
          connection: new FakeConnection(),
          getReconnectCount: () => 0
        };
        created.push(session);
        return session;
      }
    });

    expect(manager.get("test-user-a").authDir).toBe(path.join("C:\\timer-bot\\auth\\users", "test-user-a"));
    expect(manager.get("test-user-b").authDir).toBe(path.join("C:\\timer-bot\\auth\\users", "test-user-b"));
    expect(manager.get("test-user-a")).toBe(created[0]);
    expect(created).toHaveLength(2);
  });

  it("rejects unknown user ids and reports sanitized metrics", () => {
    const manager = new UserSessionManager({
      userIds: ["test-user-a"],
      createSession: (userId, authDir) => ({
        userId,
        authDir,
        adapter: new FakeAdapter(),
        connection: new FakeConnection(),
        getReconnectCount: () => 2
      })
    });

    manager.get("test-user-a");

    expect(() => manager.get("unexpected-user")).toThrow("Unknown local user id.");
    expect(manager.metrics()).toMatchObject({
      activeSessionCount: 1,
      sessions: [{ userId: "test-user-a", status: "connected", reconnects: 2 }]
    });
    expect(JSON.stringify(manager.metrics())).not.toMatch(/@s\.whatsapp\.net|qr|auth|text|creds/i);
  });

  it("disconnects one user session without touching the other session", async () => {
    const manager = new UserSessionManager({
      userIds: ["test-user-a", "test-user-b"],
      createSession: (userId, authDir) => ({
        userId,
        authDir,
        adapter: new FakeAdapter(),
        connection: new FakeConnection(),
        getReconnectCount: () => 0
      })
    });
    const sessionA = manager.get("test-user-a");
    const sessionB = manager.get("test-user-b");

    await manager.disconnect("test-user-a");

    expect(sessionA.connection.getStatus()).toBe("idle");
    expect(sessionB.connection.getStatus()).toBe("connected");
  });
});
