import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";

const adapter = new BaileysWhatsAppAdapter();

process.on("SIGINT", () => {
  void adapter.disconnect().finally(() => process.exit(0));
});

await adapter.connect();

console.log("Waiting for WhatsApp connection updates. Press Ctrl+C to stop.");
