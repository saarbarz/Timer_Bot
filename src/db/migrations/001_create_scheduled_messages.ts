export const createScheduledMessagesMigration = {
  id: "001_create_scheduled_messages",
  sql: `
    CREATE TABLE scheduled_messages (
      id TEXT PRIMARY KEY,
      recipient TEXT NOT NULL,
      recipient_jid TEXT NOT NULL,
      text TEXT NOT NULL,
      scheduled_at_utc TEXT NOT NULL,
      timezone TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      created_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL,
      sent_at_utc TEXT,
      last_error TEXT,
      provider_message_id TEXT
    );

    CREATE INDEX idx_scheduled_messages_due
      ON scheduled_messages (status, scheduled_at_utc);
  `
} as const;
