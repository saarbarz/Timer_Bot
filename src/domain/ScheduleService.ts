import { randomUUID } from "node:crypto";

import type { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { normalizeRecipient } from "../whatsapp/RecipientNormalizer.js";
import type { Clock } from "./Clock.js";
import { systemClock } from "./Clock.js";
import type { ScheduledMessage } from "./ScheduledMessage.js";
import { localDateTimeToUtc } from "./Timezone.js";

export type ScheduleErrorCode =
  | "empty_recipient"
  | "invalid_recipient"
  | "group_recipient_unsupported"
  | "empty_text"
  | "invalid_timezone"
  | "invalid_scheduled_time"
  | "scheduled_time_in_past"
  | "scheduled_message_not_found"
  | "scheduled_message_not_pending";

export class ScheduleError extends Error {
  constructor(readonly code: ScheduleErrorCode, message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

export interface CreateScheduledMessageInput {
  readonly recipient: string;
  readonly text: string;
  readonly scheduledAtLocal: string;
  readonly timezone: string;
}

export interface UpdateScheduledMessageTimeInput {
  readonly scheduledAtLocal: string;
  readonly timezone: string;
}

export interface ScheduleServiceOptions {
  readonly clock?: Clock;
  readonly idGenerator?: () => string;
}

export class ScheduleService {
  private readonly clock: Clock;
  private readonly idGenerator: () => string;

  constructor(
    private readonly repository: ScheduledMessageRepository,
    options: ScheduleServiceOptions = {}
  ) {
    this.clock = options.clock ?? systemClock;
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  create(input: CreateScheduledMessageInput): ScheduledMessage {
    const normalized = normalizeRecipient(input.recipient);
    if (!normalized.success) {
      throw new ScheduleError(toRecipientScheduleErrorCode(normalized.errorCode), "Recipient is invalid.");
    }

    if (input.text.trim().length === 0) {
      throw new ScheduleError("empty_text", "Text is required.");
    }

    const now = this.clock.now();
    const scheduledAtUtc = parseFutureScheduledTime(input.scheduledAtLocal, input.timezone, now);
    const nowIso = now.toISOString();

    return this.repository.create({
      id: this.idGenerator(),
      recipient: normalized.recipient.phoneNumber,
      recipientJid: normalized.recipient.jid,
      text: input.text,
      scheduledAtUtc: scheduledAtUtc.toISOString(),
      timezone: input.timezone,
      createdAtUtc: nowIso,
      updatedAtUtc: nowIso
    });
  }

  list(): ScheduledMessage[] {
    return this.repository.list();
  }

  cancel(id: string): ScheduledMessage {
    const existing = this.getExisting(id);
    if (existing.status !== "pending") {
      throw new ScheduleError("scheduled_message_not_pending", "Only pending messages can be cancelled.");
    }

    const cancelled = this.repository.cancelPending(id, this.clock.now().toISOString());
    if (cancelled === undefined) {
      throw new ScheduleError("scheduled_message_not_pending", "Only pending messages can be cancelled.");
    }

    return cancelled;
  }

  updateTime(id: string, input: UpdateScheduledMessageTimeInput): ScheduledMessage {
    const existing = this.getExisting(id);
    if (existing.status !== "pending") {
      throw new ScheduleError("scheduled_message_not_pending", "Only pending messages can be rescheduled.");
    }

    const now = this.clock.now();
    const scheduledAtUtc = parseFutureScheduledTime(input.scheduledAtLocal, input.timezone, now);
    const updated = this.repository.updatePendingSchedule(
      id,
      scheduledAtUtc.toISOString(),
      input.timezone,
      now.toISOString()
    );

    if (updated === undefined) {
      throw new ScheduleError("scheduled_message_not_pending", "Only pending messages can be rescheduled.");
    }

    return updated;
  }

  private getExisting(id: string): ScheduledMessage {
    const existing = this.repository.findById(id);
    if (existing === undefined) {
      throw new ScheduleError("scheduled_message_not_found", "Scheduled message was not found.");
    }

    return existing;
  }
}

function parseFutureScheduledTime(localDateTime: string, timezone: string, now: Date): Date {
  let scheduledAtUtc: Date;

  try {
    scheduledAtUtc = localDateTimeToUtc(localDateTime, timezone);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scheduled time is invalid.";
    const code = message.startsWith("Invalid timezone") ? "invalid_timezone" : "invalid_scheduled_time";
    throw new ScheduleError(code, message);
  }

  if (scheduledAtUtc.getTime() <= now.getTime()) {
    throw new ScheduleError("scheduled_time_in_past", "Scheduled time must be in the future.");
  }

  return scheduledAtUtc;
}

function toRecipientScheduleErrorCode(errorCode: string): ScheduleErrorCode {
  if (
    errorCode === "empty_recipient" ||
    errorCode === "invalid_recipient" ||
    errorCode === "group_recipient_unsupported"
  ) {
    return errorCode;
  }

  return "invalid_recipient";
}
