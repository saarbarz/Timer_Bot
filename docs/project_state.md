# Project State

## Current Position

- Current chunk: Chunk 13 - Multi-user spike automated implementation is complete; manual two-account WhatsApp verification is pending.
- Last completed chunk: Chunk 12 - Security Hardening.
- Next allowed chunk: Chunk 13 manual two-account verification. Do not move to Chunk 14 until manual acceptance is complete or explicitly waived.
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
- Local-only data paths are `auth/`, `auth_old/`, `data/`, `logs/`, and `backups/`.
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
- Chunk 9 adds `npm.cmd run web`, a localhost-only HTTP server at `127.0.0.1:<PORT>` with `PORT=3000` by default.
- The local web UI supports connection status, in-memory QR display, schedule creation, schedule listing, pending-message text/time edits, and pending-message cancellation.
- The HTTP API is a thin layer over `ScheduleService`; frontend code does not write directly to SQLite.
- The QR shown through the web API is held in process memory only and is not written to logs or SQLite.
- Chunk 10 inspected installed Baileys events and found `messaging-history.set`, `chats.upsert`, `chats.update`, `contacts.upsert`, and `contacts.update` available for optional recipient suggestions.
- Recent recipient options are kept in memory inside the Baileys-backed adapter, deduped by individual `@s.whatsapp.net` JID, and exposed to the local UI through `/api/recipients`.
- Recipient suggestions are optional; manual phone-number entry remains the scheduling fallback when no chat/contact data is available.
- Chunk 11 adds `npm.cmd run service`, a single long-lived process that serves the local UI/API and runs scheduler polling with one shared WhatsApp adapter.
- The service opens SQLite and runs migrations before constructing worker polling.
- The service skips worker sends unless WhatsApp status is `connected`; degraded or relink-required states are reported through health instead of sending.
- `/health` reports process liveness, DB reachability/migration state, and collapsed WhatsApp state without phone numbers, QR payloads, session data, message text, or auth details.
- Docker packaging uses `/app/data` and `/app/auth` as persistent volumes and runs the combined service with `BIND_HOST=0.0.0.0`.
- Chunk 12 treats WhatsApp auth state as account-session credential material and keeps it out of web static serving, logs, backups, and git tracking.
- `backups/` is ignored; `npm.cmd run backup:db` backs up SQLite only and intentionally excludes the WhatsApp auth directory.
- `BIND_HOST` values beyond `127.0.0.1`, `localhost`, or `::1` require `UI_AUTH_PASSWORD`; protected UI/API routes use HTTP Basic auth, while `/health` remains unauthenticated and sanitized for health checks.
- `MAX_SCHEDULED_SENDS_PER_MINUTE` defaults to 10 and rate-limits scheduled sends in both the combined service and standalone worker.
- Sanitized audit events are emitted for `schedule_created`, `cancelled`, `send_success`, and `send_failure` without credentials, phone numbers, JIDs, QR payloads, or message text.
- Docker runtime now runs as the non-root `node` user after creating `/app/data` and `/app/auth`.
- `src/index.ts` uses `pathToFileURL` for direct-execution detection so startup smoke output works with Windows paths.
- Future public or multi-user deployment must not be built by simply exposing the current local service with stronger auth. The plan now includes a public-use safety gate in `docs/future_architecture_plan.md`: keep WhatsApp auth/session state on a user-run local sender agent, and use any future cloud component only as a scheduler/control plane.
- Chunk 13 is an opt-in local-only two-session spike enabled with `CHUNK13_MULTI_USER_SPIKE=1`.
- Chunk 13 adds fixed internal users `test-user-a` and `test-user-b`; arbitrary user ids are rejected.
- Chunk 13 stores scheduler ownership in `scheduled_messages.user_id` through migration `003_add_user_id_to_scheduled_messages`; pre-existing rows migrate to `local-user`.
- Chunk 13 per-user auth state lives under `auth/users/<userId>/` and remains ignored/sensitive.
- Chunk 13 `UserSessionManager` creates separate managed WhatsApp adapters/controllers per fixed user id and records sanitized session metrics.
- Chunk 13 service mode can run one scheduler worker per fixed local user when the opt-in spike flag is enabled.
- Chunk 13 local UI/API exposes a local-user selector, `/api/users`, and sanitized `/api/metrics`.

## Resume Instructions

1. Read `docs/documentation_instructions.md`.
2. Read `docs/implementation_log.md`.
3. Read `docs/future_architecture_plan.md` before any public, multi-user, cloud, or remote-agent planning.
4. Read `docs/chunk13_multi_user_spike_design.md` before implementing Chunk 13.
5. Run `git status --short`.
6. Chunk 1 manual QR verification is complete. The user confirmed `connection=open` and that WhatsApp shows a new linked device on 2026-08-24.
7. Chunk 2 manual send verification is complete. The user confirmed one real test message arrived successfully on 2026-08-25.
8. Chunk 3 manual restart/no-new-QR/send verification is complete. The user confirmed a real send succeeded on 2026-08-27 after reconnecting without a new QR.
9. Chunk 4 SQLite scheduling CRUD is complete and verified by integration tests.
10. Chunk 5 worker atomic claim/idempotency is complete and verified by SQLite integration tests.
11. Post-Chunk 5 bug hunt is complete. Startup smoke commands and safe invalid `wa:send` validation paths were reverified.
12. Chunk 6 retry/failure policy is complete and verified by SQLite integration tests.
13. Chunk 7 automated implementation is complete and verified by tests/build/safe CLI smoke. User confirmed one real scheduled WhatsApp delivery worked on 2026-08-27.
14. Chunk 8 automated implementation is complete and verified by tests/build/safe CLI smoke. User confirmed the Chunk 8 manual restart test worked on 2026-08-28 after stopping the foreground worker once with Ctrl+C and restarting it. User also confirmed the Chunk 8 manual cancel test worked on 2026-08-28: the message was not sent and `schedule:list` showed it was cancelled.
15. Chunk 9 local web UI is complete and verified by API tests, UI smoke, typecheck, tests, build, and a localhost server smoke.
16. Chunk 10 recipient UX is complete and verified by mapper tests, local web API tests, typecheck, full test suite, and build.
17. Chunk 11 single-user deployment is complete and verified by typecheck, full test suite, build, health redaction coverage, process-style restart persistence coverage, and no-duplicate-sent restart coverage. Docker CLI was present, but Docker Desktop/Linux engine was not running, so image build smoke could not start.
18. Post-Chunk 11 occupied-port fix is complete and committed/pushed.
19. Chunk 12 security hardening is complete and verified by typecheck, full test suite, build, HTTP auth/path exposure tests, backup exclusion tests, rate-limit tests, audit sanitization tests, secret-pattern scan, and diff check. Docker image build smoke still could not start because Docker Desktop/Linux engine was not running.
20. Chunk 13 design was documented and committed/pushed in `53efad9`.
21. Chunk 13 automated implementation is complete and verified by typecheck, full test suite, and build. Manual two-account WhatsApp verification is still pending and requires two separate WhatsApp test accounts/devices.

## Important Caveat

The scheduler can prevent normal duplicate sends in its own database logic, but true exactly-once WhatsApp delivery cannot be guaranteed. A crash or hard interruption after WhatsApp accepts a message but before SQLite records `sent` can leave the app unable to know whether the provider already delivered it.

Chunk 6 deliberately treats unknown send failures as terminal by default. This favors avoiding possible duplicate sends over retrying an ambiguous result. The behavior is configurable for fake/test senders or future carefully classified provider errors.

Chunk 7 manual E2E confirmation is complete. Automated tests still intentionally avoid connecting to live WhatsApp or sending external messages.

Chunk 8 stale-processing recovery can retry a row that was stuck in `processing`, which fixes the crash-before-send case. It still cannot prove whether WhatsApp accepted a message immediately before a crash, so that known exactly-once hard case remains.

The combined `npm.cmd run service` command should be preferred for long-running single-user usage because it shares one Baileys adapter between UI and worker polling. If using the older separate `npm.cmd run web` and `npm.cmd run schedule:worker` commands, do not use both WhatsApp connection paths at once with the same `auth/` session.
