import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { SchedulerWorker } from "../scheduler/SchedulerWorker.js";
import { WhatsAppMessageSender } from "../scheduler/WhatsAppMessageSender.js";
import { BaileysWhatsAppAdapter } from "../whatsapp/BaileysWhatsAppAdapter.js";
import { installGracefulShutdown } from "./gracefulShutdown.js";
import { parseScheduleWorkerArgs } from "./scheduleArgs.js";
import { waitForConnected } from "./waitForConnected.js";

const args = parseScheduleWorkerArgs(process.argv.slice(2));
if (!args.success) {
  console.error(args.message);
  process.exit(1);
}

const adapter = new BaileysWhatsAppAdapter();
const db = openAppDatabase();
let pollTimer: NodeJS.Timeout | undefined;

installGracefulShutdown({
  disconnect: async () => {
    if (pollTimer !== undefined) {
      clearTimeout(pollTimer);
      pollTimer = undefined;
    }
    await adapter.disconnect();
    db.close();
  }
});

await adapter.connect();
await waitForConnected(adapter);

const repository = new ScheduledMessageRepository(db);
const worker = new SchedulerWorker(repository, new WhatsAppMessageSender(adapter));

console.log(`Schedule worker started. pollMs=${args.value.pollMs}`);

while (true) {
  const result = await worker.runOnce();
  if (result.claimed > 0 || result.sendFailed > 0) {
    console.log(
      [
        `timestampUtc=${new Date().toISOString()}`,
        result.messageId === undefined ? undefined : `messageId=${result.messageId}`,
        result.finalStatus === undefined ? undefined : `status=${result.finalStatus}`,
        result.updatedAtUtc === undefined ? undefined : `updatedAtUtc=${result.updatedAtUtc}`,
        `claimed=${result.claimed}`,
        `sent=${result.sent}`,
        `sendFailed=${result.sendFailed}`,
        `retryScheduled=${result.retryScheduled}`,
        `failed=${result.failed}`
      ]
        .filter((part): part is string => part !== undefined)
        .join(" ")
    );
  }

  await new Promise<void>((resolve) => {
    pollTimer = setTimeout(resolve, args.value.pollMs);
  });
  pollTimer = undefined;
}
