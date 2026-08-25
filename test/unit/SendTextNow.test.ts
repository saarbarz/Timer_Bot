import { describe, expect, it, vi } from "vitest";

import { sendTextNow } from "../../src/whatsapp/SendTextNow.js";
import type { NormalizedRecipient, SendResult, WhatsAppAdapter } from "../../src/whatsapp/WhatsAppAdapter.js";

describe("sendTextNow", () => {
  it("rejects empty text without calling the adapter", async () => {
    const adapter = createAdapterMock(async () => ({ success: true }));

    await expect(sendTextNow(adapter, { to: "+972501234567", text: "   " })).resolves.toEqual({
      success: false,
      errorCode: "empty_text",
      retryable: false
    });

    expect(adapter.sendText).not.toHaveBeenCalled();
  });

  it("calls the adapter exactly once for a valid text message", async () => {
    const adapter = createAdapterMock(async () => ({
      success: true,
      providerMessageId: "test-provider-message-id"
    }));

    const result = await sendTextNow(adapter, { to: "+972 50-123-4567", text: "test message" });

    expect(result).toEqual({
      success: true,
      providerMessageId: "test-provider-message-id"
    });
    expect(adapter.sendText).toHaveBeenCalledOnce();
    expect(adapter.sendText).toHaveBeenCalledWith(
      {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      "test message"
    );
  });

  it("translates transport exceptions into a send result", async () => {
    const adapter = createAdapterMock(async () => {
      throw new Error("socket closed");
    });

    await expect(sendTextNow(adapter, { to: "+972501234567", text: "test message" })).resolves.toEqual({
      success: false,
      errorCode: "transport_error",
      retryable: true
    });
  });
});

function createAdapterMock(
  implementation: (recipient: NormalizedRecipient, text: string) => Promise<SendResult>
): Pick<WhatsAppAdapter, "sendText"> {
  return {
    sendText: vi.fn(implementation)
  };
}
