# Project State

## Current Position

- Current chunk: Chunk 3 - Persistent session & reconnect automated implementation is complete; manual restart/send verification is pending.
- Last completed chunk: Chunk 2 - Send Now.
- Next allowed chunk: Complete the Chunk 3 manual restart/no-new-QR/send test. Chunk 4 is not allowed until that is confirmed.
- WhatsApp code status: Baileys connection adapter exists, manual QR/device linking was confirmed, one-shot text sending behind `WhatsAppAdapter` was confirmed by a real manual send test, and reconnect lifecycle now lives in `ConnectionManager`.

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

## Resume Instructions

1. Read `docs/documentation_instructions.md`.
2. Read `docs/implementation_log.md`.
3. Run `git status --short`.
4. Chunk 1 manual QR verification is complete. The user confirmed `connection=open` and that WhatsApp shows a new linked device on 2026-08-24.
5. Chunk 2 manual send verification is complete. The user confirmed one real test message arrived successfully on 2026-08-25.
6. Chunk 3 automated implementation is present and verified. Ask the user to perform the restart/no-new-QR/send manual test before moving to Chunk 4.

## Important Caveat

The scheduler can prevent normal duplicate sends in its own database logic, but true exactly-once WhatsApp delivery cannot be guaranteed. A crash or hard interruption after WhatsApp accepts a message but before SQLite records `sent` can leave the app unable to know whether the provider already delivered it.
