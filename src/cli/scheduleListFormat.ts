import type { ScheduledMessage } from "../domain/ScheduledMessage.js";

export function formatScheduleListLine(message: ScheduledMessage): string {
  const parts = [
    `id=${message.id}`,
    `status=${message.status}`,
    `scheduledAtLocal=${formatUtcIsoInZone(message.scheduledAtUtc, message.timezone)}`,
    `timezone=${message.timezone}`,
    `scheduledAtUtc=${message.scheduledAtUtc}`,
    `attempts=${message.attempts}`,
    message.nextAttemptAtUtc === undefined
      ? undefined
      : `nextAttemptAtLocal=${formatUtcIsoInZone(message.nextAttemptAtUtc, message.timezone)}`,
    message.nextAttemptAtUtc === undefined ? undefined : `nextAttemptAtUtc=${message.nextAttemptAtUtc}`,
    message.sentAtUtc === undefined ? undefined : `sentAtLocal=${formatUtcIsoInZone(message.sentAtUtc, message.timezone)}`,
    message.sentAtUtc === undefined ? undefined : `sentAtUtc=${message.sentAtUtc}`,
    message.providerMessageId === undefined ? undefined : `providerMessageId=${message.providerMessageId}`,
    message.lastError === undefined ? undefined : `lastError=${message.lastError}`
  ].filter((part): part is string => part !== undefined);

  return parts.join(" ");
}

export function formatUtcIsoInZone(utcIso: string, timeZone: string): string {
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
  const parts = new Map(formatter.formatToParts(new Date(utcIso)).map((part) => [part.type, part.value]));

  return `${readPart(parts, "year")}-${readPart(parts, "month")}-${readPart(parts, "day")}T${readPart(parts, "hour")}:${readPart(parts, "minute")}:${readPart(parts, "second")}`;
}

function readPart(parts: ReadonlyMap<string, string>, key: string): string {
  const value = parts.get(key);
  if (value === undefined) {
    throw new Error(`Intl formatter did not return ${key}.`);
  }

  return value;
}
