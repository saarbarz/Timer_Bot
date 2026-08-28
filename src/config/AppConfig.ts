import path from "node:path";

export interface AppConfig {
  readonly defaultTimezone: string;
  readonly authDir: string;
  readonly dataDir: string;
  readonly databasePath: string;
  readonly logsDir: string;
  readonly webPort: number;
}

const projectRoot = process.cwd();

export const appConfig: AppConfig = {
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "Asia/Jerusalem",
  authDir: process.env.AUTH_DIR ?? path.join(projectRoot, "auth"),
  dataDir: process.env.DATA_DIR ?? path.join(projectRoot, "data"),
  databasePath: process.env.DATABASE_PATH ?? path.join(projectRoot, "data", "timer-bot.sqlite"),
  logsDir: process.env.LOGS_DIR ?? path.join(projectRoot, "logs"),
  webPort: Number(process.env.PORT ?? "3000")
};
