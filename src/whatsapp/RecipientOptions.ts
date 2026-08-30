import type { NormalizedRecipient, RecipientOption, RecipientOptionStats } from "./WhatsAppAdapter.js";

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

export interface BaileysLidPnMappingCandidate {
  readonly lid?: string | null;
  readonly pn?: string | null;
}

export interface BaileysMessageCandidate {
  readonly key?: {
    readonly remoteJid?: string | null;
    readonly remoteJidAlt?: string | null;
    readonly participant?: string | null;
    readonly participantAlt?: string | null;
  } | null;
  readonly messageTimestamp?: unknown;
  readonly pushName?: string | null;
}

interface LongLike {
  toNumber(): number;
}

export class RecipientOptionStore {
  private readonly optionsByJid = new Map<string, RecipientOption>();
  private contactsSeen = 0;
  private chatsSeen = 0;
  private messagesSeen = 0;
  private lidMappingsSeen = 0;

  upsertContacts(
    contacts: readonly BaileysContactCandidate[],
    lidPnMappings: readonly BaileysLidPnMappingCandidate[] = []
  ): void {
    this.contactsSeen += contacts.length;
    this.lidMappingsSeen += lidPnMappings.length;
    const phoneByLid = createPhoneByLid(lidPnMappings);
    for (const contact of contacts) {
      const option = recipientOptionFromContact(contact, phoneByLid);
      if (option !== undefined) {
        this.upsert(option);
      }
    }
  }

  upsertChats(chats: readonly BaileysChatCandidate[], lidPnMappings: readonly BaileysLidPnMappingCandidate[] = []): void {
    this.chatsSeen += chats.length;
    this.lidMappingsSeen += lidPnMappings.length;
    const phoneByLid = createPhoneByLid(lidPnMappings);
    for (const chat of chats) {
      const option = recipientOptionFromChat(chat, phoneByLid);
      if (option !== undefined) {
        this.upsert(option);
      }
    }
  }

  upsertMessages(
    messages: readonly BaileysMessageCandidate[],
    lidPnMappings: readonly BaileysLidPnMappingCandidate[] = []
  ): void {
    this.messagesSeen += messages.length;
    this.lidMappingsSeen += lidPnMappings.length;
    const phoneByLid = createPhoneByLid(lidPnMappings);
    for (const message of messages) {
      const option = recipientOptionFromMessage(message, phoneByLid);
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

  stats(): RecipientOptionStats {
    return {
      contactsSeen: this.contactsSeen,
      chatsSeen: this.chatsSeen,
      messagesSeen: this.messagesSeen,
      lidMappingsSeen: this.lidMappingsSeen,
      mappedRecipients: this.optionsByJid.size
    };
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

export function recipientOptionFromContact(
  contact: BaileysContactCandidate,
  phoneByLid: ReadonlyMap<string, NormalizedRecipient> = new Map()
): RecipientOption | undefined {
  const recipient =
    normalizeIndividualAddress(contact.phoneNumber) ??
    normalizeMappedLid(contact.id, phoneByLid) ??
    normalizeIndividualAddress(contact.id);
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

export function recipientOptionFromChat(
  chat: BaileysChatCandidate,
  phoneByLid: ReadonlyMap<string, NormalizedRecipient> = new Map()
): RecipientOption | undefined {
  const recipient = normalizeMappedLid(chat.id, phoneByLid) ?? normalizeIndividualJid(chat.id);
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

export function recipientOptionFromMessage(
  message: BaileysMessageCandidate,
  phoneByLid: ReadonlyMap<string, NormalizedRecipient> = new Map()
): RecipientOption | undefined {
  const jid =
    message.key?.remoteJidAlt ??
    message.key?.remoteJid ??
    message.key?.participantAlt ??
    message.key?.participant;
  const recipient = normalizeMappedLid(jid, phoneByLid) ?? normalizeIndividualJid(jid);
  if (recipient === undefined) {
    return undefined;
  }

  return {
    displayName: firstNonEmpty(message.pushName) ?? recipient.phoneNumber,
    recipient,
    source: "chat",
    lastSeenAtUtc: messageTimestampToUtc(message.messageTimestamp)
  };
}

function createPhoneByLid(mappings: readonly BaileysLidPnMappingCandidate[]): Map<string, NormalizedRecipient> {
  const phoneByLid = new Map<string, NormalizedRecipient>();
  for (const mapping of mappings) {
    const lid = mapping.lid?.trim();
    const phone = normalizeIndividualAddress(mapping.pn);
    if (lid !== undefined && lid.length > 0 && phone !== undefined) {
      phoneByLid.set(lid, phone);
    }
  }

  return phoneByLid;
}

function normalizeMappedLid(
  input: string | null | undefined,
  phoneByLid: ReadonlyMap<string, NormalizedRecipient>
): NormalizedRecipient | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  return phoneByLid.get(input.trim());
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

function normalizeIndividualAddress(input: string | null | undefined): NormalizedRecipient | undefined {
  if (input === undefined || input === null) {
    return undefined;
  }

  const trimmed = input.trim();
  const jid = normalizeIndividualJid(trimmed);
  if (jid !== undefined) {
    return jid;
  }

  const digits = trimmed.replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{6,14}$/.test(digits)) {
    return undefined;
  }

  return {
    phoneNumber: digits,
    jid: `${digits}@s.whatsapp.net`
  };
}

function chatTimestampToUtc(chat: BaileysChatCandidate): string | undefined {
  const rawTimestamp = chat.lastMessageRecvTimestamp ?? longLikeToNumber(chat.conversationTimestamp);
  if (rawTimestamp === undefined || !Number.isFinite(rawTimestamp) || rawTimestamp <= 0) {
    return undefined;
  }

  return new Date(rawTimestamp * 1000).toISOString();
}

function messageTimestampToUtc(rawTimestamp: unknown): string | undefined {
  const timestamp = longLikeToNumber(rawTimestamp);
  if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }

  return new Date(timestamp * 1000).toISOString();
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
