export const addNextAttemptAtMigration = {
  id: "002_add_next_attempt_at",
  sql: `
    ALTER TABLE scheduled_messages
      ADD COLUMN next_attempt_at_utc TEXT;

    DROP INDEX IF EXISTS idx_scheduled_messages_due;

    CREATE INDEX idx_scheduled_messages_due
      ON scheduled_messages (status, scheduled_at_utc, next_attempt_at_utc);
  `
} as const;
