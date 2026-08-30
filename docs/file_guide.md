# File Guide

## Root Files

- `package.json`: npm scripts, project metadata, runtime dependencies, and development dependencies.
- `tsconfig.json`: strict TypeScript compiler configuration.
- `.gitignore`: excludes dependencies, build output, local environment files, WhatsApp auth/session state including `auth_old/`, local data, logs, local backups, and IDE metadata.
- `.dockerignore`: excludes local/generated state and development metadata from Docker build context.
- `Dockerfile`: single-user long-running service image with persistent `/app/data` and `/app/auth` volumes, non-root runtime user, and a privacy-safe healthcheck.
- `README.md`: setup and command reference.

## Source

- `src/index.ts`: minimal application entry point, smoke-testable startup summary, and Windows-safe direct-execution detection.
- `src/audit/AuditLogger.ts`: sanitized audit-event logger for schedule/create/cancel/send outcomes without credentials, recipients, JIDs, QR payloads, or message text.
- `src/backup/DatabaseBackup.ts`: SQLite-only backup helper that writes database backups without copying WhatsApp auth/session state.
- `src/cli/backupDatabase.ts`: `npm.cmd run backup:db` entry point for database-only backups.
- `src/cli/gracefulShutdown.ts`: shared SIGINT/SIGTERM shutdown hook for CLI commands.
- `src/cli/schedule.ts`: creates scheduled messages from CLI input, stores them in SQLite without connecting to WhatsApp, and emits sanitized `schedule_created` audit events.
- `src/cli/scheduleArgs.ts`: pure parser and relative-time resolver for schedule/list/cancel/worker CLI arguments.
- `src/cli/scheduleCancel.ts`: cancels one pending scheduled message by id and emits sanitized `cancelled` audit events.
- `src/cli/scheduleList.ts`: lists scheduled messages with privacy-safe status/timestamp metadata only.
- `src/cli/scheduleListFormat.ts`: formats schedule-list output with local timestamp fields plus canonical UTC fields, without recipient numbers or message text.
- `src/cli/scheduleUpdateTime.ts`: reschedules one pending scheduled message using an absolute or relative time.
- `src/cli/scheduleWorker.ts`: process-mode scheduler that connects to WhatsApp, polls SQLite for due messages to send, applies the internal per-minute send limit, and emits sanitized send audit events.
- `src/cli/waitForConnected.ts`: shared helper for waiting until a WhatsApp adapter reports `connected` or `needs_relink`.
- `src/config/AppConfig.ts`: local configuration for default timezone, generated local paths, web/service ports, bind host, service poll interval, UI auth username/password, send rate limit, backup directory, Chunk 13 spike mode, and opt-in Baileys full-history sync mode.
- `src/domain/Clock.ts`: injectable clock abstraction for deterministic scheduling tests.
- `src/domain/ScheduledMessage.ts`: scheduled message status values and domain shape, including optional `nextAttemptAtUtc` retry timing.
- `src/domain/ScheduleService.ts`: scheduling CRUD service that validates recipient/text/time, converts local time to UTC, creates pending messages, lists messages, updates pending times, and cancels pending messages.
- `src/domain/Timezone.ts`: IANA timezone conversion helper for local datetime input to UTC.
- `src/domain/UserId.ts`: fixed local user ids for the Chunk 13 two-session spike and validation for known local user ids.
- `src/db/Database.ts`: opens the SQLite database, creates the data directory, applies pragmas, and runs migrations.
- `src/db/Migrations.ts`: migration runner with `schema_migrations`.
- `src/db/ScheduledMessageRepository.ts`: SQLite repository for scheduled message create/find/list/cancel/update-time operations, atomic due-message claiming, sent marking, retry scheduling, failed marking, and stale-processing recovery.
- `src/scheduler/MessageSender.ts`: fakeable scheduled-message sender abstraction used by the worker.
- `src/scheduler/RateLimitedMessageSender.ts`: internal per-minute scheduled-send limiter used by service and standalone worker.
- `src/scheduler/RetryPolicy.ts`: retry/failure classification, default send backoff schedule, max-attempt defaults, unknown-failure behavior, and `last_error` sanitization.
- `src/scheduler/SchedulerWorker.ts`: deterministic single-message worker that recovers stale `processing` rows, claims one due pending message, invokes `MessageSender`, marks successful sends as `sent`, schedules retryable failures, and marks terminal/max-attempt failures as `failed`.
- `src/scheduler/WhatsAppMessageSender.ts`: adapts stored scheduled messages to the real `WhatsAppAdapter.sendText()` transport API.
- `src/db/migrations/001_create_scheduled_messages.ts`: creates `scheduled_messages` and its due-message index.
- `src/db/migrations/002_add_next_attempt_at.ts`: adds `next_attempt_at_utc` and updates the due-message index for retry scheduling.
- `src/db/migrations/003_add_user_id_to_scheduled_messages.ts`: adds `user_id` ownership to scheduled messages, migrates existing rows to `local-user`, and adds a user-scoped due-message index.
- `src/cli/waConnect.ts`: manual CLI for opening a Baileys WhatsApp connection and showing the linked-device QR.
- `src/cli/waSend.ts`: manual one-shot CLI for validating a send request, lazy-loading the Baileys adapter only after validation passes, connecting to WhatsApp, and sending one text message to an explicit phone-number recipient.
- `src/server/ConnectionController.ts`: in-memory connection/QR/recipient controller for the local web server, backed by `BaileysWhatsAppAdapter` in production and able to expose the managed adapter for the combined service.
- `src/server/HealthStatus.ts`: privacy-safe health report builder for process liveness, DB reachability/migration state, and collapsed WhatsApp connection state.
- `src/server/HttpAuth.ts`: HTTP Basic auth helpers and non-loopback bind guard for UI/API exposure.
- `src/server/LocalWebServer.ts`: localhost HTTP request handler and server factory with JSON API routes over `ScheduleService`, connection status, QR display, optional recipient suggestions from Baileys plus local scheduled-recipient fallback, and `/health`.
- `src/server/localWebUiHtml.ts`: minimal local browser UI for connection status, QR display, schedule creation with optional recent recipient suggestions/fallback dropdown, split date/time scheduling controls, listing, pending edits, and cancellation.
- `src/server/SingleUserService.ts`: long-running single-user service runtime that opens/migrates SQLite, serves the local web UI/API, and polls the scheduler worker with one shared WhatsApp adapter.
- `src/server/startLocalWebServer.ts`: `npm.cmd run web` entry point.
- `src/server/startSingleUserService.ts`: `npm.cmd run service` entry point with graceful shutdown and optional `CHUNK13_MULTI_USER_SPIKE=1` two-user local spike mode.
- `src/server/UserSessionManager.ts`: Chunk 13 fixed-user session manager with per-user auth directories, per-user managed connection controllers, per-user disconnect, and sanitized process/session metrics.
- `src/whatsapp/WhatsAppAdapter.ts`: transport interface, recipient option shape, and internal send result types that future scheduler code must depend on instead of Baileys directly.
- `src/whatsapp/BaileysConnectionState.ts`: pure mapping from Baileys connection updates to internal connection statuses.
- `src/whatsapp/ConnectionManager.ts`: centralized lifecycle manager for connection status, bounded reconnect backoff, timer cancellation, and shutdown.
- `src/whatsapp/BaileysWhatsAppAdapter.ts`: Baileys-backed adapter that opens/closes sockets, registers connection and credential events, optionally requests full-history sync for contact/chat testing, persists auth under `auth/`, renders QR codes, sends individual text messages, and reports credential-save failures through structured logs.
- `src/whatsapp/RecipientOptions.ts`: pure mapping and in-memory store for optional recent recipient suggestions sourced from Baileys chat/contact/message events, phone-number fields, and LID-to-phone mappings, deduped by individual JID.
- `src/whatsapp/RecipientNormalizer.ts`: pure recipient normalization and validation for phone-number based individual WhatsApp recipients.
- `src/whatsapp/SendTextNow.ts`: validation-first send-now service and reusable request validator that convert validation and transport failures into `SendResult`.

## Tests

- `test/unit/config.test.ts`: Chunk 0 smoke tests for config/startup wiring and the Windows direct-execution regression.
- `test/integration/DatabaseBackup.test.ts`: Chunk 12 test proving database backup preserves SQLite data without copying auth files.
- `test/integration/ScheduleService.sqlite.test.ts`: Chunk 4 integration tests against temporary SQLite databases for migrations, create/list/update/cancel rules, persistence after reopen, and timezone conversion.
- `test/unit/UserSessionManager.test.ts`: Chunk 13 tests for per-user auth directory isolation, unknown-user rejection, sanitized metrics, and disconnecting one session without touching another.
- `test/integration/SchedulerWorker.sqlite.test.ts`: Chunk 5 through Chunk 8 integration tests for due-message claiming, future/cancelled exclusion, successful sent marking, no duplicate sends, overdue restart behavior, cancelled-message exclusion, reschedule timing, stale-processing recovery, retry backoff, terminal failure, max attempts, recovery after retry, retry metadata cleanup, and migrating an existing Chunk 4 database.
- `test/integration/LocalWebServer.test.ts`: Chunk 9 through Chunk 13 API/local UI smoke tests against a temporary SQLite database and fake connection controller, including optional recipient suggestions, scheduled-recipient dropdown fallback, manual recipient entry, Basic auth, health sanitization, and auth/data path exposure checks.
- `test/integration/SingleUserService.test.ts`: Chunk 11 and Chunk 12 service tests for startup migration, health redaction, process-style restart persistence, no duplicate send after a sent row is restarted, non-loopback auth guard, occupied port handling, and sanitized send audit events.
- `test/unit/AuditLogger.test.ts`: Chunk 12 test for sanitized audit logging.
- `test/unit/BaileysConnectionState.test.ts`: Chunk 1 connection status transition tests.
- `test/unit/BaileysReconnect.test.ts`: reconnect decision tests, including relink-required Baileys close codes.
- `test/unit/BaileysEventHandlers.test.ts`: tests for event handler registration, credential save callback wiring, QR forwarding, and credential-save error reporting.
- `test/unit/ConnectionManager.test.ts`: fake-timer tests for bounded reconnect backoff, no reconnect on relink-required closes, and shutdown timer cancellation.
- `test/unit/RecipientNormalizer.test.ts`: Chunk 2 tests for phone-number normalization and group rejection.
- `test/unit/RecipientOptions.test.ts`: Chunk 10 tests for Baileys chat/contact mapping, individual-recipient filtering, and dedupe by JID.
- `test/unit/RateLimitedMessageSender.test.ts`: Chunk 12 test for per-minute scheduled-send limiting.
- `test/unit/SendTextNow.test.ts`: Chunk 2 tests for validation without an adapter, empty text rejection, exactly-one adapter call on success, and transport exception mapping.
- `test/unit/scheduleArgs.test.ts`: Chunk 7 and Chunk 8 tests for schedule/create/cancel/update-time/worker CLI argument parsing, `--in` relative time resolution, and stale-processing worker options.
- `test/unit/scheduleListFormat.test.ts`: tests local timestamp formatting for `schedule:list` and guards against printing recipient or message text.
- `test/unit/WhatsAppMessageSender.test.ts`: Chunk 7 tests for adapting scheduled messages to the WhatsApp adapter and preserving failure classification.

## Documentation

- `docs/implementation_log.md`: chunk-by-chunk implementation and verification log.
- `docs/documentation_instructions.md`: rules for maintaining documentation in future sessions.
- `docs/project_state.md`: current status and resume information.
- `docs/file_guide.md`: explanation of important project files.
- `docs/bug_log.md`: open and resolved bugs by chunk/version.
- `docs/future_architecture_plan.md`: public-use safety gate and future local sender agent / cloud scheduler architecture direction.
- `docs/chunk13_multi_user_spike_design.md`: local-only two-session Chunk 13 design spike, acceptance mapping, metrics, risks, and implementation order.
- `docs/WhatsApp_Send_Later_Codex_Implementation_Plan_HE.docx`: source implementation plan copied from the user-provided document.
