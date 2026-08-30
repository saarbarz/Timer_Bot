# Bug Log

Track open and resolved bugs by chunk or version.

## Open Bugs

- None currently recorded.

## Known Limitations

- True exactly-once WhatsApp delivery cannot be guaranteed if the provider accepts a message and the process crashes before SQLite records `sent`.
- Chunk 8 stale-processing recovery uses a timeout to recover crash-before-send rows, but it cannot distinguish that case from the known hard case where WhatsApp accepted a message immediately before the crash.
- `npm.cmd run web` and `npm.cmd run schedule:worker` remain separate legacy commands. Running both WhatsApp connection paths at once can produce `needs_relink` / `not_connected`; prefer `npm.cmd run service` for long-running single-user use.
- Docker image build smoke requires Docker Desktop/Linux engine to be running. On 2026-08-30 the Docker CLI existed, but the engine pipe was unavailable.
- Database backups intentionally exclude WhatsApp auth/session state. If auth state is ever backed up manually, it must be protected separately as account-session credential material.
- Non-local UI/API exposure requires `UI_AUTH_PASSWORD`; this is still single-user Basic auth, not multi-user access control.
- Public or multi-user deployment is not approved on the current architecture. Before public hosting, redesign around a local sender agent that holds WhatsApp auth/session state locally and a cloud scheduler/control plane that does not centralize WhatsApp session keys.
- Chunk 13 automated tests prove local isolation logic with fake adapters. User reported the basic manual test worked on 2026-08-30, but optional unlink/relink isolation remains unconfirmed.

## Resolved Bugs

- Post-Chunk 11: scheduled messages created through the browser did not send after attempting to run `npm.cmd run service` because an older `npm.cmd run web` process was still bound to `127.0.0.1:3000`. Root cause was that service startup hit `EADDRINUSE`, while the browser kept talking to the old web-only process, which has no scheduler worker. Fixed by making service startup reject cleanly on listen errors, close the opened DB, and print an actionable occupied-port message.
- Post-Chunk 13: the phone-number/recent-recipient field could jump while the UI refreshed. Root cause was periodic connection refresh rebuilding the recipient datalist while the input was focused. Fixed by skipping datalist rewrites while focused, avoiding unchanged rewrites, and stabilizing form/hint layout.
- Chunk 8: `schedule:list` showed only canonical UTC fields like `scheduledAtUtc`, which looked three hours earlier than the user's Asia/Jerusalem scheduled time. Fixed by adding local display fields such as `scheduledAtLocal`, `sentAtLocal`, and `nextAttemptAtLocal` before the UTC audit fields.
- Chunk 0: PowerShell blocks `npm.ps1`, but `npm.cmd` works. This is documented in `README.md`, `docs/project_state.md`, and `docs/implementation_log.md`.
- Chunk 1: Initial attempt to chain npm install commands with `&&` failed because this PowerShell version rejected it. Re-ran the installs as separate commands.
- Chunk 3: `creds.update` save errors are no longer fire-and-forget. The event handler now reports failures through a sanitized structured `whatsapp.credentials_save_failed` log event.
- Post-Chunk 5 bug hunt: `npm.cmd run dev` and `node dist/src/index.js` exited successfully without printing the startup summary on Windows. Root cause was comparing `import.meta.url` with a manually concatenated `file://${process.argv[1]}` string, which does not normalize Windows paths. Fixed by using `pathToFileURL(process.argv[1]).href` and adding a Windows direct-execution regression test.
- Post-Chunk 5 bug hunt: npm/npx invocations through the `tsx` Windows executable path hung after or during execution in this environment, while `node --import tsx ...` exited cleanly. Updated `dev`, `wa:connect`, and `wa:send` scripts to use `node --import tsx` directly.
- Post-Chunk 5 bug hunt: `wa:send` connected to WhatsApp before request validation, so invalid recipients could still touch transport setup. Root cause was CLI ordering: `adapter.connect()` and `waitForConnected()` ran before `sendTextNow()` performed validation. Fixed by exporting `validateSendTextNowRequest()` and calling it before adapter creation.
- Post-Chunk 5 bug hunt: after early validation was added, invalid `wa:send` input still stayed alive because the CLI statically imported the Baileys adapter before validation. Fixed by lazy-importing `BaileysWhatsAppAdapter` only after validation succeeds.
