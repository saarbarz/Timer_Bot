# File Guide

## Root Files

- `package.json`: npm scripts, project metadata, runtime dependencies, and development dependencies.
- `tsconfig.json`: strict TypeScript compiler configuration.
- `.gitignore`: excludes dependencies, build output, local environment files, WhatsApp auth/session state including `auth_old/`, local data, logs, and IDE metadata.
- `README.md`: setup and command reference.

## Source

- `src/index.ts`: minimal application entry point and smoke-testable startup summary.
- `src/config/AppConfig.ts`: local configuration for default timezone and generated local paths. It contains no credentials.
- `src/cli/waConnect.ts`: manual CLI for opening a Baileys WhatsApp connection and showing the linked-device QR.
- `src/cli/waSend.ts`: manual one-shot CLI for connecting to WhatsApp and sending one text message to an explicit phone-number recipient.
- `src/whatsapp/WhatsAppAdapter.ts`: transport interface and internal send result types that future scheduler code must depend on instead of Baileys directly.
- `src/whatsapp/BaileysConnectionState.ts`: pure mapping from Baileys connection updates to internal connection statuses.
- `src/whatsapp/BaileysWhatsAppAdapter.ts`: Baileys-backed adapter that registers connection and credential events, persists auth under `auth/`, renders QR codes, and sends individual text messages.
- `src/whatsapp/RecipientNormalizer.ts`: pure recipient normalization and validation for phone-number based individual WhatsApp recipients.
- `src/whatsapp/SendTextNow.ts`: validation-first send-now service that converts validation and transport failures into `SendResult`.

## Tests

- `test/unit/config.test.ts`: Chunk 0 smoke tests for config and startup wiring.
- `test/unit/BaileysConnectionState.test.ts`: Chunk 1 connection status transition tests.
- `test/unit/BaileysReconnect.test.ts`: Chunk 1 reconnect decision tests.
- `test/unit/BaileysEventHandlers.test.ts`: Chunk 1 tests for event handler registration, credential save callback wiring, and QR forwarding.
- `test/unit/RecipientNormalizer.test.ts`: Chunk 2 tests for phone-number normalization and group rejection.
- `test/unit/SendTextNow.test.ts`: Chunk 2 tests for empty text rejection, exactly-one adapter call on success, and transport exception mapping.

## Documentation

- `docs/implementation_log.md`: chunk-by-chunk implementation and verification log.
- `docs/documentation_instructions.md`: rules for maintaining documentation in future sessions.
- `docs/project_state.md`: current status and resume information.
- `docs/file_guide.md`: explanation of important project files.
- `docs/bug_log.md`: open and resolved bugs by chunk/version.
- `docs/WhatsApp_Send_Later_Codex_Implementation_Plan_HE.docx`: source implementation plan copied from the user-provided document.
