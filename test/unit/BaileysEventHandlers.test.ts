import type { BaileysEventMap } from "@whiskeysockets/baileys";
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

  it("saves credentials when creds.update fires", () => {
    const events = new FakeBaileysEvents();
    const saveCredentials = vi.fn();

    registerBaileysEventHandlers(events, saveCredentials, {
      onConnectionUpdate: vi.fn(),
      onQr: vi.fn()
    });

    events.emit("creds.update", {});

    expect(saveCredentials).toHaveBeenCalledOnce();
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
});
