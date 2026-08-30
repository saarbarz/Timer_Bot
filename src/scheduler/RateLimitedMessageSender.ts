import type { Clock } from "../domain/Clock.js";
import { systemClock } from "../domain/Clock.js";
import type { ScheduledMessage } from "../domain/ScheduledMessage.js";
import type { MessageSendResult, MessageSender } from "./MessageSender.js";

export interface RateLimitedMessageSenderOptions {
  readonly maxSendsPerMinute: number;
  readonly clock?: Clock;
}

export class RateLimitedMessageSender implements MessageSender {
  private readonly clock: Clock;
  private windowStartMs: number | undefined;
  private sendsInWindow = 0;

  constructor(
    private readonly inner: MessageSender,
    private readonly options: RateLimitedMessageSenderOptions
  ) {
    this.clock = options.clock ?? systemClock;
  }

  async send(message: ScheduledMessage): Promise<MessageSendResult> {
    if (!this.tryConsumeSendSlot()) {
      return {
        success: false,
        errorCode: "rate_limited",
        retryable: true
      };
    }

    return this.inner.send(message);
  }

  private tryConsumeSendSlot(): boolean {
    const limit = Math.max(1, Math.floor(this.options.maxSendsPerMinute));
    const nowMs = this.clock.now().getTime();

    if (this.windowStartMs === undefined || nowMs - this.windowStartMs >= 60_000) {
      this.windowStartMs = nowMs;
      this.sendsInWindow = 0;
    }

    if (this.sendsInWindow >= limit) {
      return false;
    }

    this.sendsInWindow += 1;
    return true;
  }
}
