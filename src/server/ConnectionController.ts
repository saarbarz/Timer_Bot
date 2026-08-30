import qrcode from "qrcode-terminal";

import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";
import type { BaileysWhatsAppAdapterOptions } from "../whatsapp/BaileysWhatsAppAdapter.js";
import type {
  RecipientOption,
  RecipientOptionStats,
  WhatsAppAdapter,
  WhatsAppConnectionStatus
} from "../whatsapp/WhatsAppAdapter.js";

export interface ConnectionController {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): WhatsAppConnectionStatus;
  getQrTerminal(): string | undefined;
  getRecipientOptions(): RecipientOption[];
  getRecipientStats(): RecipientOptionStats;
}

export interface ManagedConnectionController {
  readonly adapter: WhatsAppAdapter;
  readonly connection: ConnectionController;
}

export function createBaileysConnectionController(): ConnectionController {
  return createManagedBaileysConnectionController().connection;
}

export function createManagedBaileysConnectionController(
  options: Pick<BaileysWhatsAppAdapterOptions, "authDir" | "log"> = {}
): ManagedConnectionController {
  let latestQrTerminal: string | undefined;
  const adapter = new BaileysWhatsAppAdapter({
    authDir: options.authDir,
    log: options.log,
    renderQr: (qr) => {
      qrcode.generate(qr, { small: true }, (output) => {
        latestQrTerminal = output;
      });
    }
  });

  return {
    adapter,
    connection: {
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
      },
      getRecipientOptions(): RecipientOption[] {
        return adapter.getRecipientOptions();
      },
      getRecipientStats(): RecipientOptionStats {
        return adapter.getRecipientStats();
      }
    }
  };
}
