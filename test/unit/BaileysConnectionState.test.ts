import { Boom } from "@hapi/boom";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { describe, expect, it } from "vitest";

import { mapBaileysConnectionUpdate } from "../../src/whatsapp/BaileysConnectionState.js";

describe("mapBaileysConnectionUpdate", () => {
  it("maps QR updates to awaiting_qr", () => {
    expect(mapBaileysConnectionUpdate({ qr: "redacted-test-qr" })).toBe("awaiting_qr");
  });

  it("maps open connections to connected", () => {
    expect(mapBaileysConnectionUpdate({ connection: "open" })).toBe("connected");
  });

  it("maps logged out closes to needs_relink", () => {
    expect(
      mapBaileysConnectionUpdate({
        connection: "close",
        lastDisconnect: {
          date: new Date("2026-08-24T00:00:00.000Z"),
          error: new Boom("logged out", { statusCode: DisconnectReason.loggedOut })
        }
      })
    ).toBe("needs_relink");
  });

  it("maps temporary closes to reconnect_needed", () => {
    expect(
      mapBaileysConnectionUpdate({
        connection: "close",
        lastDisconnect: {
          date: new Date("2026-08-24T00:00:00.000Z"),
          error: new Boom("temporary close", { statusCode: DisconnectReason.connectionClosed })
        }
      })
    ).toBe("reconnect_needed");
  });
});
