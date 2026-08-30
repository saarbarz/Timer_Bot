import path from "node:path";

export interface AppConfig {
  readonly defaultTimezone: string;
  readonly authDir: string;
  readonly dataDir: string;
  readonly databasePath: string;
  readonly logsDir: string;
  readonly webPort: number;
  readonly servicePollMs: number;
  readonly serviceBindHost: string;
  readonly uiAuthUsername: string;
  readonly uiAuthPassword?: string;
  readonly maxScheduledSendsPerMinute: number;
  readonly backupDir: string;
}

const projectRoot = process.cwd();

export const appConfig: AppConfig = {
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "Asia/Jerusalem",
  authDir: process.env.AUTH_DIR ?? path.join(projectRoot, "auth"),
  dataDir: process.env.DATA_DIR ?? path.join(projectRoot, "data"),
  databasePath: process.env.DATABASE_PATH ?? path.join(projectRoot, "data", "timer-bot.sqlite"),
  logsDir: process.env.LOGS_DIR ?? path.join(projectRoot, "logs"),
  webPort: Number(process.env.PORT ?? "3000"),
  servicePollMs: Number(process.env.SERVICE_POLL_MS ?? "5000"),
  serviceBindHost: process.env.BIND_HOST ?? "127.0.0.1",
  uiAuthUsername: process.env.UI_AUTH_USERNAME ?? "timerbot",
  uiAuthPassword: process.env.UI_AUTH_PASSWORD,
  maxScheduledSendsPerMinute: Number(process.env.MAX_SCHEDULED_SENDS_PER_MINUTE ?? "10"),
  backupDir: process.env.BACKUP_DIR ?? path.join(projectRoot, "backups")
};
