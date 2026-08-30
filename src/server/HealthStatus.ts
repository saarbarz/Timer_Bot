import type Database from "better-sqlite3";

import { openAppDatabase } from "../db/Database.js";
import type { WhatsAppConnectionStatus } from "../whatsapp/WhatsAppAdapter.js";
import type { ConnectionController } from "./ConnectionController.js";

export type HealthWhatsAppState = "connected" | "degraded" | "needs_relink";

export interface HealthStatus {
  readonly ok: boolean;
  readonly process: {
    readonly alive: true;
    readonly uptimeSeconds: number;
  };
  readonly database: {
    readonly reachable: boolean;
    readonly migrated: boolean;
  };
  readonly whatsapp: {
    readonly state: HealthWhatsAppState;
  };
}

export interface HealthStatusOptions {
  readonly databasePath?: string;
  readonly connection?: Pick<ConnectionController, "getStatus">;
  readonly openDatabase?: (databasePath?: string) => Database.Database;
  readonly uptimeSeconds?: () => number;
}

export function getHealthStatus(options: HealthStatusOptions = {}): HealthStatus {
  const database = checkDatabase(options);
  const whatsapp = mapWhatsAppHealth(options.connection?.getStatus() ?? "idle");

  return {
    ok: database.reachable && database.migrated,
    process: {
      alive: true,
      uptimeSeconds: Math.floor(options.uptimeSeconds?.() ?? process.uptime())
    },
    database,
    whatsapp
  };
}

function checkDatabase(
  options: Pick<HealthStatusOptions, "databasePath" | "openDatabase">
): HealthStatus["database"] {
  const openDatabase = options.openDatabase ?? openAppDatabase;

  try {
    const db = openDatabase(options.databasePath);
    try {
      const migrationCount = db
        .prepare<[], { count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get()
        ?.count;

      return {
        reachable: true,
        migrated: typeof migrationCount === "number" && migrationCount >= 2
      };
    } finally {
      db.close();
    }
  } catch {
    return {
      reachable: false,
      migrated: false
    };
  }
}

function mapWhatsAppHealth(status: WhatsAppConnectionStatus): HealthStatus["whatsapp"] {
  if (status === "connected") {
    return { state: "connected" };
  }

  if (status === "needs_relink") {
    return { state: "needs_relink" };
  }

  return { state: "degraded" };
}
