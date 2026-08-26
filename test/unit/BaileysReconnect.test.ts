import { Boom } from "@hapi/boom";
import { DisconnectReason, type ConnectionState } from "@whiskeysockets/baileys";
import { describe, expect, it } from "vitest";

import { shouldReconnectBaileys } from "../../src/whatsapp/BaileysConnectionState.js";

function closeUpdate(statusCode: DisconnectReason): Partial<ConnectionState> {
  return {
    connection: "close",
    lastDisconnect: {
      date: new Date("2026-08-24T00:00:00.000Z"),
      error: new Boom("closed", { statusCode })
    }
  };
}

describe("shouldReconnectBaileys", () => {
  it("reconnects when Baileys says restart is required", () => {
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.restartRequired))).toBe(true);
  });

  it("reconnects after temporary connection closes", () => {
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.connectionClosed))).toBe(true);
  });

  it("does not reconnect when the session is logged out", () => {
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.loggedOut))).toBe(false);
  });

  it("does not reconnect when the session needs manual attention", () => {
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.badSession))).toBe(false);
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.multideviceMismatch))).toBe(false);
    expect(shouldReconnectBaileys(closeUpdate(DisconnectReason.forbidden))).toBe(false);
  });

  it("does not reconnect for non-close updates", () => {
    expect(shouldReconnectBaileys({ connection: "open" })).toBe(false);
  });
});
