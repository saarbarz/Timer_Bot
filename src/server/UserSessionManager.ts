import path from "node:path";

import { appConfig } from "../config/AppConfig.js";
import { assertKnownLocalUserId, chunk13TestUserIds } from "../domain/UserId.js";
import type { WhatsAppAdapter, WhatsAppConnectionStatus, WhatsAppLogEvent } from "../whatsapp/WhatsAppAdapter.js";
import { createManagedBaileysConnectionController, type ConnectionController } from "./ConnectionController.js";

export interface UserSession {
  readonly userId: string;
  readonly authDir: string;
  readonly adapter: WhatsAppAdapter;
  readonly connection: ConnectionController;
  readonly getReconnectCount: () => number;
}

export interface UserSessionManagerOptions {
  readonly userIds?: readonly string[];
  readonly authRootDir?: string;
  readonly createSession?: (userId: string, authDir: string) => UserSession;
}

export interface UserSessionMetric {
  readonly userId: string;
  readonly status: WhatsAppConnectionStatus;
  readonly reconnects: number;
}

export interface UserSessionMetricsSnapshot {
  readonly timestampUtc: string;
  readonly activeSessionCount: number;
  readonly memory: {
    readonly rssBytes: number;
    readonly heapUsedBytes: number;
  };
  readonly cpu: {
    readonly userMicros: number;
    readonly systemMicros: number;
  };
  readonly sessions: readonly UserSessionMetric[];
}

export class UserSessionManager {
  private readonly userIds: readonly string[];
  private readonly authRootDir: string;
  private readonly createSession: (userId: string, authDir: string) => UserSession;
  private readonly sessions = new Map<string, UserSession>();

  constructor(options: UserSessionManagerOptions = {}) {
    this.userIds = options.userIds ?? chunk13TestUserIds;
    this.authRootDir = options.authRootDir ?? path.join(appConfig.authDir, "users");
    this.createSession = options.createSession ?? createDefaultSession;
    for (const userId of this.userIds) {
      assertKnownLocalUserId(userId);
    }
  }

  get(userId: string): UserSession {
    this.assertAllowed(userId);
    const existing = this.sessions.get(userId);
    if (existing !== undefined) {
      return existing;
    }

    const created = this.createSession(userId, this.authDirFor(userId));
    this.sessions.set(userId, created);
    return created;
  }

  listUserIds(): readonly string[] {
    return this.userIds;
  }

  metrics(): UserSessionMetricsSnapshot {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    return {
      timestampUtc: new Date().toISOString(),
      activeSessionCount: this.sessions.size,
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed
      },
      cpu: {
        userMicros: cpu.user,
        systemMicros: cpu.system
      },
      sessions: [...this.sessions.values()].map((session) => ({
        userId: session.userId,
        status: session.connection.getStatus(),
        reconnects: session.getReconnectCount()
      }))
    };
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((session) => session.connection.disconnect()));
  }

  async disconnect(userId: string): Promise<void> {
    await this.get(userId).connection.disconnect();
  }

  private authDirFor(userId: string): string {
    return path.join(this.authRootDir, userId);
  }

  private assertAllowed(userId: string): void {
    assertKnownLocalUserId(userId);
    if (!this.userIds.includes(userId)) {
      throw new Error("Unknown local user id.");
    }
  }
}

function createDefaultSession(userId: string, authDir: string): UserSession {
  let reconnects = 0;
  const managed = createManagedBaileysConnectionController({
    authDir,
    log: (event: WhatsAppLogEvent) => {
      if (event.event === "whatsapp.reconnect_scheduled") {
        reconnects += 1;
      }
      defaultSanitizedUserSessionLog(userId, event);
    }
  });

  return {
    userId,
    authDir,
    adapter: managed.adapter,
    connection: managed.connection,
    getReconnectCount: () => reconnects
  };
}

function defaultSanitizedUserSessionLog(userId: string, event: WhatsAppLogEvent): void {
  const line = [
    `userId=${userId}`,
    `event=${event.event}`,
    `level=${event.level}`,
    event.attempt === undefined ? undefined : `attempt=${event.attempt}`,
    event.maxAttempts === undefined ? undefined : `maxAttempts=${event.maxAttempts}`,
    event.delayMs === undefined ? undefined : `delayMs=${event.delayMs}`,
    event.errorCode === undefined ? undefined : `errorCode=${event.errorCode}`,
    event.errorName === undefined ? undefined : `errorName=${event.errorName}`
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");

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
