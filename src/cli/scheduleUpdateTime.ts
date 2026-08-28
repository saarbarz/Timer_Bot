import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { ScheduleError, ScheduleService } from "../domain/ScheduleService.js";
import { parseScheduleUpdateTimeArgs, resolveScheduledAtLocal } from "./scheduleArgs.js";

const args = parseScheduleUpdateTimeArgs(process.argv.slice(2));
if (!args.success) {
  console.error(args.message);
  process.exit(1);
}

const scheduledAtLocal = resolveScheduledAtLocal(args.value);
if (!scheduledAtLocal.success) {
  console.error(scheduledAtLocal.message);
  process.exit(1);
}

const db = openAppDatabase();

try {
  const service = new ScheduleService(new ScheduledMessageRepository(db));
  const message = service.updateTime(args.value.id, {
    scheduledAtLocal: scheduledAtLocal.value,
    timezone: args.value.timezone
  });

  console.log(`Updated message ${message.id}.`);
  console.log(`status=${message.status}`);
  console.log(`scheduledAtUtc=${message.scheduledAtUtc}`);
  console.log(`timezone=${message.timezone}`);
} catch (error: unknown) {
  if (error instanceof ScheduleError) {
    console.error(`Message was not updated. errorCode=${error.code}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  db.close();
}
