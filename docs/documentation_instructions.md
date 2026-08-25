# Documentation Instructions

Future Codex sessions should read this file first, then read the rest of `docs/` before making changes.

## Required Documentation Updates

After every implementation chunk, update `docs/implementation_log.md` with:

- chunk name and status
- files changed
- commands executed
- exact verification results
- manual test result, if any
- known limitations
- any user action required before continuing

Keep `docs/project_state.md` current with:

- current chunk
- last completed chunk
- next allowed chunk
- important architectural decisions
- environment notes
- resume instructions

Keep `docs/file_guide.md` current when files are added, removed, or their responsibilities change.

Keep `docs/bug_log.md` current with open and resolved bugs by version or chunk.

## Hard Rules

- Do not continue to the next chunk until the current chunk passes its acceptance criteria.
- Do not claim manual WhatsApp QR, connection, or delivery success unless the user confirms it.
- Do not log or commit real QR payloads, auth state, session keys, phone numbers, message text, or secrets.
- Keep all WhatsApp transport code behind a `WhatsAppAdapter` interface once WhatsApp code is introduced.
- Do not add out-of-scope features from later chunks.
- Do not make commits unless the user explicitly asks.
