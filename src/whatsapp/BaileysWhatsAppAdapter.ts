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
import { mapBaileysConnectionUpdate, shouldReconnectBaileys } from "./BaileysConnectionState.js";
import type {
  NormalizedRecipient,
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
  readonly log?: (message: string) => void;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectAttempts?: number;
}

export class BaileysWhatsAppAdapter implements WhatsAppAdapter {
  private readonly authDir: string;
  private readonly socketFactory: SocketFactory;
  private readonly renderQr: (qr: string) => void;
  private readonly log: (message: string) => void;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private socket?: WASocket;
  private status: WhatsAppConnectionStatus = "idle";
  private reconnectAttempts = 0;
  private disconnectRequested = false;

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
    this.log = options.log ?? console.log;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 1_000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
  }

  async connect(): Promise<void> {
    this.disconnectRequested = false;
    await this.openSocket();
  }

  async disconnect(): Promise<void> {
    this.disconnectRequested = true;
    await this.socket?.end(undefined);
    this.socket = undefined;
    this.status = "idle";
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  async sendText(recipient: NormalizedRecipient, text: string): Promise<SendResult> {
    if (this.socket === undefined || this.status !== "connected") {
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
    this.status = "connecting";

    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(this.authDir));
    this.socket = this.socketFactory(state);

    registerBaileysEventHandlers(this.socket.ev, saveCreds, {
      onConnectionUpdate: (update) => this.handleConnectionUpdate(update),
      onQr: (qr) => this.renderQr(qr)
    });
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const nextStatus = mapBaileysConnectionUpdate(update);
    if (nextStatus === undefined) {
      return;
    }

    this.status = nextStatus;
    this.log(formatStatusMessage(nextStatus));

    if (nextStatus === "connected") {
      this.reconnectAttempts = 0;
      return;
    }

    if (shouldReconnectBaileys(update)) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.disconnectRequested || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts += 1;
    const attempt = this.reconnectAttempts;
    this.log(`Reconnecting to WhatsApp, attempt ${attempt}/${this.maxReconnectAttempts}.`);

    setTimeout(() => {
      if (this.disconnectRequested) {
        return;
      }

      void this.openSocket().catch(() => {
        this.status = "reconnect_needed";
      });
    }, this.reconnectDelayMs);
  }
}

export function registerBaileysEventHandlers(
  events: Pick<BaileysEventEmitter, "on">,
  saveCredentials: SaveCredentials,
  handlers: {
    readonly onConnectionUpdate: (update: Partial<ConnectionState>) => void;
    readonly onQr: (qr: string) => void;
  }
): void {
  events.on("creds.update", () => {
    void saveCredentials();
  });

  events.on("connection.update", (update) => {
    if (update.qr !== undefined) {
      handlers.onQr(update.qr);
    }

    handlers.onConnectionUpdate(update);
  });
}

function formatStatusMessage(status: WhatsAppConnectionStatus): string {
  switch (status) {
    case "awaiting_qr":
      return "WhatsApp link QR is ready. Scan it from WhatsApp > Linked devices.";
    case "connected":
      return "WhatsApp connection is open.";
    case "logged_out":
      return "WhatsApp session is logged out and needs relinking.";
    case "reconnect_needed":
      return "WhatsApp connection closed temporarily; reconnect is needed.";
    case "connecting":
      return "Connecting to WhatsApp.";
    case "idle":
      return "WhatsApp adapter is idle.";
  }
}
