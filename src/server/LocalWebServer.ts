import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { appConfig } from "../config/AppConfig.js";
import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import type { ScheduledMessage } from "../domain/ScheduledMessage.js";
import { ScheduleError, ScheduleService } from "../domain/ScheduleService.js";
import { formatUtcIsoInZone } from "../cli/scheduleListFormat.js";
import type { AuditLogger } from "../audit/AuditLogger.js";
import type { ConnectionController } from "./ConnectionController.js";
import { getHealthStatus } from "./HealthStatus.js";
import { authorizeHttpRequest, type HttpAuthOptions } from "./HttpAuth.js";
import { localWebUiHtml } from "./localWebUiHtml.js";
import type { RecipientOption } from "../whatsapp/WhatsAppAdapter.js";

export interface LocalWebServerOptions {
  readonly databasePath?: string;
  readonly connection?: ConnectionController;
  readonly auth?: HttpAuthOptions;
  readonly audit?: AuditLogger;
}

export function createLocalWebRequestHandler(options: LocalWebServerOptions = {}): http.RequestListener {
  return async (request, response) => {
    try {
      await routeRequest(request, response, options);
    } catch (error: unknown) {
      if (error instanceof ScheduleError) {
        sendJson(response, scheduleErrorStatus(error), { errorCode: error.code, message: error.message });
        return;
      }

      sendJson(response, 500, { errorCode: "internal_error", message: "Unexpected server error." });
    }
  };
}

export function createLocalWebServer(options: LocalWebServerOptions = {}): http.Server {
  return http.createServer(createLocalWebRequestHandler(options));
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LocalWebServerOptions
): Promise<void> {
  if (request.url === undefined) {
    sendJson(response, 400, { errorCode: "invalid_request" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/health") {
    const health = getHealthStatus({
      databasePath: options.databasePath,
      connection: options.connection
    });
    sendJson(response, health.ok ? 200 : 503, health);
    return;
  }

  if (!authorizeHttpRequest(request, response, options.auth)) {
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    sendHtml(response, localWebUiHtml);
    return;
  }

  if (method === "GET" && url.pathname === "/api/connection") {
    sendJson(response, 200, {
      status: options.connection?.getStatus() ?? "idle",
      qrAvailable: options.connection?.getQrTerminal() !== undefined
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/connection/connect") {
    await options.connection?.connect();
    sendJson(response, 200, {
      status: options.connection?.getStatus() ?? "idle",
      qrAvailable: options.connection?.getQrTerminal() !== undefined
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/connection/qr") {
    sendJson(response, 200, {
      status: options.connection?.getStatus() ?? "idle",
      qr: options.connection?.getQrTerminal()
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/recipients") {
    sendJson(response, 200, {
      recipients: options.connection?.getRecipientOptions().map(toApiRecipientOption) ?? []
    });
    return;
  }

  if (url.pathname === "/api/messages") {
    if (method === "GET") {
      withScheduleService(options, (service) => {
        sendJson(response, 200, { messages: service.list().map(toApiMessage) });
      });
      return;
    }

    if (method === "POST") {
      const body = await readJsonBody(request);
      withScheduleService(options, (service) => {
        const message = service.create({
          recipient: readString(body, "recipient"),
          text: readString(body, "text"),
          scheduledAtLocal: readString(body, "scheduledAtLocal"),
          timezone: readString(body, "timezone")
        });
        options.audit?.({ event: "schedule_created", messageId: message.id, status: message.status });
        sendJson(response, 201, { message: toApiMessage(message) });
      });
      return;
    }
  }

  const messageMatch = /^\/api\/messages\/([^/]+)$/.exec(url.pathname);
  if (messageMatch !== null) {
    const id = decodeURIComponent(messageMatch[1]);

    if (method === "PATCH") {
      const body = await readJsonBody(request);
      withScheduleService(options, (service, repository) => {
        const text = optionalString(body, "text");
        const scheduledAtLocal = optionalString(body, "scheduledAtLocal");
        const timezone = optionalString(body, "timezone");

        if (text === undefined && scheduledAtLocal === undefined) {
          sendJson(response, 400, { errorCode: "empty_update", message: "Provide text or scheduledAtLocal." });
          return;
        }

        if (text !== undefined && text.trim().length === 0) {
          throw new ScheduleError("empty_text", "Text is required.");
        }

        let updated: ScheduledMessage | undefined;
        if (scheduledAtLocal !== undefined) {
          const existingTimezone = repository.findById(id)?.timezone ?? appConfig.defaultTimezone;
          updated = service.updateTime(id, {
            scheduledAtLocal,
            timezone: timezone ?? existingTimezone
          });
        }

        if (text !== undefined) {
          updated = service.updateText(id, text);
        }

        sendJson(response, 200, { message: toApiMessage(updated ?? repository.findById(id)) });
      });
      return;
    }

    if (method === "DELETE") {
      withScheduleService(options, (service) => {
        const message = service.cancel(id);
        options.audit?.({ event: "cancelled", messageId: message.id, status: message.status });
        sendJson(response, 200, { message: toApiMessage(message) });
      });
      return;
    }
  }

  sendJson(response, 404, { errorCode: "not_found" });
}

function withScheduleService(
  options: LocalWebServerOptions,
  action: (service: ScheduleService, repository: ScheduledMessageRepository) => void
): void {
  const db = openAppDatabase(options.databasePath);
  try {
    const repository = new ScheduledMessageRepository(db);
    action(new ScheduleService(repository), repository);
  } finally {
    db.close();
  }
}

function toApiMessage(message: ScheduledMessage | undefined): Record<string, unknown> {
  if (message === undefined) {
    throw new ScheduleError("scheduled_message_not_found", "Scheduled message was not found.");
  }

  return {
    id: message.id,
    recipient: message.recipient,
    text: message.text,
    scheduledAtUtc: message.scheduledAtUtc,
    scheduledAtLocal: formatUtcIsoInZone(message.scheduledAtUtc, message.timezone),
    timezone: message.timezone,
    status: message.status,
    attempts: message.attempts,
    nextAttemptAtUtc: message.nextAttemptAtUtc,
    nextAttemptAtLocal:
      message.nextAttemptAtUtc === undefined ? undefined : formatUtcIsoInZone(message.nextAttemptAtUtc, message.timezone),
    sentAtUtc: message.sentAtUtc,
    sentAtLocal: message.sentAtUtc === undefined ? undefined : formatUtcIsoInZone(message.sentAtUtc, message.timezone),
    lastError: message.lastError,
    providerMessageId: message.providerMessageId,
    createdAtUtc: message.createdAtUtc,
    updatedAtUtc: message.updatedAtUtc
  };
}

function toApiRecipientOption(option: RecipientOption): Record<string, unknown> {
  return {
    displayName: option.displayName,
    recipient: option.recipient.phoneNumber,
    jid: option.recipient.jid,
    source: option.source,
    lastSeenAtUtc: option.lastSeenAtUtc
  };
}

function scheduleErrorStatus(error: ScheduleError): number {
  if (error.code === "scheduled_message_not_found") {
    return 404;
  }

  if (error.code === "scheduled_message_not_pending") {
    return 409;
  }

  return 400;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 65_536) {
      throw new Error("Request body is too large.");
    }
  }

  if (body.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(body) as unknown;
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function readString(body: Readonly<Record<string, unknown>>, key: string): string {
  const value = optionalString(body, key);
  return value ?? "";
}

function optionalString(body: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
}
