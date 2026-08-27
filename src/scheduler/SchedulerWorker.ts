import type { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import type { Clock } from "../domain/Clock.js";
import { systemClock } from "../domain/Clock.js";
import type { ScheduledMessage } from "../domain/ScheduledMessage.js";
import type { MessageSendResult, MessageSender } from "./MessageSender.js";
import {
  classifySendFailure,
  createSendRetryPolicy,
  type SendRetryPolicy,
  type SendRetryPolicyOptions
} from "./RetryPolicy.js";

export interface SchedulerWorkerOptions {
  readonly clock?: Clock;
  readonly retryPolicy?: SendRetryPolicyOptions;
}

export interface SchedulerWorkerRunResult {
  readonly claimed: number;
  readonly sent: number;
  readonly sendFailed: number;
  readonly retryScheduled: number;
  readonly failed: number;
  readonly messageId?: string;
  readonly finalStatus?: ScheduledMessage["status"];
  readonly updatedAtUtc?: string;
}

export class SchedulerWorker {
  private readonly clock: Clock;
  private readonly retryPolicy: SendRetryPolicy;

  constructor(
    private readonly repository: ScheduledMessageRepository,
    private readonly sender: MessageSender,
    options: SchedulerWorkerOptions = {}
  ) {
    this.clock = options.clock ?? systemClock;
    this.retryPolicy = createSendRetryPolicy(options.retryPolicy);
  }

  async runOnce(): Promise<SchedulerWorkerRunResult> {
    const claimed = this.repository.claimNextDuePending(this.clock.now().toISOString());
    if (claimed === undefined) {
      return emptyRunResult();
    }

    const sendResult = await this.sendClaimedMessage(claimed);
    if (!sendResult.success) {
      return this.handleSendFailure(claimed, sendResult);
    }

    const sentAtUtc = this.clock.now().toISOString();
    const markedSent = this.repository.markProcessingSent(
      claimed.id,
      sentAtUtc,
      sendResult.providerMessageId,
      sentAtUtc
    );

    return {
      claimed: 1,
      sent: markedSent === undefined ? 0 : 1,
      sendFailed: 0,
      retryScheduled: 0,
      failed: 0,
      messageId: claimed.id,
      finalStatus: markedSent?.status,
      updatedAtUtc: markedSent?.updatedAtUtc ?? sentAtUtc
    };
  }

  private async sendClaimedMessage(claimed: ScheduledMessage): Promise<MessageSendResult> {
    try {
      return await this.sender.send(claimed);
    } catch {
      return {
        success: false as const,
        errorCode: "message_sender_exception",
        retryable: undefined
      };
    }
  }

  private handleSendFailure(
    claimed: ScheduledMessage,
    sendResult: Extract<MessageSendResult, { success: false }>
  ): SchedulerWorkerRunResult {
    const now = this.clock.now();
    const classification = classifySendFailure(sendResult, claimed.attempts, now, this.retryPolicy);

    if (classification.action === "retry") {
      const retryable = this.repository.markProcessingRetryable(
        claimed.id,
        classification.nextAttemptAtUtc,
        classification.lastError,
        now.toISOString()
      );

      return {
        claimed: 1,
        sent: 0,
        sendFailed: 1,
        retryScheduled: retryable === undefined ? 0 : 1,
        failed: 0,
        messageId: claimed.id,
        finalStatus: retryable?.status,
        updatedAtUtc: retryable?.updatedAtUtc ?? now.toISOString()
      };
    }

    const failed = this.repository.markProcessingFailed(claimed.id, classification.lastError, now.toISOString());

    return {
      claimed: 1,
      sent: 0,
      sendFailed: 1,
      retryScheduled: 0,
      failed: failed === undefined ? 0 : 1,
      messageId: claimed.id,
      finalStatus: failed?.status,
      updatedAtUtc: failed?.updatedAtUtc ?? now.toISOString()
    };
  }
}

function emptyRunResult(): SchedulerWorkerRunResult {
  return {
    claimed: 0,
    sent: 0,
    sendFailed: 0,
    retryScheduled: 0,
    failed: 0
  };
}
