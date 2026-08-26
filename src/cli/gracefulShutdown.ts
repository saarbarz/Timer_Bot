import type { WhatsAppAdapter } from "../whatsapp/WhatsAppAdapter.js";

type ShutdownSignal = "SIGINT" | "SIGTERM";

export function installGracefulShutdown(adapter: Pick<WhatsAppAdapter, "disconnect">): void {
  let shutdownStarted = false;

  const shutdown = (signal: ShutdownSignal) => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    const exitCode = signal === "SIGINT" ? 130 : 143;
    void adapter.disconnect().finally(() => process.exit(exitCode));
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
