import qrcode from "qrcode-terminal";

import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";
import type { WhatsAppConnectionStatus } from "../whatsapp/WhatsAppAdapter.js";

export interface ConnectionController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): WhatsAppConnectionStatus;
  getQrTerminal(): string | undefined;
}

export function createBaileysConnectionController(): ConnectionController {
  let latestQrTerminal: string | undefined;
  const adapter = new BaileysWhatsAppAdapter({
    renderQr: (qr) => {
      qrcode.generate(qr, { small: true }, (output) => {
        latestQrTerminal = output;
      });
    }
  });

  return {
    async connect(): Promise<void> {
      await adapter.connect();
    },
    async disconnect(): Promise<void> {
      await adapter.disconnect();
    },
    getStatus(): WhatsAppConnectionStatus {
      return adapter.getStatus();
    },
    getQrTerminal(): string | undefined {
      return latestQrTerminal;
    }
  };
}
