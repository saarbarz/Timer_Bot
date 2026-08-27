import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { appConfig } from "../config/AppConfig.js";
import { runMigrations } from "./Migrations.js";

export type SqliteDatabase = Database.Database;

export function openAppDatabase(databasePath = appConfig.databasePath): SqliteDatabase {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  runMigrations(db);
  return db;
}
