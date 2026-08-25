import { describe, expect, it } from "vitest";

import { appConfig } from "../../src/config/AppConfig.js";
import { getStartupSummary } from "../../src/index.js";

describe("Chunk 0 project skeleton", () => {
  it("uses Asia/Jerusalem as the default timezone", () => {
    expect(appConfig.defaultTimezone).toBe("Asia/Jerusalem");
  });

  it("has a startup summary smoke test", () => {
    expect(getStartupSummary()).toContain("Timer Bot initialized");
  });
});
