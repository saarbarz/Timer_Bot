import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { formatScheduleListLine } from "./scheduleListFormat.js";

const db = openAppDatabase();

try {
  const repository = new ScheduledMessageRepository(db);
  const messages = repository.list();

  if (messages.length === 0) {
    console.log("No scheduled messages.");
  } else {
    for (const message of messages) {
      console.log(formatScheduleListLine(message));
    }
  }
} finally {
  db.close();
}
