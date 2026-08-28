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
npm.cmd run schedule -- --to <country-code-number> --text "message" --at <YYYY-MM-DDTHH:mm[:ss]> --timezone <IANA timezone>
npm.cmd run schedule -- --to <country-code-number> --text "message" --in 90s --timezone <IANA timezone>
npm.cmd run schedule:list
npm.cmd run schedule:cancel -- <id>
npm.cmd run schedule:update-time -- <id> --in 90s --timezone <IANA timezone>
npm.cmd run schedule:worker
```

The npm scripts invoke TypeScript through `node --import tsx` for reliable process exit behavior on this Windows setup.

## Current Scope

The project has completed Chunk 8: Restart / overdue / cancel edge cases. It can reuse the saved WhatsApp linked-device session, send one explicit text message, create/list/cancel/reschedule messages in SQLite, run a deterministic scheduler worker against a fakeable sender, apply bounded retry/terminal failure handling, run a process-mode scheduler worker wired to the real Baileys adapter, send overdue pending messages once after restart, skip cancelled messages, honor updated scheduled times, and recover stale `processing` rows after a configurable timeout. The user confirmed the manual restart and cancel tests worked on 2026-08-28. The next allowed chunk is Chunk 9.

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

## Chunk 7 Manual Scheduled Send Test

Completed on 2026-08-27. The user confirmed one real scheduled WhatsApp message was delivered successfully. To repeat the test, use a test number or consenting recipient only:

```powershell
npm.cmd run wa:connect
npm.cmd run schedule -- --to <country-code-number> --text "scheduled test message" --in 90s --timezone Asia/Jerusalem
npm.cmd run schedule:list
npm.cmd run schedule:worker -- --poll-ms 1000
```

After the due time passes and the worker logs a sent result, stop it with Ctrl+C and run:

```powershell
npm.cmd run schedule:list
```

Confirm the row is `status=sent` with `sentAtUtc`. Do not paste real phone numbers, message text, QR payloads, or auth/session files into chat.

## Chunk 8 Manual Restart / Cancel Tests

Use only a test number or consenting recipient.

Restart test:

Completed on 2026-08-28. The user confirmed the flow worked after starting the worker, stopping it after about 30 seconds with Ctrl+C, restarting the worker, and observing the scheduled send succeed. The user did not run `schedule:list` during the first worker run because the foreground worker was still running.

```powershell
npm.cmd run schedule -- --to <country-code-number> --text "restart test message" --in 120s --timezone Asia/Jerusalem
npm.cmd run schedule:worker -- --poll-ms 1000
```

Stop the worker after about 30 seconds with Ctrl+C, then start it again before the scheduled time:

```powershell
npm.cmd run schedule:worker -- --poll-ms 1000
```

Expected: the message is delivered once and `npm.cmd run schedule:list` shows `status=sent`.

Cancel test:

Completed on 2026-08-28. The user confirmed the message was not sent and `schedule:list` showed the row as cancelled.

```powershell
npm.cmd run schedule -- --to <country-code-number> --text "cancel test message" --in 120s --timezone Asia/Jerusalem
npm.cmd run schedule:list
npm.cmd run schedule:cancel -- <id>
npm.cmd run schedule:worker -- --poll-ms 1000
```

Expected: the cancelled row remains `status=cancelled` and no message is delivered.

`schedule:list` shows local display fields such as `scheduledAtLocal` and `sentAtLocal` first, then the canonical UTC fields used by SQLite.
