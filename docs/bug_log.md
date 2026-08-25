# Bug Log

Track open and resolved bugs by chunk or version.

## Open Bugs

- Chunk 1: `creds.update` save errors are currently fire-and-forget and not reported through structured logging. This is acceptable for the QR PoC but should be handled when logging/error policy is introduced.

## Resolved Bugs

- Chunk 0: PowerShell blocks `npm.ps1`, but `npm.cmd` works. This is documented in `README.md`, `docs/project_state.md`, and `docs/implementation_log.md`.
- Chunk 1: Initial attempt to chain npm install commands with `&&` failed because this PowerShell version rejected it. Re-ran the installs as separate commands.
