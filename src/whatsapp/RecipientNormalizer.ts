import type { NormalizedRecipient, SendErrorCode } from "./WhatsAppAdapter.js";

export type RecipientNormalizationResult =
  | {
      readonly success: true;
      readonly recipient: NormalizedRecipient;
    }
  | {
      readonly success: false;
      readonly errorCode: SendErrorCode;
    };

const MAX_E164_DIGITS = 15;
const MIN_PLAUSIBLE_DIGITS = 7;

export function normalizeRecipient(input: string): RecipientNormalizationResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { success: false, errorCode: "empty_recipient" };
  }

  if (trimmed.endsWith("@g.us")) {
    return { success: false, errorCode: "group_recipient_unsupported" };
  }

  if (trimmed.includes("@")) {
    return { success: false, errorCode: "invalid_recipient" };
  }

  if (!/^\+?[\d -]+$/.test(trimmed)) {
    return { success: false, errorCode: "invalid_recipient" };
  }

  const digits = trimmed.replace(/[ +-]/g, "");
  if (digits.length < MIN_PLAUSIBLE_DIGITS || digits.length > MAX_E164_DIGITS) {
    return { success: false, errorCode: "invalid_recipient" };
  }

  if (!/^[1-9]\d+$/.test(digits)) {
    return { success: false, errorCode: "invalid_recipient" };
  }

  return {
    success: true,
    recipient: {
      phoneNumber: digits,
      jid: `${digits}@s.whatsapp.net`
    }
  };
}
