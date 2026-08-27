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

## Current Scope

The project has completed Chunk 4: Scheduling domain + SQLite. It can reuse the saved WhatsApp linked-device session, send one explicit text message, and create/list/update/cancel scheduled messages in SQLite without wiring the scheduler to WhatsApp yet. The next allowed chunk is Chunk 5: Worker + atomic claim + idempotency.

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

## Chunk 4 Scheduling Status

Chunk 4 adds SQLite persistence and scheduling CRUD through `ScheduleService`. It does not start a worker or send scheduled messages yet.
