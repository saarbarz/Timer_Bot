import { openAppDatabase } from "../db/Database.js";
import { ScheduledMessageRepository } from "../db/ScheduledMessageRepository.js";
import { ScheduleError, ScheduleService } from "../domain/ScheduleService.js";
import { parseScheduleCreateArgs, resolveScheduledAtLocal } from "./scheduleArgs.js";

const args = parseScheduleCreateArgs(process.argv.slice(2));
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
  const message = service.create({
    recipient: args.value.to,
    text: args.value.text,
    scheduledAtLocal: scheduledAtLocal.value,
    timezone: args.value.timezone
  });

  console.log(`Scheduled message ${message.id}.`);
  console.log(`status=${message.status}`);
  console.log(`scheduledAtUtc=${message.scheduledAtUtc}`);
  console.log(`timezone=${message.timezone}`);
} catch (error: unknown) {
  if (error instanceof ScheduleError) {
    console.error(`Message was not scheduled. errorCode=${error.code}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
} finally {
  db.close();
}
