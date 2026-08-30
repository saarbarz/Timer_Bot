import { Boom } from "@hapi/boom";
import { DisconnectReason, type BaileysEventMap } from "@whiskeysockets/baileys";
import { describe, expect, it, vi } from "vitest";

import { registerBaileysEventHandlers } from "../../src/whatsapp/BaileysWhatsAppAdapter.js";

class FakeBaileysEvents {
  private readonly listeners = new Map<keyof BaileysEventMap, Array<(arg: never) => void>>();

  on<T extends keyof BaileysEventMap>(event: T, listener: (arg: BaileysEventMap[T]) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as (arg: never) => void);
    this.listeners.set(event, listeners);
  }

  emit<T extends keyof BaileysEventMap>(event: T, arg: BaileysEventMap[T]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(arg as never);
    }
  }

  listenerCount(event: keyof BaileysEventMap): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}

describe("registerBaileysEventHandlers", () => {
  it("registers the credentials update handler", () => {
    const events = new FakeBaileysEvents();

    registerBaileysEventHandlers(events, vi.fn(), {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn()
    });

    expect(events.listenerCount("creds.update")).toBe(1);
  });

  it("saves credentials when creds.update fires", async () => {
    const events = new FakeBaileysEvents();
    const saveCredentials = vi.fn(async () => undefined);

    registerBaileysEventHandlers(events, saveCredentials, {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn()
    });

    events.emit("creds.update", {});
    await Promise.resolve();

    expect(saveCredentials).toHaveBeenCalledOnce();
  });

  it("reports credentials save errors", async () => {
    const events = new FakeBaileysEvents();
    const error = new Error("test disk failure");
    const onCredentialsSaveError = vi.fn();

    registerBaileysEventHandlers(events, vi.fn(async () => Promise.reject(error)), {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn(),
      onCredentialsSaveError
    });

    events.emit("creds.update", {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onCredentialsSaveError).toHaveBeenCalledWith(error);
  });

  it("renders QR and forwards connection updates", () => {
    const events = new FakeBaileysEvents();
    const onQr = vi.fn();
    const onConnectionUpdate = vi.fn();

    registerBaileysEventHandlers(events, vi.fn(), {
      onConnectionUpdate,
      onQr
    });

    events.emit("connection.update", { qr: "redacted-test-qr" });

    expect(onQr).toHaveBeenCalledWith("redacted-test-qr");
    expect(onConnectionUpdate).toHaveBeenCalledWith({ qr: "redacted-test-qr" });
  });

  it("reports sanitized close status codes for connection diagnostics", () => {
    const events = new FakeBaileysEvents();
    const onConnectionClose = vi.fn();

    registerBaileysEventHandlers(events, vi.fn(), {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn(),
      onConnectionClose
    });

    events.emit("connection.update", {
      connection: "close",
      lastDisconnect: {
        date: new Date("2026-08-30T00:00:00.000Z"),
        error: new Boom("closed", { statusCode: DisconnectReason.connectionClosed })
      }
    });

    expect(onConnectionClose).toHaveBeenCalledWith(DisconnectReason.connectionClosed);
  });

  it("forwards history contacts, chats, and LID mappings", () => {
    const events = new FakeBaileysEvents();
    const onContacts = vi.fn();
    const onChats = vi.fn();

    registerBaileysEventHandlers(events, vi.fn(), {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn(),
      onContacts,
      onChats
    });

    const contacts = [{ id: "123456789012345@lid", name: "Test Contact" }];
    const chats = [{ id: "123456789012345@lid" }];
    const lidPnMappings = [{ lid: "123456789012345@lid", pn: "972501234567@s.whatsapp.net" }];
    events.emit("messaging-history.set", {
      contacts,
      chats,
      messages: [],
      lidPnMappings
    });

    expect(onContacts).toHaveBeenCalledWith(contacts, lidPnMappings);
    expect(onChats).toHaveBeenCalledWith(chats, lidPnMappings);
  });

  it("forwards message upsert events for recent-recipient collection", () => {
    const events = new FakeBaileysEvents();
    const onMessages = vi.fn();

    registerBaileysEventHandlers(events, vi.fn(), {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn(),
      onMessages
    });

    const messages = [
      {
        key: {
          remoteJid: "972501234567@s.whatsapp.net"
        },
        messageTimestamp: 1_798_000_000
      }
    ];
    events.emit("messages.upsert", { messages, type: "notify" });

    expect(onMessages).toHaveBeenCalledWith(messages);
  });
});
