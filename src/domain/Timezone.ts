export function localDateTimeToUtc(localDateTime: string, timeZone: string): Date {
  const requested = parseLocalDateTime(localDateTime);
  assertValidTimeZone(timeZone);

  let utcMillis = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
    requested.second,
    0
  );

  const requestedMillisAsUtc = utcMillis;
  for (let index = 0; index < 4; index += 1) {
    const actual = getDateTimePartsInZone(new Date(utcMillis), timeZone);
    const actualMillisAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0
    );
    utcMillis -= actualMillisAsUtc - requestedMillisAsUtc;
  }

  const resolved = getDateTimePartsInZone(new Date(utcMillis), timeZone);
  if (!sameLocalDateTime(requested, resolved)) {
    throw new Error(`Local datetime does not exist in timezone: ${localDateTime} ${timeZone}`);
  }

  return new Date(utcMillis);
}

interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (match === null) {
    throw new Error("Local datetime must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss.");
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6])
  };

  const reconstructed = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0)
  );

  if (
    reconstructed.getUTCFullYear() !== parts.year ||
    reconstructed.getUTCMonth() !== parts.month - 1 ||
    reconstructed.getUTCDate() !== parts.day ||
    reconstructed.getUTCHours() !== parts.hour ||
    reconstructed.getUTCMinutes() !== parts.minute ||
    reconstructed.getUTCSeconds() !== parts.second
  ) {
    throw new Error("Local datetime contains out-of-range values.");
  }

  return parts;
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0));
  } catch {
    throw new Error(`Invalid timezone: ${timeZone}`);
  }
}

function getDateTimePartsInZone(date: Date, timeZone: string): LocalDateTimeParts {
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

  const values = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: readPart(values, "year"),
    month: readPart(values, "month"),
    day: readPart(values, "day"),
    hour: readPart(values, "hour"),
    minute: readPart(values, "minute"),
    second: readPart(values, "second")
  };
}

function readPart(values: ReadonlyMap<string, string>, key: string): number {
  const value = values.get(key);
  if (value === undefined) {
    throw new Error(`Intl formatter did not return ${key}.`);
  }

  return Number(value);
}

function sameLocalDateTime(left: LocalDateTimeParts, right: LocalDateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}
