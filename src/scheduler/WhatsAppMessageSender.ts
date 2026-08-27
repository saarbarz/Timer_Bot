import type { ScheduledMessage } from "../domain/ScheduledMessage.js";
import type { MessageSendResult, MessageSender } from "./MessageSender.js";
import type { WhatsAppAdapter } from "../whatsapp/WhatsAppAdapter.js";

export class WhatsAppMessageSender implements MessageSender {
  constructor(private readonly adapter: Pick<WhatsAppAdapter, "sendText">) {}

  async send(message: ScheduledMessage): Promise<MessageSendResult> {
    const result = await this.adapter.sendText(
      {
        phoneNumber: message.recipient,
        jid: message.recipientJid
      },
      message.text
    );

    if (result.success) {
      return {
        success: true,
        providerMessageId: result.providerMessageId
      };
    }

    return {
      success: false,
      errorCode: result.errorCode ?? "transport_error",
      retryable: result.retryable
    };
  }
}
