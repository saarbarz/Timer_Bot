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

export interface SingleUserServiceOptions {
  readonly databasePath?: string;
  readonly connection: ConnectionController;
  readonly adapter: WhatsAppAdapter;
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
  const sender = new RateLimitedMessageSender(new WhatsAppMessageSender(options.adapter), {
    maxSendsPerMinute: options.maxScheduledSendsPerMinute ?? appConfig.maxScheduledSendsPerMinute
  });
  const worker = new SchedulerWorker(repository, sender, {
    staleProcessingMs: options.staleProcessingMs
  });
  const pollMs = options.pollMs ?? appConfig.servicePollMs;
  const server = createLocalWebServer({
    databasePath,
    connection: options.connection,
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
      if (options.connection.getStatus() === "connected") {
        const result = await worker.runOnce();
        if (result.claimed > 0 || result.sendFailed > 0 || result.recoveredStaleProcessing > 0) {
          console.log(formatWorkerResult(result));
          auditWorkerResult(audit, result);
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
    void options.connection.connect().catch((error: unknown) => {
      console.error(`WhatsApp startup connection failed. errorName=${error instanceof Error ? error.name : typeof error}`);
    });
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

      await options.connection.disconnect();
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

function formatWorkerResult(result: Awaited<ReturnType<SchedulerWorker["runOnce"]>>): string {
  return [
    `timestampUtc=${new Date().toISOString()}`,
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
