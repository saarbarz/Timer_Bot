export type WhatsAppConnectionStatus =
  | "idle"
  | "connecting"
  | "awaiting_qr"
  | "connected"
  | "reconnect_needed"
  | "needs_relink";

export type SendErrorCode =
  | "empty_recipient"
  | "invalid_recipient"
  | "group_recipient_unsupported"
  | "empty_text"
  | "not_connected"
  | "transport_error";

export interface NormalizedRecipient {
  readonly phoneNumber: string;
  readonly jid: string;
}

export interface RecipientOption {
  readonly displayName: string;
  readonly recipient: NormalizedRecipient;
  readonly source: "chat" | "contact" | "scheduled";
  readonly lastSeenAtUtc?: string;
}

export interface RecipientOptionStats {
  readonly contactsSeen: number;
  readonly chatsSeen: number;
  readonly messagesSeen: number;
  readonly lidMappingsSeen: number;
  readonly mappedRecipients: number;
}

export interface SendResult {
  readonly success: boolean;
  readonly providerMessageId?: string;
  readonly errorCode?: SendErrorCode;
  readonly retryable?: boolean;
}

export interface WhatsAppLogEvent {
  readonly level: "info" | "warn" | "error";
  readonly event: string;
  readonly message: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly errorCode?: string;
  readonly errorName?: string;
}

export type WhatsAppLogger = (event: WhatsAppLogEvent) => void;

export interface WhatsAppAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): WhatsAppConnectionStatus;
  getRecipientOptions(): RecipientOption[];
  getRecipientStats(): RecipientOptionStats;
  sendText(recipient: NormalizedRecipient, text: string): Promise<SendResult>;
}
