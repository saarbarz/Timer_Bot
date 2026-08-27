import {
  isValidSendTextNowRequest,
  sendTextNow,
  validateSendTextNowRequest
} from "../whatsapp/SendTextNow.js";
import { installGracefulShutdown } from "./gracefulShutdown.js";
import { waitForConnected } from "./waitForConnected.js";

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
  const validation = validateSendTextNowRequest(sendArgs);
  if (!isValidSendTextNowRequest(validation)) {
    console.error(`Message was not sent. errorCode=${validation.errorCode}, retryable=${validation.retryable === true}`);
    process.exitCode = 1;
    return;
  }

  const { BaileysWhatsAppAdapter } = await import("../whatsapp/BaileysWhatsAppAdapter.js");
  const adapter = new BaileysWhatsAppAdapter();

  installGracefulShutdown(adapter);

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
