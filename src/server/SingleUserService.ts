import http from "node:http";

import { consoleAuditLogger, type AuditLogger } from "../audit/AuditLogger.js";
import { appConfig } from "../config/AppConfig.js";
import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { RateLimitedMessageSender } from "../scheduler/RateLimitedMessageSender.js";
import { SchedulerWorker } from "../scheduler/SchedulerWorker.js";
import { WhatsAppMessageSender } from "../scheduler/WhatsAppMessageSender.js";
import type { WhatsAppAdapter } from "../whatsapp/WhatsAppAdapter.js";
import type { ConnectionController } from "./ConnectionController.js";
import { assertSecureBindConfiguration, type HttpAuthOptions } from "./HttpAuth.js";
import { createLocalWebServer } from "./LocalWebServer.js";
import type { UserSession, UserSessionManager } from "./UserSessionManager.js";

export interface SingleUserServiceOptions {
  readonly databasePath?: string;
  readonly connection?: ConnectionController;
  readonly adapter?: WhatsAppAdapter;
  readonly sessionManager?: UserSessionManager;
  readonly host?: string;
  readonly port?: number;
  readonly pollMs?: number;
  readonly staleProcessingMs?: number;
  readonly connectOnStart?: boolean;
  readonly auth?: HttpAuthOptions;
  readonly audit?: AuditLogger;
  readonly maxScheduledSendsPerMinute?: number;
}

export interface RunningSingleUserService {
  readonly server: http.Server;
  readonly stop: () => Promise<void>;
}

export async function startSingleUserService(options: SingleUserServiceOptions): Promise<RunningSingleUserService> {
  const host = options.host ?? appConfig.serviceBindHost;
  const auth = options.auth ?? {
    username: appConfig.uiAuthUsername,
    password: appConfig.uiAuthPassword
  };
  assertSecureBindConfiguration(host, auth);

  const databasePath = options.databasePath ?? appConfig.databasePath;
  const db = openAppDatabase(databasePath);
  const repository = new ScheduledMessageRepository(db);
  const audit = options.audit ?? consoleAuditLogger;
  const workerEntries = createWorkerEntries(options, repository);
  const pollMs = options.pollMs ?? appConfig.servicePollMs;
  const server = createLocalWebServer({
    databasePath,
    connection: options.connection,
    sessionManager: options.sessionManager,
    auth,
    audit
  });
  let pollTimer: NodeJS.Timeout | undefined;
  let stopped = false;

  const runWorkerLoop = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    try {
      for (const entry of workerEntries()) {
        if (entry.connection.getStatus() === "connected") {
          const result = await entry.worker.runOnce();
          if (result.claimed > 0 || result.sendFailed > 0 || result.recoveredStaleProcessing > 0) {
            console.log(formatWorkerResult(result, entry.userId));
            auditWorkerResult(audit, result);
          }
        }
      }
    } catch (error: unknown) {
      console.error(`Service worker loop failed. errorName=${error instanceof Error ? error.name : typeof error}`);
    }

    if (!stopped) {
      pollTimer = setTimeout(() => {
        pollTimer = undefined;
        void runWorkerLoop();
      }, pollMs);
    }
  };

  try {
    await listen(server, options.port ?? appConfig.webPort, host);
  } catch (error: unknown) {
    db.close();
    throw error;
  }

  if (options.connectOnStart ?? true) {
    if (options.sessionManager !== undefined) {
      for (const userId of options.sessionManager.listUserIds()) {
        void options.sessionManager.get(userId).connection.connect().catch((error: unknown) => {
          console.error(`WhatsApp startup connection failed. userId=${userId} errorName=${error instanceof Error ? error.name : typeof error}`);
        });
      }
    } else {
      void requireSingleConnection(options).connect().catch((error: unknown) => {
        console.error(`WhatsApp startup connection failed. errorName=${error instanceof Error ? error.name : typeof error}`);
      });
    }
  }

  void runWorkerLoop();

  return {
    server,
    stop: async () => {
      stopped = true;
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }

      if (options.sessionManager !== undefined) {
        await options.sessionManager.disconnectAll();
      } else {
        await requireSingleConnection(options).disconnect();
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      db.close();
    }
  };
}

interface WorkerEntry {
  readonly userId?: string;
  readonly connection: ConnectionController;
  readonly worker: SchedulerWorker;
}

function createWorkerEntries(
  options: SingleUserServiceOptions,
  repository: ScheduledMessageRepository
): () => readonly WorkerEntry[] {
  if (options.sessionManager !== undefined) {
    let entries: readonly WorkerEntry[] | undefined;
    return () => {
      entries ??= options.sessionManager!.listUserIds().map((userId) => {
        const session: UserSession = options.sessionManager!.get(userId);
        return {
          userId,
          connection: session.connection,
          worker: new SchedulerWorker(
            repository,
            new RateLimitedMessageSender(new WhatsAppMessageSender(session.adapter), {
              maxSendsPerMinute: options.maxScheduledSendsPerMinute ?? appConfig.maxScheduledSendsPerMinute
            }),
            {
              staleProcessingMs: options.staleProcessingMs,
              userId
            }
          )
        };
      });
      return entries;
    };
  }

  const adapter = requireSingleAdapter(options);
  const connection = requireSingleConnection(options);
  const worker = new SchedulerWorker(
    repository,
    new RateLimitedMessageSender(new WhatsAppMessageSender(adapter), {
      maxSendsPerMinute: options.maxScheduledSendsPerMinute ?? appConfig.maxScheduledSendsPerMinute
    }),
    {
      staleProcessingMs: options.staleProcessingMs
    }
  );

  return () => [{ connection, worker }];
}

function requireSingleConnection(options: SingleUserServiceOptions): ConnectionController {
  if (options.connection === undefined) {
    throw new Error("Single-user service requires a connection when no session manager is provided.");
  }

  return options.connection;
}

function requireSingleAdapter(options: SingleUserServiceOptions): WhatsAppAdapter {
  if (options.adapter === undefined) {
    throw new Error("Single-user service requires an adapter when no session manager is provided.");
  }

  return options.adapter;
}

function auditWorkerResult(audit: AuditLogger, result: Awaited<ReturnType<SchedulerWorker["runOnce"]>>): void {
  if (result.messageId === undefined) {
    return;
  }

  if (result.sent > 0) {
    audit({ event: "send_success", messageId: result.messageId, status: result.finalStatus });
  } else if (result.sendFailed > 0) {
    audit({ event: "send_failure", messageId: result.messageId, status: result.finalStatus });
  }
}

function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function formatWorkerResult(result: Awaited<ReturnType<SchedulerWorker["runOnce"]>>, userId?: string): string {
  return [
    `timestampUtc=${new Date().toISOString()}`,
    userId === undefined ? undefined : `userId=${userId}`,
    result.messageId === undefined ? undefined : `messageId=${result.messageId}`,
    result.finalStatus === undefined ? undefined : `status=${result.finalStatus}`,
    result.updatedAtUtc === undefined ? undefined : `updatedAtUtc=${result.updatedAtUtc}`,
    `claimed=${result.claimed}`,
    `sent=${result.sent}`,
    `sendFailed=${result.sendFailed}`,
    `retryScheduled=${result.retryScheduled}`,
    `failed=${result.failed}`,
    `recoveredStaleProcessing=${result.recoveredStaleProcessing}`
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ");
}
