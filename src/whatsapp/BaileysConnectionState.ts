import { DisconnectReason, type ConnectionState } from "@whiskeysockets/baileys";

import type { WhatsAppConnectionStatus } from "./WhatsAppAdapter.js";

export function mapBaileysConnectionUpdate(
  update: Partial<ConnectionState>
): WhatsAppConnectionStatus | undefined {
  if (update.qr !== undefined) {
    return "awaiting_qr";
  }

  if (update.connection === "open") {
    return "connected";
  }

  if (update.connection === "connecting") {
    return "connecting";
  }

  if (update.connection === "close") {
    return requiresRelinkBaileys(update) ? "needs_relink" : "reconnect_needed";
  }

  return undefined;
}

export function getDisconnectStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeBoom = error as { output?: { statusCode?: unknown } };
  return typeof maybeBoom.output?.statusCode === "number" ? maybeBoom.output.statusCode : undefined;
}

export function shouldReconnectBaileys(update: Partial<ConnectionState>): boolean {
  if (update.connection !== "close") {
    return false;
  }

  return !requiresRelinkBaileys(update);
}

export function requiresRelinkBaileys(update: Partial<ConnectionState>): boolean {
  if (update.connection !== "close") {
    return false;
  }

  const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
  return (
    statusCode === DisconnectReason.loggedOut ||
    statusCode === DisconnectReason.connectionReplaced ||
    statusCode === DisconnectReason.badSession ||
    statusCode === DisconnectReason.multideviceMismatch ||
    statusCode === DisconnectReason.forbidden
  );
}
