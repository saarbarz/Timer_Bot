import { appConfig } from "./config/AppConfig.js";

export function getStartupSummary(): string {
  return `Timer Bot initialized with default timezone ${appConfig.defaultTimezone}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(getStartupSummary());
}
