import { afterEach, describe, expect, it, vi } from "vitest";

import { consoleAuditLogger } from "../../src/audit/AuditLogger.js";

describe("consoleAuditLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs audit metadata without credentials, recipients, or message text", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    consoleAuditLogger({
      event: "send_failure",
      messageId: "message-1",
      status: "pending",
      errorCode: "auth/session payload +972501234567 message text"
    });

    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("audit=send_failure");
    expect(line).toContain("messageId=message-1");
    expect(line).not.toMatch(/auth\/session payload|\+972501234567|message text/);
  });
});
