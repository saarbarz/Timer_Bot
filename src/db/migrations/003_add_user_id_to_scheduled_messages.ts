import { defaultUserId } from "../../domain/UserId.js";

export const addUserIdToScheduledMessagesMigration = {
  id: "003_add_user_id_to_scheduled_messages",
  sql: `
    ALTER TABLE scheduled_messages
    ADD COLUMN user_id TEXT NOT NULL DEFAULT '${defaultUserId}';

    CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_due
    ON scheduled_messages (user_id, status, scheduled_at_utc, next_attempt_at_utc);
  `
} as const;
