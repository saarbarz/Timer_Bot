import type Database from "better-sqlite3";

import { createScheduledMessagesMigration } from "./migrations/001_create_scheduled_messages.js";
import { addNextAttemptAtMigration } from "./migrations/002_add_next_attempt_at.js";

const migrations = [createScheduledMessagesMigration, addNextAttemptAtMigration] as const;

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at_utc TEXT NOT NULL
    );
  `);

  const hasMigration = db
    .prepare<[string], { id: string }>("SELECT id FROM schema_migrations WHERE id = ?")
    .pluck();
  const insertMigration = db.prepare<[string, string]>(
    "INSERT INTO schema_migrations (id, applied_at_utc) VALUES (?, ?)"
  );

  const migrate = db.transaction(() => {
    for (const migration of migrations) {
      if (hasMigration.get(migration.id) !== undefined) {
        continue;
      }

      db.exec(migration.sql);
      insertMigration.run(migration.id, new Date().toISOString());
    }
  });

  migrate();
}
