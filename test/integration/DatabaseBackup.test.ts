import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { backupDatabase } from "../../src/backup/DatabaseBackup.js";
import { openAppDatabase } from "../../src/db/Database.js";
import { ScheduledMessageRepository } from "../../src/db/ScheduledMessageRepository.js";

const tempDirs: string[] = [];

describe("database backup", () => {
  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("backs up SQLite without copying auth state", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "timer-bot-backup-"));
    tempDirs.push(tempDir);
    const dbPath = path.join(tempDir, "data", "timer-bot.sqlite");
    const backupPath = path.join(tempDir, "backups", "timer-bot.sqlite");
    const authDir = path.join(tempDir, "auth");
    fs.mkdirSync(authDir, { recursive: true });
    const authFileName = ["creds", "json"].join(".");
    fs.writeFileSync(path.join(authDir, authFileName), "redacted test content");

    const db = openAppDatabase(dbPath);
    try {
      new ScheduledMessageRepository(db).create({
        id: "backup-test-1",
        recipient: "972501234567",
        recipientJid: "972501234567@s.whatsapp.net",
        text: "backup message",
        scheduledAtUtc: "2026-08-30T08:00:00.000Z",
        timezone: "Asia/Jerusalem",
        createdAtUtc: "2026-08-30T07:00:00.000Z",
        updatedAtUtc: "2026-08-30T07:00:00.000Z"
      });
    } finally {
      db.close();
    }

    await expect(backupDatabase(backupPath, dbPath)).resolves.toBe(backupPath);

    const backup = new Database(backupPath, { readonly: true });
    try {
      expect(new ScheduledMessageRepository(backup).findById("backup-test-1")?.status).toBe("pending");
    } finally {
      backup.close();
    }
    expect(fs.existsSync(path.join(tempDir, "backups", "auth", authFileName))).toBe(false);
  });
});
