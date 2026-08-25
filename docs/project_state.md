# Project State

## Current Position

- Current chunk: Chunk 3 - Persistent session & reconnect is allowed next.
- Last completed chunk: Chunk 2 - Send Now.
- Next allowed chunk: Chunk 3 - Persistent session & reconnect.
- WhatsApp code status: Baileys connection adapter exists, manual QR/device linking was confirmed, and one-shot text sending behind `WhatsAppAdapter` was confirmed by a real manual send test.

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
- Chunk 2 accepts individual phone-number recipients only. Groups and arbitrary JIDs are rejected before transport.
- QR rendering is handled locally through `qrcode-terminal`; raw QR payloads must not be logged or pasted.
- `printQRInTerminal` is not used.

## Resume Instructions

1. Read `docs/documentation_instructions.md`.
2. Read `docs/implementation_log.md`.
3. Run `git status --short`.
4. Chunk 1 manual QR verification is complete. The user confirmed `connection=open` and that WhatsApp shows a new linked device on 2026-08-24.
5. Chunk 2 manual send verification is complete. The user confirmed one real test message arrived successfully on 2026-08-25.
6. Implement only the next allowed chunk: Chunk 3 - Persistent session & reconnect.

## Important Caveat

The scheduler can prevent normal duplicate sends in its own database logic, but true exactly-once WhatsApp delivery cannot be guaranteed. A crash or hard interruption after WhatsApp accepts a message but before SQLite records `sent` can leave the app unable to know whether the provider already delivered it.
