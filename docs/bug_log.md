# Bug Log

Track open and resolved bugs by chunk or version.

## Open Bugs

- None currently recorded.

## Resolved Bugs

- Chunk 0: PowerShell blocks `npm.ps1`, but `npm.cmd` works. This is documented in `README.md`, `docs/project_state.md`, and `docs/implementation_log.md`.
- Chunk 1: Initial attempt to chain npm install commands with `&&` failed because this PowerShell version rejected it. Re-ran the installs as separate commands.
- Chunk 3: `creds.update` save errors are no longer fire-and-forget. The event handler now reports failures through a sanitized structured `whatsapp.credentials_save_failed` log event.
