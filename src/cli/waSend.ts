import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";
import { sendTextNow } from "../whatsapp/SendTextNow.js";
import type { WhatsAppAdapter } from "../whatsapp/WhatsAppAdapter.js";

interface SendCliArgs {
  readonly to: string;
  readonly text: string;
}

const args = parseArgs(process.argv.slice(2));
if (args === undefined) {
  console.error('Usage: npm.cmd run wa:send -- --to <number> --text "message"');
  process.exit(1);
}

await main(args).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected send failure.");
  process.exit(1);
});

async function main(sendArgs: SendCliArgs): Promise<void> {
  const adapter = new BaileysWhatsAppAdapter();

  process.on("SIGINT", () => {
    void adapter.disconnect().finally(() => process.exit(130));
  });

  try {
    await adapter.connect();
    await waitForConnected(adapter);

    const result = await sendTextNow(adapter, sendArgs);
    if (result.success) {
      console.log("Message sent successfully.");
      if (result.providerMessageId !== undefined) {
        console.log(`Provider message id: ${result.providerMessageId}`);
      }
      process.exitCode = 0;
    } else {
      console.error(`Message was not sent. errorCode=${result.errorCode}, retryable=${result.retryable === true}`);
      process.exitCode = 1;
    }
  } finally {
    await adapter.disconnect();
  }
}

function parseArgs(argv: readonly string[]): SendCliArgs | undefined {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag !== "--to" && flag !== "--text") {
      return undefined;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return undefined;
    }

    values.set(flag, value);
    index += 1;
  }

  const to = values.get("--to");
  const text = values.get("--text");
  if (to === undefined || text === undefined) {
    return undefined;
  }

  return { to, text };
}

async function waitForConnected(
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

    if (status === "logged_out") {
      throw new Error("WhatsApp session is logged out. Run npm.cmd run wa:connect to relink.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error("Timed out waiting for WhatsApp connection.");
}
