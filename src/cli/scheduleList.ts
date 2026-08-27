import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";

const db = openAppDatabase();

try {
  const repository = new ScheduledMessageRepository(db);
  const messages = repository.list();

  if (messages.length === 0) {
    console.log("No scheduled messages.");
  } else {
    for (const message of messages) {
      const parts = [
        `id=${message.id}`,
        `status=${message.status}`,
        `scheduledAtUtc=${message.scheduledAtUtc}`,
        `timezone=${message.timezone}`,
        `attempts=${message.attempts}`,
        message.nextAttemptAtUtc === undefined ? undefined : `nextAttemptAtUtc=${message.nextAttemptAtUtc}`,
        message.sentAtUtc === undefined ? undefined : `sentAtUtc=${message.sentAtUtc}`,
        message.providerMessageId === undefined ? undefined : `providerMessageId=${message.providerMessageId}`,
        message.lastError === undefined ? undefined : `lastError=${message.lastError}`
      ].filter((part): part is string => part !== undefined);

      console.log(parts.join(" "));
    }
  }
} finally {
  db.close();
}
