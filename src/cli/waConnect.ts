import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";
import { installGracefulShutdown } from "./gracefulShutdown.js";

const adapter = new BaileysWhatsAppAdapter();

installGracefulShutdown(adapter);

await adapter.connect();

console.log("Waiting for WhatsApp connection updates. Press Ctrl+C to stop.");
