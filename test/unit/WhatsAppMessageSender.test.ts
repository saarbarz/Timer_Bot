import { describe, expect, it, vi } from "vitest";

import type { ScheduledMessage } from "../../src/domain/ScheduledMessage.js";
import { WhatsAppMessageSender } from "../../src/scheduler/WhatsAppMessageSender.js";

describe("WhatsAppMessageSender", () => {
  it("sends scheduled messages through the WhatsApp adapter without renormalizing", async () => {
    const sendText = vi.fn(async () => ({ success: true as const, providerMessageId: "provider-id-1" }));
    const sender = new WhatsAppMessageSender({ sendText });

    await expect(sender.send(createMessage())).resolves.toEqual({
      success: true,
      providerMessageId: "provider-id-1"
    });

    expect(sendText).toHaveBeenCalledWith(
      {
        phoneNumber: "972501234567",
        jid: "972501234567@s.whatsapp.net"
      },
      "scheduled test"
    );
  });

  it("passes adapter failure classification through to the worker contract", async () => {
    const sendText = vi.fn(async () => ({
      success: false as const,
      errorCode: "not_connected" as const,
      retryable: true
    }));
    const sender = new WhatsAppMessageSender({ sendText });

    await expect(sender.send(createMessage())).resolves.toEqual({
      success: false,
      errorCode: "not_connected",
      retryable: true
    });
  });
});

function createMessage(): ScheduledMessage {
  return {
    id: "message-id-1",
    recipient: "972501234567",
    recipientJid: "972501234567@s.whatsapp.net",
    text: "scheduled test",
    scheduledAtUtc: "2026-08-27T09:00:00.000Z",
    timezone: "Asia/Jerusalem",
    status: "processing",
    attempts: 0,
    createdAtUtc: "2026-08-27T08:59:00.000Z",
    updatedAtUtc: "2026-08-27T09:00:00.000Z"
  };
}
