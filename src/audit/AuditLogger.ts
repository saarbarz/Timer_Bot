export type AuditEventName = "schedule_created" | "cancelled" | "send_success" | "send_failure";

export interface AuditEvent {
  readonly event: AuditEventName;
  readonly messageId: string;
  readonly status?: string;
  readonly errorCode?: string;
  readonly timestampUtc?: string;
}

export type AuditLogger = (event: AuditEvent) => void;

export const consoleAuditLogger: AuditLogger = (event) => {
  const parts = [
    `audit=${event.event}`,
    `messageId=${event.messageId}`,
    event.status === undefined ? undefined : `status=${event.status}`,
    event.errorCode === undefined ? undefined : `errorCode=${sanitizeAuditValue(event.errorCode)}`,
    `timestampUtc=${event.timestampUtc ?? new Date().toISOString()}`
  ];

  console.log(parts.filter((part): part is string => part !== undefined).join(" "));
};

function sanitizeAuditValue(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "_")
    .slice(0, 120);
}
