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
  readonly next_attempt_at_utc: string | null;
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

  claimNextDuePending(nowUtc: string): ScheduledMessage | undefined {
    const claim = this.db.transaction((claimedAtUtc: string) => {
      const due = this.db
        .prepare<[string, string], { id: string }>(
          `
            SELECT id
            FROM scheduled_messages
            WHERE
              status = 'pending'
              AND scheduled_at_utc <= ?
              AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= ?)
            ORDER BY scheduled_at_utc ASC, created_at_utc ASC
            LIMIT 1
          `
        )
        .get(claimedAtUtc, claimedAtUtc);

      if (due === undefined) {
        return undefined;
      }

      const result = this.db
        .prepare<[string, string]>(
          `
            UPDATE scheduled_messages
            SET status = 'processing', updated_at_utc = ?
            WHERE id = ? AND status = 'pending'
          `
        )
        .run(claimedAtUtc, due.id);

      return result.changes === 0 ? undefined : due.id;
    });

    const claimedId = claim(nowUtc) as string | undefined;
    return claimedId === undefined ? undefined : this.findById(claimedId);
  }

  recoverStaleProcessing(staleBeforeUtc: string, updatedAtUtc: string): number {
    const result = this.db
      .prepare<[string, string]>(
        `
          UPDATE scheduled_messages
          SET
            status = 'pending',
            updated_at_utc = ?,
            next_attempt_at_utc = NULL,
            last_error = 'stale_processing_recovered'
          WHERE status = 'processing' AND updated_at_utc <= ?
        `
      )
      .run(updatedAtUtc, staleBeforeUtc);

    return result.changes;
  }

  markProcessingSent(
    id: string,
    sentAtUtc: string,
    providerMessageId: string | undefined,
    updatedAtUtc: string
  ): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string | null, string, string]>(
        `
          UPDATE scheduled_messages
          SET
            status = 'sent',
            attempts = attempts + 1,
            sent_at_utc = ?,
            provider_message_id = ?,
            updated_at_utc = ?,
            next_attempt_at_utc = NULL,
            last_error = NULL
          WHERE id = ? AND status = 'processing'
        `
      )
      .run(sentAtUtc, providerMessageId ?? null, updatedAtUtc, id);

    return result.changes === 0 ? undefined : this.findById(id);
  }

  markProcessingRetryable(
    id: string,
    nextAttemptAtUtc: string,
    lastError: string,
    updatedAtUtc: string
  ): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string, string, string]>(
        `
          UPDATE scheduled_messages
          SET
            status = 'pending',
            attempts = attempts + 1,
            next_attempt_at_utc = ?,
            last_error = ?,
            updated_at_utc = ?
          WHERE id = ? AND status = 'processing'
        `
      )
      .run(nextAttemptAtUtc, lastError, updatedAtUtc, id);

    return result.changes === 0 ? undefined : this.findById(id);
  }

  markProcessingFailed(
    id: string,
    lastError: string,
    updatedAtUtc: string
  ): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string, string]>(
        `
          UPDATE scheduled_messages
          SET
            status = 'failed',
            attempts = attempts + 1,
            next_attempt_at_utc = NULL,
            last_error = ?,
            updated_at_utc = ?
          WHERE id = ? AND status = 'processing'
        `
      )
      .run(lastError, updatedAtUtc, id);

    return result.changes === 0 ? undefined : this.findById(id);
  }

  cancelPending(id: string, updatedAtUtc: string): ScheduledMessage | undefined {
    const result = this.db
      .prepare<[string, string]>(
        `
          UPDATE scheduled_messages
          SET status = 'cancelled', updated_at_utc = ?, next_attempt_at_utc = NULL
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
          SET
            scheduled_at_utc = ?,
            timezone = ?,
            updated_at_utc = ?,
            next_attempt_at_utc = NULL,
            last_error = NULL
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
    nextAttemptAtUtc: row.next_attempt_at_utc ?? undefined,
    sentAtUtc: row.sent_at_utc ?? undefined,
    lastError: row.last_error ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined
  };
}
