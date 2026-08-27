import { pathToFileURL } from "node:url";

import { appConfig } from "./config/AppConfig.js";

export function getStartupSummary(): string {
  return `Timer Bot initialized with default timezone ${appConfig.defaultTimezone}`;
}

export function isDirectExecution(moduleUrl: string, argvEntry = process.argv[1]): boolean {
  return argvEntry !== undefined && moduleUrl === pathToFileURL(argvEntry).href;
}

if (isDirectExecution(import.meta.url)) {
  console.log(getStartupSummary());
}
