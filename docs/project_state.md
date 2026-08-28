# Project State

## Current Position

- Current chunk: Chunk 8 - Restart / overdue / cancel edge cases is complete.
- Last completed chunk: Chunk 8 - Restart / overdue / cancel edge cases.
- Next allowed chunk: Chunk 9.
- WhatsApp code status: Baileys connection adapter exists, manual QR/device linking was confirmed, one-shot text sending behind `WhatsAppAdapter` was confirmed by real manual send tests, scheduled WhatsApp delivery was confirmed by real manual test, and reconnect lifecycle lives in `ConnectionManager`.

## Environment

- Project path: `C:\Users\Lenovo\IdeaProjects\Timer_Bot`
- Node version observed: `v24.18.0`
- Default timezone: `Asia/Jerusalem`
- PowerShell blocks `npm.ps1`; use `npm.cmd` for npm commands.
- npm version observed through `npm.cmd`: `11.16.0`
- Installed Baileys version: `@whiskeysockets/baileys@7.0.0-rc14`
- npm scripts run TypeScript via `node --import tsx ...` because direct `tsx` executable invocations hung in this Windows environment during post-Chunk 5 testing.

## Architecture Decisions

- Runtime: Node.js 20+.
- Language: TypeScript with `strict: true`.
- Test runner: Vitest.
- SQLite library: `better-sqlite3@13.0.3`.
- Local-only data paths are `auth/`, `auth_old/`, `data/`, and `logs/`.
- WhatsApp auth/session/data artifacts must remain untracked.
- `.idea/`, `*.iml`, and `.venv/` are ignored for future safety, though some IntelliJ files were already staged before the project scaffold.
- WhatsApp transport is behind `src/whatsapp/WhatsAppAdapter.ts`.
- `wa:send` validates CLI input before lazy-loading `BaileysWhatsAppAdapter`, so invalid recipients or empty text fail before WhatsApp transport setup.
- Connection lifecycle and reconnect timers are centralized in `src/whatsapp/ConnectionManager.ts`.
- Temporary disconnects use bounded backoff of 1s, 2s, 5s, 10s, and 30s with small jitter by default.
- Relink-required Baileys closes (`loggedOut`, `connectionReplaced`, `badSession`, `multideviceMismatch`, `forbidden`) map to `needs_relink` and do not reconnect-loop.
- Chunk 2 accepts individual phone-number recipients only. Groups and arbitrary JIDs are rejected before transport.
- QR rendering is handled locally through `qrcode-terminal`; raw QR payloads must not be logged or pasted.
- `printQRInTerminal` is not used.
- WhatsApp logs use structured `WhatsAppLogEvent` objects internally; the default CLI logger prints sanitized human-readable lines.
- Scheduling persistence uses `data/timer-bot.sqlite` by default, overrideable with `DATABASE_PATH`.
- Scheduled message timestamps are stored canonically as UTC ISO strings.
- Local input times are converted to UTC immediately using the supplied IANA timezone.
- Scheduled message states are `pending`, `processing`, `sent`, `failed`, and `cancelled`.
- Chunk 4 exposes scheduling CRUD through `ScheduleService` only.
- Chunk 5 adds `SchedulerWorker`, which claims at most one due pending message per run and uses a `MessageSender` abstraction for deterministic tests.
- Scheduler claiming is atomic at the SQLite repository layer: a due row is selected and changed from `pending` to `processing` inside one transaction, with a guarded `WHERE status = 'pending'` update.
- Successful scheduled sends are marked with `status='sent'`, `sent_at_utc`, and `provider_message_id` only after the sender returns success.
- Chunk 6 adds `next_attempt_at_utc` through migration `002_add_next_attempt_at`.
- Scheduled-message attempts count actual send attempts, including the final successful attempt.
- Retryable send failures move from `processing` back to `pending`, increment `attempts`, set sanitized `last_error`, and set `next_attempt_at_utc`.
- Terminal send failures move from `processing` to `failed`, increment `attempts`, clear `next_attempt_at_utc`, and set sanitized `last_error`.
- Default send retry delays are 10s, 30s, 2m, and 5m, with max attempts set to 4.
- Unknown failures default to terminal/no retry unless `retryUnknownFailures` is enabled for the worker.
- Chunk 6 intentionally does not wire the worker to the real Baileys adapter.
- Chunk 7 adds CLI scripts for scheduling, listing, cancelling, and running the real polling worker.
- `schedule` supports `--at <YYYY-MM-DDTHH:mm[:ss]>` and `--in <duration>` for short manual tests such as `--in 90s`.
- `schedule:update-time` supports changing the due time of a pending scheduled message using `--at` or `--in`.
- `schedule:list` prints message id/status/local timestamps/canonical UTC timestamps/retry metadata only; it does not print recipient numbers or message text.
- `schedule:worker` connects to WhatsApp, waits for `connected`, then polls SQLite and sends due messages through `WhatsAppMessageSender`.
- `schedule:worker` recovers stale `processing` rows after 10 minutes by default, overrideable with `--stale-processing-ms`.
- Scheduled real sends now pass through `WhatsAppMessageSender`, which adapts stored normalized recipient data to the existing `WhatsAppAdapter.sendText()` API.
- `src/index.ts` uses `pathToFileURL` for direct-execution detection so startup smoke output works with Windows paths.

## Resume Instructions

1. Read `docs/documentation_instructions.md`.
2. Read `docs/implementation_log.md`.
3. Run `git status --short`.
4. Chunk 1 manual QR verification is complete. The user confirmed `connection=open` and that WhatsApp shows a new linked device on 2026-08-24.
5. Chunk 2 manual send verification is complete. The user confirmed one real test message arrived successfully on 2026-08-25.
6. Chunk 3 manual restart/no-new-QR/send verification is complete. The user confirmed a real send succeeded on 2026-08-27 after reconnecting without a new QR.
7. Chunk 4 SQLite scheduling CRUD is complete and verified by integration tests.
8. Chunk 5 worker atomic claim/idempotency is complete and verified by SQLite integration tests.
9. Post-Chunk 5 bug hunt is complete. Startup smoke commands and safe invalid `wa:send` validation paths were reverified.
10. Chunk 6 retry/failure policy is complete and verified by SQLite integration tests.
11. Chunk 7 automated implementation is complete and verified by tests/build/safe CLI smoke. User confirmed one real scheduled WhatsApp delivery worked on 2026-08-27.
12. Chunk 8 automated implementation is complete and verified by tests/build/safe CLI smoke. User confirmed the Chunk 8 manual restart test worked on 2026-08-28 after stopping the foreground worker once with Ctrl+C and restarting it. User also confirmed the Chunk 8 manual cancel test worked on 2026-08-28: the message was not sent and `schedule:list` showed it was cancelled.

## Important Caveat

The scheduler can prevent normal duplicate sends in its own database logic, but true exactly-once WhatsApp delivery cannot be guaranteed. A crash or hard interruption after WhatsApp accepts a message but before SQLite records `sent` can leave the app unable to know whether the provider already delivered it.

Chunk 6 deliberately treats unknown send failures as terminal by default. This favors avoiding possible duplicate sends over retrying an ambiguous result. The behavior is configurable for fake/test senders or future carefully classified provider errors.

Chunk 7 manual E2E confirmation is complete. Automated tests still intentionally avoid connecting to live WhatsApp or sending external messages.

Chunk 8 stale-processing recovery can retry a row that was stuck in `processing`, which fixes the crash-before-send case. It still cannot prove whether WhatsApp accepted a message immediately before a crash, so that known exactly-once hard case remains.
