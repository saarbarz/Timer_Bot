import { describe, expect, it } from "vitest";

import { formatScheduleListLine, formatUtcIsoInZone } from "../../src/cli/scheduleListFormat.js";
import type { ScheduledMessage } from "../../src/domain/ScheduledMessage.js";

describe("schedule list formatting", () => {
  it("formats UTC timestamps in the message timezone for CLI display", () => {
    expect(formatUtcIsoInZone("2026-08-28T03:40:00.000Z", "Asia/Jerusalem")).toBe("2026-08-28T06:40:00");
  });

  it("prints local time before UTC time without recipient or message text", () => {
    const line = formatScheduleListLine({
      id: "message-id-1",
      recipient: "972501234567",
      recipientJid: "972501234567@s.whatsapp.net",
      text: "private message text",
      scheduledAtUtc: "2026-08-28T03:40:00.000Z",
      timezone: "Asia/Jerusalem",
      status: "sent",
      attempts: 1,
      createdAtUtc: "2026-08-28T03:00:00.000Z",
      updatedAtUtc: "2026-08-28T03:40:02.000Z",
      sentAtUtc: "2026-08-28T03:40:02.000Z",
      providerMessageId: "provider-id-1"
    } satisfies ScheduledMessage);

    expect(line).toContain("scheduledAtLocal=2026-08-28T06:40:00");
    expect(line).toContain("scheduledAtUtc=2026-08-28T03:40:00.000Z");
    expect(line).toContain("sentAtLocal=2026-08-28T06:40:02");
    expect(line).not.toContain("972501234567");
    expect(line).not.toContain("private message text");
  });
});
