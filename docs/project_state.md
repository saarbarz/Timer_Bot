# Project State

## Current Position

- Current chunk: Chunk 4 - Scheduling domain + SQLite is complete.
- Last completed chunk: Chunk 4 - Scheduling domain + SQLite.
- Next allowed chunk: Chunk 5 - Worker + atomic claim + idempotency.
- WhatsApp code status: Baileys connection adapter exists, manual QR/device linking was confirmed, one-shot text sending behind `WhatsAppAdapter` was confirmed by real manual send tests, and reconnect lifecycle lives in `ConnectionManager`.

## Environment

- Project path: `C:\Users\Lenovo\IdeaProjects\Timer_Bot`
- Node version observed: `v24.18.0`
- Default timezone: `Asia/Jerusalem`
- PowerShell blocks `npm.ps1`; use `npm.cmd` for npm commands.
- npm version observed through `npm.cmd`: `11.16.0`
- Installed Baileys version: `@whiskeysockets/baileys@7.0.0-rc14`

## Architecture Decisions

- Runtime: Node.js 20+.
- Language: TypeScript with `strict: true`.
- Test runner: Vitest.
- SQLite library: `better-sqlite3@13.0.3`.
- Local-only data paths are `auth/`, `auth_old/`, `data/`, and `logs/`.
- WhatsApp auth/session/data artifacts must remain untracked.
- `.idea/`, `*.iml`, and `.venv/` are ignored for future safety, though some IntelliJ files were already staged before the project scaffold.
- WhatsApp transport is behind `src/whatsapp/WhatsAppAdapter.ts`.
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
- Chunk 4 exposes scheduling CRUD through `ScheduleService` only. It does not run a worker or send scheduled messages.

## Resume Instructions

1. Read `docs/documentation_instructions.md`.
2. Read `docs/implementation_log.md`.
3. Run `git status --short`.
4. Chunk 1 manual QR verification is complete. The user confirmed `connection=open` and that WhatsApp shows a new linked device on 2026-08-24.
5. Chunk 2 manual send verification is complete. The user confirmed one real test message arrived successfully on 2026-08-25.
6. Chunk 3 manual restart/no-new-QR/send verification is complete. The user confirmed a real send succeeded on 2026-08-27 after reconnecting without a new QR.
7. Chunk 4 SQLite scheduling CRUD is complete and verified by integration tests. Implement only Chunk 5 next.

## Important Caveat

The scheduler can prevent normal duplicate sends in its own database logic, but true exactly-once WhatsApp delivery cannot be guaranteed. A crash or hard interruption after WhatsApp accepts a message but before SQLite records `sent` can leave the app unable to know whether the provider already delivered it.
