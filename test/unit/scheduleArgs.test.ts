import { describe, expect, it } from "vitest";

import {
  parseScheduleCancelArgs,
  parseScheduleCreateArgs,
  parseScheduleWorkerArgs,
  resolveScheduledAtLocal
} from "../../src/cli/scheduleArgs.js";

describe("schedule CLI argument parsing", () => {
  it("parses absolute schedule create arguments", () => {
    expect(
      parseScheduleCreateArgs([
        "--to",
        "+972501234567",
        "--text",
        "test message",
        "--at",
        "2026-08-27T12:00",
        "--timezone",
        "Asia/Jerusalem"
      ])
    ).toEqual({
      success: true,
      value: {
        to: "+972501234567",
        text: "test message",
        at: "2026-08-27T12:00",
        in: undefined,
        timezone: "Asia/Jerusalem"
      }
    });
  });

  it("parses relative --in values into local time for the selected timezone", () => {
    const parsed = parseScheduleCreateArgs([
      "--to",
      "+972501234567",
      "--text",
      "test message",
      "--in",
      "90s",
      "--timezone",
      "Asia/Jerusalem"
    ]);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(resolveScheduledAtLocal(parsed.value, new Date("2026-08-27T09:00:00.000Z"))).toEqual({
        success: true,
        value: "2026-08-27T12:01:30"
      });
    }
  });

  it("rejects create arguments that use both --at and --in", () => {
    expect(
      parseScheduleCreateArgs([
        "--to",
        "+972501234567",
        "--text",
        "test message",
        "--at",
        "2026-08-27T12:00",
        "--in",
        "60s"
      ])
    ).toMatchObject({
      success: false
    });
  });

  it("parses cancel id and worker poll interval", () => {
    expect(parseScheduleCancelArgs(["message-id-1"])).toEqual({
      success: true,
      value: { id: "message-id-1" }
    });
    expect(parseScheduleWorkerArgs(["--poll-ms", "1000"])).toEqual({
      success: true,
      value: { pollMs: 1000 }
    });
  });
});
