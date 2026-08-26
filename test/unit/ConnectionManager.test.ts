import { Boom } from "@hapi/boom";
import { DisconnectReason, type ConnectionState } from "@whiskeysockets/baileys";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionManager } from "../../src/whatsapp/ConnectionManager.js";
import type { WhatsAppLogger } from "../../src/whatsapp/WhatsAppAdapter.js";

function closeUpdate(statusCode: DisconnectReason): Partial<ConnectionState> {
  return {
    connection: "close",
    lastDisconnect: {
      date: new Date("2026-08-26T00:00:00.000Z"),
      error: new Boom("closed", { statusCode })
    }
  };
}

describe("ConnectionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the expected bounded backoff sequence for temporary disconnects", async () => {
    vi.useFakeTimers();

    const openConnection = vi.fn(async () => undefined);
    const manager = new ConnectionManager({
      openConnection,
      closeConnection: vi.fn(async () => undefined),
      log: vi.fn() as WhatsAppLogger,
      reconnectDelaysMs: [1_000, 2_000, 5_000],
      jitterRatio: 0
    });

    await manager.start();
    expect(openConnection).toHaveBeenCalledTimes(1);

    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.connectionClosed));
    await vi.advanceTimersByTimeAsync(999);
    expect(openConnection).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(openConnection).toHaveBeenCalledTimes(2);

    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.connectionLost));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(openConnection).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(openConnection).toHaveBeenCalledTimes(3);

    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.restartRequired));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(openConnection).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(openConnection).toHaveBeenCalledTimes(4);
  });

  it("does not reconnect when Baileys reports a relink-required close", async () => {
    vi.useFakeTimers();

    const openConnection = vi.fn(async () => undefined);
    const manager = new ConnectionManager({
      openConnection,
      closeConnection: vi.fn(async () => undefined),
      log: vi.fn() as WhatsAppLogger,
      reconnectDelaysMs: [1_000],
      jitterRatio: 0
    });

    await manager.start();
    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.loggedOut));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(manager.getStatus()).toBe("needs_relink");
    expect(openConnection).toHaveBeenCalledTimes(1);
  });

  it("shutdown cancels reconnect timers and closes the active connection", async () => {
    vi.useFakeTimers();

    const openConnection = vi.fn(async () => undefined);
    const closeConnection = vi.fn(async () => undefined);
    const manager = new ConnectionManager({
      openConnection,
      closeConnection,
      log: vi.fn() as WhatsAppLogger,
      reconnectDelaysMs: [1_000],
      jitterRatio: 0
    });

    await manager.start();
    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.connectionClosed));
    await manager.shutdown();
    manager.handleConnectionUpdate(closeUpdate(DisconnectReason.connectionLost));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(openConnection).toHaveBeenCalledTimes(1);
    expect(closeConnection).toHaveBeenCalledOnce();
    expect(manager.getStatus()).toBe("idle");
  });
});
