import type { MessageSendResult } from "./MessageSender.js";

export const defaultSendRetryDelaysMs = [10_000, 30_000, 120_000, 300_000] as const;
export const defaultMaxSendAttempts = 4;

export interface SendRetryPolicyOptions {
  readonly retryDelaysMs?: readonly number[];
  readonly maxAttempts?: number;
  readonly retryUnknownFailures?: boolean;
}

export interface SendRetryPolicy {
  readonly retryDelaysMs: readonly number[];
  readonly maxAttempts: number;
  readonly retryUnknownFailures: boolean;
}

export type SendFailureClassification =
  | {
      readonly action: "retry";
      readonly nextAttemptAtUtc: string;
      readonly lastError: string;
      readonly attemptNumber: number;
    }
  | {
      readonly action: "fail";
      readonly lastError: string;
      readonly attemptNumber: number;
    };

export function createSendRetryPolicy(options: SendRetryPolicyOptions = {}): SendRetryPolicy {
  return {
    retryDelaysMs: options.retryDelaysMs ?? defaultSendRetryDelaysMs,
    maxAttempts: options.maxAttempts ?? defaultMaxSendAttempts,
    retryUnknownFailures: options.retryUnknownFailures ?? false
  };
}

export function classifySendFailure(
  result: Extract<MessageSendResult, { success: false }>,
  attemptsBeforeSend: number,
  now: Date,
  policy: SendRetryPolicy
): SendFailureClassification {
  const attemptNumber = attemptsBeforeSend + 1;
  const lastError = sanitizeLastError(result.errorCode);
  const retryable = result.retryable ?? policy.retryUnknownFailures;

  if (!retryable || attemptNumber >= policy.maxAttempts) {
    return {
      action: "fail",
      lastError,
      attemptNumber
    };
  }

  return {
    action: "retry",
    nextAttemptAtUtc: new Date(now.getTime() + getRetryDelayMs(policy.retryDelaysMs, attemptNumber)).toISOString(),
    lastError,
    attemptNumber
  };
}

function getRetryDelayMs(delaysMs: readonly number[], attemptNumber: number): number {
  if (delaysMs.length === 0) {
    return 0;
  }

  return delaysMs[Math.min(attemptNumber - 1, delaysMs.length - 1)] ?? delaysMs[delaysMs.length - 1] ?? 0;
}

function sanitizeLastError(errorCode: string): string {
  if (/(auth|creds|credential|qr|secret|session|token)/i.test(errorCode)) {
    return "send_failed_sanitized";
  }

  const sanitized = errorCode
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);

  return sanitized.length === 0 ? "send_failed" : sanitized;
}
