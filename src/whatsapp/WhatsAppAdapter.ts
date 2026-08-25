export type WhatsAppConnectionStatus =
  | "idle"
  | "connecting"
  | "awaiting_qr"
  | "connected"
  | "reconnect_needed"
  | "logged_out";

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

export interface SendResult {
  readonly success: boolean;
  readonly providerMessageId?: string;
  readonly errorCode?: SendErrorCode;
  readonly retryable?: boolean;
}

export interface WhatsAppAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): WhatsAppConnectionStatus;
  sendText(recipient: NormalizedRecipient, text: string): Promise<SendResult>;
}
