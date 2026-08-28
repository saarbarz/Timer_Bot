# Bug Log

Track open and resolved bugs by chunk or version.

## Open Bugs

- None currently recorded.

## Known Limitations

- True exactly-once WhatsApp delivery cannot be guaranteed if the provider accepts a message and the process crashes before SQLite records `sent`.
- Chunk 8 stale-processing recovery uses a timeout to recover crash-before-send rows, but it cannot distinguish that case from the known hard case where WhatsApp accepted a message immediately before the crash.
- Chunk 9 web UI is localhost-only and does not replace the foreground scheduler worker process or a future 24/7 deployment setup.

## Resolved Bugs

- Chunk 8: `schedule:list` showed only canonical UTC fields like `scheduledAtUtc`, which looked three hours earlier than the user's Asia/Jerusalem scheduled time. Fixed by adding local display fields such as `scheduledAtLocal`, `sentAtLocal`, and `nextAttemptAtLocal` before the UTC audit fields.
- Chunk 0: PowerShell blocks `npm.ps1`, but `npm.cmd` works. This is documented in `README.md`, `docs/project_state.md`, and `docs/implementation_log.md`.
- Chunk 1: Initial attempt to chain npm install commands with `&&` failed because this PowerShell version rejected it. Re-ran the installs as separate commands.
- Chunk 3: `creds.update` save errors are no longer fire-and-forget. The event handler now reports failures through a sanitized structured `whatsapp.credentials_save_failed` log event.
- Post-Chunk 5 bug hunt: `npm.cmd run dev` and `node dist/src/index.js` exited successfully without printing the startup summary on Windows. Root cause was comparing `import.meta.url` with a manually concatenated `file://${process.argv[1]}` string, which does not normalize Windows paths. Fixed by using `pathToFileURL(process.argv[1]).href` and adding a Windows direct-execution regression test.
- Post-Chunk 5 bug hunt: npm/npx invocations through the `tsx` Windows executable path hung after or during execution in this environment, while `node --import tsx ...` exited cleanly. Updated `dev`, `wa:connect`, and `wa:send` scripts to use `node --import tsx` directly.
- Post-Chunk 5 bug hunt: `wa:send` connected to WhatsApp before request validation, so invalid recipients could still touch transport setup. Root cause was CLI ordering: `adapter.connect()` and `waitForConnected()` ran before `sendTextNow()` performed validation. Fixed by exporting `validateSendTextNowRequest()` and calling it before adapter creation.
- Post-Chunk 5 bug hunt: after early validation was added, invalid `wa:send` input still stayed alive because the CLI statically imported the Baileys adapter before validation. Fixed by lazy-importing `BaileysWhatsAppAdapter` only after validation succeeds.
