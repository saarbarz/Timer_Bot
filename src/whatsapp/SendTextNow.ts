import { normalizeRecipient } from "./RecipientNormalizer.js";
import type { NormalizedRecipient, SendResult, WhatsAppAdapter } from "./WhatsAppAdapter.js";

export interface SendTextNowRequest {
  readonly to: string;
  readonly text: string;
}

interface ValidSendTextNowRequest {
  readonly success: true;
  readonly recipient: NormalizedRecipient;
  readonly text: string;
}

export type SendTextNowValidationResult = ValidSendTextNowRequest | SendResult;

export function isValidSendTextNowRequest(result: SendTextNowValidationResult): result is ValidSendTextNowRequest {
  return result.success && "recipient" in result;
}

export function validateSendTextNowRequest(request: SendTextNowRequest): SendTextNowValidationResult {
  const normalized = normalizeRecipient(request.to);
  if (!normalized.success) {
    return {
      success: false,
      errorCode: normalized.errorCode,
      retryable: false
    };
  }

  if (request.text.trim().length === 0) {
    return {
      success: false,
      errorCode: "empty_text",
      retryable: false
    };
  }

  return {
    success: true,
    recipient: normalized.recipient,
    text: request.text
  };
}

export async function sendTextNow(
  adapter: Pick<WhatsAppAdapter, "sendText">,
  request: SendTextNowRequest
): Promise<SendResult> {
  const validation = validateSendTextNowRequest(request);
  if (!isValidSendTextNowRequest(validation)) {
    return validation;
  }

  try {
    return await adapter.sendText(validation.recipient, validation.text);
  } catch {
    return {
      success: false,
      errorCode: "transport_error",
      retryable: true
    };
  }
}
