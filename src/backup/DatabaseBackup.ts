import fs from "node:fs";
import path from "node:path";

import { appConfig } from "../config/AppConfig.js";
import { openAppDatabase } from "../db/Database.js";

export async function backupDatabase(targetPath = defaultBackupPath(), databasePath = appConfig.databasePath): Promise<string> {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const db = openAppDatabase(databasePath);
  try {
    await db.backup(targetPath);
    return targetPath;
  } finally {
    db.close();
  }
}

export function defaultBackupPath(now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(appConfig.backupDir, `timer-bot-${stamp}.sqlite`);
}
