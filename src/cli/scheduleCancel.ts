import { consoleAuditLogger } from "../audit/AuditLogger.js";
import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { ScheduleError, ScheduleService } from "../domain/ScheduleService.js";
import { parseScheduleCancelArgs } from "./scheduleArgs.js";

const args = parseScheduleCancelArgs(process.argv.slice(2));
if (!args.success) {
  console.error(args.message);
  process.exit(1);
}

const db = openAppDatabase();

try {
  const service = new ScheduleService(new ScheduledMessageRepository(db));
  const message = service.cancel(args.value.id);

  console.log(`Cancelled message ${message.id}.`);
  console.log(`status=${message.status}`);
  console.log(`updatedAtUtc=${message.updatedAtUtc}`);
  consoleAuditLogger({ event: "cancelled", messageId: message.id, status: message.status });
} catch (error: unknown) {
  if (error instanceof ScheduleError) {
    console.error(`Message was not cancelled. errorCode=${error.code}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  db.close();
}
