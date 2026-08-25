import { normalizeRecipient } from "./RecipientNormalizer.js";
import type { SendResult, WhatsAppAdapter } from "./WhatsAppAdapter.js";

export interface SendTextNowRequest {
  readonly to: string;
  readonly text: string;
}

export async function sendTextNow(
  adapter: Pick<WhatsAppAdapter, "sendText">,
  request: SendTextNowRequest
): Promise<SendResult> {
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

  try {
    return await adapter.sendText(normalized.recipient, request.text);
  } catch {
    return {
      success: false,
      errorCode: "transport_error",
      retryable: true
    };
  }
}
