import type { ConnectionState } from "@whiskeysockets/baileys";

import {
  mapBaileysConnectionUpdate,
  shouldReconnectBaileys
} from "./BaileysConnectionState.js";
import type {
  WhatsAppConnectionStatus,
  WhatsAppLogger
} from "./WhatsAppAdapter.js";

type ReconnectTimer = ReturnType<typeof setTimeout>;

export interface TimerApi {
  readonly setTimeout: (callback: () => void, delayMs: number) => ReconnectTimer;
  readonly clearTimeout: (timer: ReconnectTimer) => void;
}

export interface ConnectionManagerOptions {
  readonly openConnection: () => Promise<void>;
  readonly closeConnection: () => Promise<void>;
  readonly log: WhatsAppLogger;
  readonly reconnectDelaysMs?: readonly number[];
  readonly jitterRatio?: number;
  readonly random?: () => number;
  readonly timers?: TimerApi;
}

const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
const DEFAULT_JITTER_RATIO = 0.1;

export class ConnectionManager {
  private readonly openConnection: () => Promise<void>;
  private readonly closeConnection: () => Promise<void>;
  private readonly log: WhatsAppLogger;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly jitterRatio: number;
  private readonly random: () => number;
  private readonly timers: TimerApi;
  private status: WhatsAppConnectionStatus = "idle";
  private reconnectAttempts = 0;
  private reconnectTimer?: ReconnectTimer;
  private shutdownRequested = false;

  constructor(options: ConnectionManagerOptions) {
    this.openConnection = options.openConnection;
    this.closeConnection = options.closeConnection;
    this.log = options.log;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
    this.jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
    this.random = options.random ?? Math.random;
    this.timers = options.timers ?? {
      setTimeout,
      clearTimeout
    };
  }

  async start(): Promise<void> {
    this.shutdownRequested = false;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    await this.openManagedConnection();
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    this.clearReconnectTimer();
    await this.closeConnection();
    this.setStatus("idle");
  }

  getStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  handleConnectionUpdate(update: Partial<ConnectionState>): void {
    if (this.shutdownRequested) {
      return;
    }

    const nextStatus = mapBaileysConnectionUpdate(update);
    if (nextStatus === undefined) {
      return;
    }

    this.setStatus(nextStatus);

    if (nextStatus === "connected") {
      this.reconnectAttempts = 0;
      this.clearReconnectTimer();
      return;
    }

    if (nextStatus === "needs_relink") {
      this.clearReconnectTimer();
      return;
    }

    if (shouldReconnectBaileys(update)) {
      this.scheduleReconnect();
    }
  }

  private async openManagedConnection(): Promise<void> {
    if (this.shutdownRequested) {
      return;
    }

    this.setStatus("connecting");
    await this.openConnection();
  }

  private scheduleReconnect(): void {
    if (this.shutdownRequested || this.reconnectTimer !== undefined) {
      return;
    }

    if (this.reconnectAttempts >= this.reconnectDelaysMs.length) {
      this.log({
        level: "error",
        event: "whatsapp.reconnect_exhausted",
        message: "WhatsApp reconnect attempts were exhausted.",
        attempt: this.reconnectAttempts,
        maxAttempts: this.reconnectDelaysMs.length,
        errorCode: "reconnect_exhausted"
      });
      return;
    }

    const attempt = this.reconnectAttempts + 1;
    const baseDelayMs = this.reconnectDelaysMs[this.reconnectAttempts] ?? this.reconnectDelaysMs.at(-1) ?? 30_000;
    const delayMs = applyJitter(baseDelayMs, this.jitterRatio, this.random);
    this.reconnectAttempts = attempt;

    this.log({
      level: "warn",
      event: "whatsapp.reconnect_scheduled",
      message: "WhatsApp reconnect scheduled after a temporary close.",
      attempt,
      maxAttempts: this.reconnectDelaysMs.length,
      delayMs
    });

    this.reconnectTimer = this.timers.setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.openManagedConnection().catch((error: unknown) => {
        this.setStatus("reconnect_needed");
        this.log({
          level: "error",
          event: "whatsapp.reconnect_open_failed",
          message: "WhatsApp reconnect attempt failed before the socket opened.",
          attempt,
          maxAttempts: this.reconnectDelaysMs.length,
          errorCode: "reconnect_open_failed",
          errorName: getErrorName(error)
        });
        this.scheduleReconnect();
      });
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === undefined) {
      return;
    }

    this.timers.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private setStatus(status: WhatsAppConnectionStatus): void {
    this.status = status;
    this.log(formatStatusLogEvent(status));
  }
}

function applyJitter(delayMs: number, jitterRatio: number, random: () => number): number {
  if (jitterRatio <= 0) {
    return delayMs;
  }

  const boundedRatio = Math.min(jitterRatio, 1);
  const centeredRandom = random() * 2 - 1;
  return Math.max(0, Math.round(delayMs * (1 + centeredRandom * boundedRatio)));
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function formatStatusLogEvent(status: WhatsAppConnectionStatus) {
  switch (status) {
    case "awaiting_qr":
      return {
        level: "info" as const,
        event: "whatsapp.qr_ready",
        message: "WhatsApp link QR is ready. Scan it from WhatsApp > Linked devices."
      };
    case "connected":
      return {
        level: "info" as const,
        event: "whatsapp.connected",
        message: "WhatsApp connection is open."
      };
    case "needs_relink":
      return {
        level: "error" as const,
        event: "whatsapp.needs_relink",
        message: "WhatsApp session needs relinking."
      };
    case "reconnect_needed":
      return {
        level: "warn" as const,
        event: "whatsapp.reconnect_needed",
        message: "WhatsApp connection closed temporarily; reconnect is needed."
      };
    case "connecting":
      return {
        level: "info" as const,
        event: "whatsapp.connecting",
        message: "Connecting to WhatsApp."
      };
    case "idle":
      return {
        level: "info" as const,
        event: "whatsapp.idle",
        message: "WhatsApp adapter is idle."
      };
  }
}
