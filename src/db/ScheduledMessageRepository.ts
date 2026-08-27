import type Database from "better-sqlite3";

import type { ScheduledMessage, ScheduledMessageStatus } from "../domain/ScheduledMessage.js";

interface ScheduledMessageRow {
  readonly id: string;
  readonly recipient: string;
  readonly recipient_jid: string;
  readonly text: string;
  readonly scheduled_at_utc: string;
  readonly timezone: string;
  readonly status: ScheduledMessageStatus;
  readonly attempts: number;
  readonly created_at_utc: string;
  readonly updated_at_utc: string;
  readonly sent_at_utc: string | null;
  readonly last_error: string | null;
  readonly provider_message_id: string | null;
}

export interface NewScheduledMessageRecord {
  readonly id: string;
  readonly recipient: string;
  readonly recipientJid: string;
  readonly text: string;
  readonly scheduledAtUtc: string;
  readonly timezone: string;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export class ScheduledMessageRepository {
  constructor(private readonly db: Database.Database) {}

  create(record: NewScheduledMessageRecord): ScheduledMessage {
    this.db
      .prepare<
        [
          string,
          string,
          string,
          string,
          string,
          string,
          ScheduledMessageStatus,
          number,
          string,
          string
        ]
      >(
        `
          INSERT INTO scheduled_messages (
            id,
            recipient,
            recipient_jid,
            text,
            scheduled_at_utc,
            timezone,
            status,
            attempts,
            created_at_utc,
            updated_at_utc
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.id,
        record.recipient,
        record.recipientJid,
        record.text,
        record.scheduledAtUtc,
        record.timezone,
        "pending",
        0,
        record.createdAtUtc,
        record.updatedAtUtc
      );

    const created = this.findById(record.id);
    if (created === undefined) {
      throw new Error("Scheduled message was not found after insert.");
    }

    return created;
  }

  findById(id: string): ScheduledMessage | undefined {
    const row = this.db
      .prepare<[string], ScheduledMessageRow>("SELECT * FROM scheduled_messages WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : mapScheduledMessage(row);
  }

  list(): ScheduledMessage[] {
    return this.db
      .prepare<[], ScheduledMessageRow>(
        `
          SELECT *
          FROM scheduled_messages
          ORDER BY scheduled_at_utc ASC, created_at_utc ASC
        `
      )
      .all()
      .map(mapScheduledMessage);
  }

  cancelPending(id: string, updatedAtUtc: string): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string]>(
        `
          UPDATE scheduled_messages
          SET status = 'cancelled', updated_at_utc = ?
          WHERE id = ? AND status = 'pending'
        `
      )
      .run(updatedAtUtc, id);

    return result.changes === 0 ? undefined : this.findById(id);
  }

  updatePendingSchedule(
    id: string,
    scheduledAtUtc: string,
    timezone: string,
    updatedAtUtc: string
  ): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string, string, string]>(
        `
          UPDATE scheduled_messages
          SET scheduled_at_utc = ?, timezone = ?, updated_at_utc = ?
          WHERE id = ? AND status = 'pending'
        `
      )
      .run(scheduledAtUtc, timezone, updatedAtUtc, id);

    return result.changes === 0 ? undefined : this.findById(id);
  }
}

function mapScheduledMessage(row: ScheduledMessageRow): ScheduledMessage {
  return {
    id: row.id,
    recipient: row.recipient,
    recipientJid: row.recipient_jid,
    text: row.text,
    scheduledAtUtc: row.scheduled_at_utc,
    timezone: row.timezone,
    status: row.status,
    attempts: row.attempts,
    createdAtUtc: row.created_at_utc,
    updatedAtUtc: row.updated_at_utc,
    sentAtUtc: row.sent_at_utc ?? undefined,
    lastError: row.last_error ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined
  };
}
