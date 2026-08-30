import { Buffer } from "node:buffer";
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

export interface HttpAuthOptions {
  readonly username: string;
  readonly password?: string;
}

export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function assertSecureBindConfiguration(host: string, auth: HttpAuthOptions): void {
  if (!isLoopbackHost(host) && (auth.password === undefined || auth.password.length === 0)) {
    throw new Error("UI_AUTH_PASSWORD is required when BIND_HOST is not localhost.");
  }
}

export function authorizeHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  auth: HttpAuthOptions | undefined
): boolean {
  if (auth?.password === undefined || auth.password.length === 0) {
    return true;
  }

  const header = request.headers.authorization;
  if (header === undefined || !header.startsWith("Basic ")) {
    sendAuthRequired(response);
    return false;
  }

  const decoded = decodeBasicAuth(header.slice("Basic ".length));
  if (decoded === undefined || !safeEquals(decoded.username, auth.username) || !safeEquals(decoded.password, auth.password)) {
    sendAuthRequired(response);
    return false;
  }

  return true;
}

function decodeBasicAuth(value: string): { username: string; password: string } | undefined {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return undefined;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return undefined;
  }
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sendAuthRequired(response: ServerResponse): void {
  response.writeHead(401, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="Timer Bot"'
  });
  response.end(JSON.stringify({ errorCode: "authentication_required" }));
}
