# Timer Bot

Local WhatsApp send-later proof of concept.

## Prerequisites

- Node.js 20 or newer.
- npm.

On this Windows machine, PowerShell currently blocks `npm.ps1`. Use `npm.cmd` if plain `npm` fails with an execution policy error.

## Commands

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
npm.cmd run wa:connect
npm.cmd run wa:send -- --to <country-code-number> --text "test message"
```

The npm scripts invoke TypeScript through `node --import tsx` for reliable process exit behavior on this Windows setup.

## Current Scope

The project has completed Chunk 6: Retry & failure policy. It can reuse the saved WhatsApp linked-device session, send one explicit text message, create/list/update/cancel scheduled messages in SQLite, run a deterministic scheduler worker against a fakeable sender, and apply bounded retry/terminal failure handling for scheduled sends. The real Baileys adapter is not wired to scheduled sends yet. The next allowed chunk is Chunk 7: End-to-end CLI scheduling.

Post-Chunk 5 bug-hunt fixes are also complete: the startup entry point now prints correctly on Windows, `wa:send` validates invalid input before loading or connecting WhatsApp transport, and safe smoke commands have been reverified.

## WhatsApp QR Link Test

Run:

```powershell
npm.cmd run wa:connect
```

Then scan the QR from WhatsApp > Linked devices. The QR payload and auth files are sensitive; do not paste them into chat or commit them.

## WhatsApp Send Now Test

Use a test number or consenting recipient only, with country code and no leading local-only zero:

```powershell
npm.cmd run wa:send -- --to <country-code-number> --text "test message"
```

Send one test message only for Chunk 2, then confirm it appears on both the sender and receiver sides. Phone numbers and message contents are sensitive; do not paste real details into chat or commit them.

## Chunk 3 Manual Restart Test

1. Run `npm.cmd run wa:connect`.
2. Confirm it reaches `WhatsApp connection is open.` without showing a new QR.
3. Stop it with Ctrl+C.
4. Run one send-now test again:

```powershell
npm.cmd run wa:send -- --to <country-code-number> --text "test message"
```

Use only a test number or consenting recipient. Do not paste real phone numbers or message text into chat.

## Chunk 5 Worker Status

Chunk 5 adds a scheduler worker that atomically claims one due pending message, sends it through a `MessageSender` abstraction, and marks it `sent` only after the sender reports success. It does not wire the worker to the real WhatsApp adapter or implement retry/failure policy yet.

## Chunk 6 Retry Status

Chunk 6 adds `next_attempt_at_utc`, retry classification, bounded retry delays of 10s, 30s, 2m, and 5m, and a default max of 4 send attempts. Retryable failures return to `pending` with the next attempt time, terminal failures move to `failed`, and successful sends record the total actual attempt count.
