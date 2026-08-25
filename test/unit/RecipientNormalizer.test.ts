import { describe, expect, it } from "vitest";

import { normalizeRecipient } from "../../src/whatsapp/RecipientNormalizer.js";

describe("normalizeRecipient", () => {
  it("normalizes an Israeli number with a leading plus", () => {
    expect(normalizeRecipient("+972501234567")).toEqual({
      success: true,
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      }
    });
  });

  it("removes spaces and hyphens while preserving the country code", () => {
    expect(normalizeRecipient("+972 50-123-4567")).toEqual({
      success: true,
      recipient: {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      }
    });
  });

  it("rejects group recipients for Chunk 2", () => {
    expect(normalizeRecipient("12345@g.us")).toEqual({
      success: false,
      errorCode: "group_recipient_unsupported"
    });
  });
});
