import { describe, expect, it, vi } from "vitest";

import type { Clock } from "../../src/domain/Clock.js";
import type { ScheduledMessage } from "../../src/domain/ScheduledMessage.js";
import type { MessageSender } from "../../src/scheduler/MessageSender.js";
import { RateLimitedMessageSender } from "../../src/scheduler/RateLimitedMessageSender.js";

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return this.current;
  }

  set(value: string): void {
    this.current = new Date(value);
  }
}

describe("RateLimitedMessageSender", () => {
  it("limits scheduled sends per minute and resets in the next window", async () => {
    const clock = new MutableClock(new Date("2026-08-30T08:00:00.000Z"));
    const inner: MessageSender = {
      send: vi.fn(async () => ({ success: true as const, providerMessageId: "provider-id" }))
    };
    const sender = new RateLimitedMessageSender(inner, { maxSendsPerMinute: 1, clock });

    await expect(sender.send(testMessage("message-1"))).resolves.toMatchObject({ success: true });
    await expect(sender.send(testMessage("message-2"))).resolves.toEqual({
      success: false,
      errorCode: "rate_limited",
      retryable: true
    });
    expect(inner.send).toHaveBeenCalledOnce();

    clock.set("2026-08-30T08:01:00.000Z");
    await expect(sender.send(testMessage("message-3"))).resolves.toMatchObject({ success: true });
    expect(inner.send).toHaveBeenCalledTimes(2);
  });
});

function testMessage(id: string): ScheduledMessage {
  return {
    id,
    recipient: "972501234567",
    recipientJid: "972501234567@s.whatsapp.net",
    text: "test message",
    scheduledAtUtc: "2026-08-30T08:00:00.000Z",
    timezone: "Asia/Jerusalem",
    status: "processing",
    attempts: 0,
    createdAtUtc: "2026-08-30T08:00:00.000Z",
    updatedAtUtc: "2026-08-30T08:00:00.000Z"
  };
}
