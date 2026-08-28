import { appConfig } from "../config/AppConfig.js";

export interface ScheduleCreateCliArgs {
  readonly to: string;
  readonly text: string;
  readonly at?: string;
  readonly in?: string;
  readonly timezone: string;
}

export interface ScheduleCancelCliArgs {
  readonly id: string;
}

export interface ScheduleUpdateTimeCliArgs {
  readonly id: string;
  readonly at?: string;
  readonly in?: string;
  readonly timezone: string;
}

export interface ScheduleWorkerCliArgs {
  readonly pollMs: number;
  readonly staleProcessingMs: number;
}

export type CliParseResult<T> =
  | {
      readonly success: true;
      readonly value: T;
    }
  | {
      readonly success: false;
      readonly message: string;
    };

export function parseScheduleCreateArgs(argv: readonly string[]): CliParseResult<ScheduleCreateCliArgs> {
  const parsed = parseFlagValues(argv, new Set(["--to", "--text", "--at", "--in", "--timezone"]));
  if (!parsed.success) {
    return parsed;
  }

  const to = parsed.value.values.get("--to");
  const text = parsed.value.values.get("--text");
  const at = parsed.value.values.get("--at");
  const relative = parsed.value.values.get("--in");
  const timezone = parsed.value.values.get("--timezone") ?? appConfig.defaultTimezone;

  if (to === undefined || text === undefined || (at === undefined && relative === undefined)) {
    return {
      success: false,
      message: 'Usage: npm.cmd run schedule -- --to <number> --text "message" --at <YYYY-MM-DDTHH:mm[:ss]> [--timezone <IANA timezone>]'
    };
  }

  if (at !== undefined && relative !== undefined) {
    return {
      success: false,
      message: "Use either --at or --in, not both."
    };
  }

  return {
    success: true,
    value: { to, text, at, in: relative, timezone }
  };
}

export function parseScheduleCancelArgs(argv: readonly string[]): CliParseResult<ScheduleCancelCliArgs> {
  if (argv.length !== 1 || argv[0]?.trim().length === 0) {
    return {
      success: false,
      message: "Usage: npm.cmd run schedule:cancel -- <id>"
    };
  }

  return {
    success: true,
    value: { id: argv[0] }
  };
}

export function parseScheduleUpdateTimeArgs(argv: readonly string[]): CliParseResult<ScheduleUpdateTimeCliArgs> {
  if (argv.length === 0 || argv[0]?.startsWith("--") === true) {
    return {
      success: false,
      message: "Usage: npm.cmd run schedule:update-time -- <id> --at <YYYY-MM-DDTHH:mm[:ss]> [--timezone <IANA timezone>]"
    };
  }

  const parsed = parseFlagValues(argv.slice(1), new Set(["--at", "--in", "--timezone"]));
  if (!parsed.success) {
    return parsed;
  }

  const at = parsed.value.values.get("--at");
  const relative = parsed.value.values.get("--in");
  const timezone = parsed.value.values.get("--timezone") ?? appConfig.defaultTimezone;

  if (at === undefined && relative === undefined) {
    return {
      success: false,
      message: "Use --at or --in to provide the new scheduled time."
    };
  }

  if (at !== undefined && relative !== undefined) {
    return {
      success: false,
      message: "Use either --at or --in, not both."
    };
  }

  return {
    success: true,
    value: {
      id: argv[0],
      at,
      in: relative,
      timezone
    }
  };
}

export function parseScheduleWorkerArgs(argv: readonly string[]): CliParseResult<ScheduleWorkerCliArgs> {
  const parsed = parseFlagValues(argv, new Set(["--poll-ms", "--stale-processing-ms"]));
  if (!parsed.success) {
    return parsed;
  }

  const rawPollMs = parsed.value.values.get("--poll-ms");
  const pollMs = rawPollMs === undefined ? 5_000 : Number(rawPollMs);
  if (!Number.isInteger(pollMs) || pollMs < 250) {
    return {
      success: false,
      message: "--poll-ms must be an integer of at least 250."
    };
  }

  const rawStaleProcessingMs = parsed.value.values.get("--stale-processing-ms");
  const staleProcessingMs = rawStaleProcessingMs === undefined ? 10 * 60 * 1_000 : Number(rawStaleProcessingMs);
  if (!Number.isInteger(staleProcessingMs) || staleProcessingMs < 1_000) {
    return {
      success: false,
      message: "--stale-processing-ms must be an integer of at least 1000."
    };
  }

  return { success: true, value: { pollMs, staleProcessingMs } };
}

export function resolveScheduledAtLocal(
  args: Pick<ScheduleCreateCliArgs, "at" | "in" | "timezone">,
  now = new Date()
): CliParseResult<string> {
  if (args.at !== undefined) {
    return { success: true, value: args.at };
  }

  if (args.in === undefined) {
    return { success: false, message: "Missing --at or --in." };
  }

  const offsetMs = parseRelativeDelayMs(args.in);
  if (offsetMs === undefined) {
    return {
      success: false,
      message: "--in must be a duration like 60s, 90s, 2m, or 1h."
    };
  }

  return {
    success: true,
    value: formatLocalDateTime(new Date(now.getTime() + offsetMs), args.timezone)
  };
}

function parseFlagValues(
  argv: readonly string[],
  knownFlags: ReadonlySet<string>
): CliParseResult<{ readonly values: ReadonlyMap<string, string> }> {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined || !knownFlags.has(flag)) {
      return { success: false, message: `Unknown argument: ${flag ?? ""}` };
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { success: false, message: `Missing value for ${flag}.` };
    }

    values.set(flag, value);
    index += 1;
  }

  return { success: true, value: { values } };
}

function parseRelativeDelayMs(value: string): number | undefined {
  const match = /^(\d+)(s|m|h)?$/.exec(value.trim());
  if (match === null) {
    return undefined;
  }

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return undefined;
  }

  const unit = match[2] ?? "s";
  const multiplier = unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000;
  return amount * multiplier;
}

function formatLocalDateTime(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return `${readPart(parts, "year")}-${readPart(parts, "month")}-${readPart(parts, "day")}T${readPart(parts, "hour")}:${readPart(parts, "minute")}:${readPart(parts, "second")}`;
}

function readPart(parts: ReadonlyMap<string, string>, key: string): string {
  const value = parts.get(key);
  if (value === undefined) {
    throw new Error(`Intl formatter did not return ${key}.`);
  }

  return value;
}
