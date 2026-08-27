export const scheduledMessageStatuses = ["pending", "processing", "sent", "failed", "cancelled"] as const;

export type ScheduledMessageStatus = (typeof scheduledMessageStatuses)[number];

export interface ScheduledMessage {
  readonly id: string;
  readonly recipient: string;
  readonly recipientJid: string;
  readonly text: string;
  readonly scheduledAtUtc: string;
  readonly timezone: string;
  readonly status: ScheduledMessageStatus;
  readonly attempts: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  readonly nextAttemptAtUtc?: string;
  readonly sentAtUtc?: string;
  readonly lastError?: string;
  readonly providerMessageId?: string;
}
