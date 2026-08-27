import type { ScheduledMessage } from "../domain/ScheduledMessage.js";

export type MessageSendResult =
  | {
      readonly success: true;
      readonly providerMessageId?: string;
    }
  | {
      readonly success: false;
      readonly errorCode: string;
      readonly retryable?: boolean;
    };

export interface MessageSender {
  send(message: ScheduledMessage): Promise<MessageSendResult>;
}
