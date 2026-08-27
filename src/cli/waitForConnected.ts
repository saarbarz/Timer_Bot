import type { WhatsAppAdapter } from "../whatsapp/WhatsAppAdapter.js";

export async function waitForConnected(
  adapter: Pick<WhatsAppAdapter, "getStatus">,
  timeoutMs = 60_000,
  pollMs = 250
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = adapter.getStatus();

    if (status === "connected") {
      return;
    }

    if (status === "needs_relink") {
      throw new Error("WhatsApp session is logged out. Run npm.cmd run wa:connect to relink.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error("Timed out waiting for WhatsApp connection.");
}
