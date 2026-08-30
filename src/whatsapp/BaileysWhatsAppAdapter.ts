import path from "node:path";

import makeWASocket, {
  Browsers,
  type BaileysEventEmitter,
  type ConnectionState,
  type WASocket,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";

import { appConfig } from "../config/AppConfig.js";
import { ConnectionManager } from "./ConnectionManager.js";
import {
  type BaileysChatCandidate,
  type BaileysContactCandidate,
  RecipientOptionStore
} from "./RecipientOptions.js";
import type {
  NormalizedRecipient,
  RecipientOption,
  WhatsAppLogEvent,
  WhatsAppLogger,
  SendResult,
  WhatsAppAdapter,
  WhatsAppConnectionStatus
} from "./WhatsAppAdapter.js";

type SaveCredentials = () => Promise<void>;
type SocketFactory = (authState: Awaited<ReturnType<typeof useMultiFileAuthState>>["state"]) => WASocket;

export interface BaileysWhatsAppAdapterOptions {
  readonly authDir?: string;
  readonly socketFactory?: SocketFactory;
  readonly renderQr?: (qr: string) => void;
  readonly log?: WhatsAppLogger;
  readonly reconnectDelaysMs?: readonly number[];
  readonly jitterRatio?: number;
  readonly random?: () => number;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
}

export class BaileysWhatsAppAdapter implements WhatsAppAdapter {
  private readonly authDir: string;
  private readonly socketFactory: SocketFactory;
  private readonly renderQr: (qr: string) => void;
  private readonly log: WhatsAppLogger;
  private readonly connectionManager: ConnectionManager;
  private readonly recipientOptions = new RecipientOptionStore();
  private socket?: WASocket;

  constructor(options: BaileysWhatsAppAdapterOptions = {}) {
    this.authDir = options.authDir ?? appConfig.authDir;
    this.socketFactory =
      options.socketFactory ??
      ((authState) =>
        makeWASocket({
          auth: authState,
          browser: Browsers.appropriate("Timer Bot"),
          logger: pino({ level: "silent" }),
          printQRInTerminal: false
        }));
    this.renderQr = options.renderQr ?? ((qr) => qrcode.generate(qr, { small: true }));
    this.log = options.log ?? defaultWhatsAppLogger;
    this.connectionManager = new ConnectionManager({
      openConnection: () => this.openSocket(),
      closeConnection: () => this.closeSocket(),
      log: this.log,
      reconnectDelaysMs:
        options.reconnectDelaysMs ?? legacyReconnectDelays(options.reconnectDelayMs, options.maxReconnectAttempts),
      jitterRatio: options.jitterRatio,
      random: options.random
    });
  }

  async connect(): Promise<void> {
    await this.connectionManager.start();
  }

  async disconnect(): Promise<void> {
    await this.connectionManager.shutdown();
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.connectionManager.getStatus();
  }

  getRecipientOptions(): RecipientOption[] {
    return this.recipientOptions.list();
  }

  async sendText(recipient: NormalizedRecipient, text: string): Promise<SendResult> {
    if (this.socket === undefined || this.connectionManager.getStatus() !== "connected") {
      return {
        success: false,
        errorCode: "not_connected",
        retryable: true
      };
    }

    try {
      const message = await this.socket.sendMessage(recipient.jid, { text });
      return {
        success: true,
        providerMessageId: message?.key.id ?? undefined
      };
    } catch {
      return {
        success: false,
        errorCode: "transport_error",
        retryable: true
      };
    }
  }

  private async openSocket(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(this.authDir));
    this.socket = this.socketFactory(state);

    registerBaileysEventHandlers(this.socket.ev, saveCreds, {
      onConnectionUpdate: (update) => this.connectionManager.handleConnectionUpdate(update),
      onQr: (qr) => this.renderQr(qr),
      onContacts: (contacts) => this.recipientOptions.upsertContacts(contacts),
      onChats: (chats) => this.recipientOptions.upsertChats(chats),
      onCredentialsSaveError: (error) => this.logCredentialsSaveError(error)
    });
  }

  private async closeSocket(): Promise<void> {
    await this.socket?.end(undefined);
    this.socket = undefined;
  }

  private logCredentialsSaveError(error: unknown): void {
    this.log({
      level: "error",
      event: "whatsapp.credentials_save_failed",
      message: "Failed to save WhatsApp credentials.",
      errorCode: "credentials_save_failed",
      errorName: error instanceof Error ? error.name : typeof error
    });
  }
}

export function registerBaileysEventHandlers(
  events: Pick<BaileysEventEmitter, "on">,
  saveCredentials: SaveCredentials,
  handlers: {
    readonly onConnectionUpdate: (update: Partial<ConnectionState>) => void;
    readonly onQr: (qr: string) => void;
    readonly onContacts?: (contacts: readonly BaileysContactCandidate[]) => void;
    readonly onChats?: (chats: readonly BaileysChatCandidate[]) => void;
    readonly onCredentialsSaveError?: (error: unknown) => void;
  }
): void {
  events.on("creds.update", () => {
    void Promise.resolve()
      .then(() => saveCredentials())
      .catch((error: unknown) => {
        handlers.onCredentialsSaveError?.(error);
      });
  });

  events.on("connection.update", (update) => {
    if (update.qr !== undefined) {
      handlers.onQr(update.qr);
    }

    handlers.onConnectionUpdate(update);
  });

  events.on("messaging-history.set", (history) => {
    handlers.onContacts?.(history.contacts);
    handlers.onChats?.(history.chats);
  });

  events.on("contacts.upsert", (contacts) => {
    handlers.onContacts?.(contacts);
  });

  events.on("contacts.update", (contacts) => {
    handlers.onContacts?.(contacts);
  });

  events.on("chats.upsert", (chats) => {
    handlers.onChats?.(chats);
  });

  events.on("chats.update", (chats) => {
    handlers.onChats?.(chats);
  });
}

function legacyReconnectDelays(
  reconnectDelayMs: number | undefined,
  maxReconnectAttempts: number | undefined
): readonly number[] | undefined {
  if (reconnectDelayMs === undefined && maxReconnectAttempts === undefined) {
    return undefined;
  }

  const attempts = maxReconnectAttempts ?? 3;
  const delayMs = reconnectDelayMs ?? 1_000;
  return Array.from({ length: attempts }, () => delayMs);
}

function defaultWhatsAppLogger(event: WhatsAppLogEvent): void {
  const details = [
    event.attempt === undefined ? undefined : `attempt=${event.attempt}`,
    event.maxAttempts === undefined ? undefined : `maxAttempts=${event.maxAttempts}`,
    event.delayMs === undefined ? undefined : `delayMs=${event.delayMs}`,
    event.errorCode === undefined ? undefined : `errorCode=${event.errorCode}`,
    event.errorName === undefined ? undefined : `errorName=${event.errorName}`
  ].filter((value): value is string => value !== undefined);

  const suffix = details.length === 0 ? "" : ` (${details.join(", ")})`;
  const line = `${event.message}${suffix}`;

  if (event.level === "error") {
    console.error(line);
    return;
  }

  if (event.level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}
