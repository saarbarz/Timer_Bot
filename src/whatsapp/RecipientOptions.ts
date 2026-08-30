import type { NormalizedRecipient, RecipientOption } from "./WhatsAppAdapter.js";

export interface BaileysContactCandidate {
  readonly id?: string | null;
  readonly phoneNumber?: string | null;
  readonly name?: string;
  readonly notify?: string;
  readonly verifiedName?: string;
}

export interface BaileysChatCandidate {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly conversationTimestamp?: unknown;
  readonly lastMessageRecvTimestamp?: number;
}

interface LongLike {
  toNumber(): number;
}

export class RecipientOptionStore {
  private readonly optionsByJid = new Map<string, RecipientOption>();

  upsertContacts(contacts: readonly BaileysContactCandidate[]): void {
    for (const contact of contacts) {
      const option = recipientOptionFromContact(contact);
      if (option !== undefined) {
        this.upsert(option);
      }
    }
  }

  upsertChats(chats: readonly BaileysChatCandidate[]): void {
    for (const chat of chats) {
      const option = recipientOptionFromChat(chat);
      if (option !== undefined) {
        this.upsert(option);
      }
    }
  }

  list(limit = 20): RecipientOption[] {
    return Array.from(this.optionsByJid.values())
      .sort(compareRecipientOptions)
      .slice(0, limit);
  }

  private upsert(option: RecipientOption): void {
    const existing = this.optionsByJid.get(option.recipient.jid);
    if (existing === undefined) {
      this.optionsByJid.set(option.recipient.jid, option);
      return;
    }

    this.optionsByJid.set(option.recipient.jid, mergeRecipientOptions(existing, option));
  }
}

export function recipientOptionFromContact(contact: BaileysContactCandidate): RecipientOption | undefined {
  const recipient = normalizeIndividualJid(contact.phoneNumber ?? contact.id);
  if (recipient === undefined) {
    return undefined;
  }

  const displayName = firstNonEmpty(contact.name, contact.notify, contact.verifiedName) ?? recipient.phoneNumber;
  return {
    displayName,
    recipient,
    source: "contact"
  };
}

export function recipientOptionFromChat(chat: BaileysChatCandidate): RecipientOption | undefined {
  const recipient = normalizeIndividualJid(chat.id);
  if (recipient === undefined) {
    return undefined;
  }

  return {
    displayName: firstNonEmpty(chat.name) ?? recipient.phoneNumber,
    recipient,
    source: "chat",
    lastSeenAtUtc: chatTimestampToUtc(chat)
  };
}

function normalizeIndividualJid(input: string | null | undefined): NormalizedRecipient | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  const jid = input.trim();
  if (!jid.endsWith("@s.whatsapp.net")) {
    return undefined;
  }

  const phoneNumber = jid.slice(0, -"@s.whatsapp.net".length);
  if (!/^[1-9]\d{6,14}$/.test(phoneNumber)) {
    return undefined;
  }

  return {
    phoneNumber,
    jid: `${phoneNumber}@s.whatsapp.net`
  };
}

function chatTimestampToUtc(chat: BaileysChatCandidate): string | undefined {
  const rawTimestamp = chat.lastMessageRecvTimestamp ?? longLikeToNumber(chat.conversationTimestamp);
  if (rawTimestamp === undefined || !Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
    return undefined;
  }

  return new Date(rawTimestamp * 1000).toISOString();
}

function longLikeToNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (isLongLike(value)) {
    return value.toNumber();
  }

  return undefined;
}

function isLongLike(value: unknown): value is LongLike {
  return (
    value !== null &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  );
}

function mergeRecipientOptions(existing: RecipientOption, incoming: RecipientOption): RecipientOption {
  const latestLastSeenAtUtc = latestUtc(existing.lastSeenAtUtc, incoming.lastSeenAtUtc);
  const source = existing.source === "contact" || incoming.source === "contact" ? "contact" : "chat";
  const displayName =
    incoming.source === "contact" && incoming.displayName !== incoming.recipient.phoneNumber
      ? incoming.displayName
      : existing.displayName;

  return {
    displayName,
    recipient: existing.recipient,
    source,
    lastSeenAtUtc: latestLastSeenAtUtc
  };
}

function latestUtc(first: string | undefined, second: string | undefined): string | undefined {
  if (first === undefined) {
    return second;
  }

  if (second === undefined) {
    return first;
  }

  return first >= second ? first : second;
}

function compareRecipientOptions(left: RecipientOption, right: RecipientOption): number {
  const leftTime = left.lastSeenAtUtc ?? "";
  const rightTime = right.lastSeenAtUtc ?? "";
  if (leftTime !== rightTime) {
    return rightTime.localeCompare(leftTime);
  }

  return left.displayName.localeCompare(right.displayName);
}

function firstNonEmpty(...values: readonly (string | null | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}
