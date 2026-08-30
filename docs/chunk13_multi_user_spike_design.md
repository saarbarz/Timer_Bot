# Chunk 13 Design Spike - Two Isolated Local Sessions

## Status

Design started. Runtime implementation is not started yet.

## Scope Decision

The original Chunk 13 plan asks for a multi-user spike with exactly two isolated WhatsApp sessions. Because the project now has a public-use safety gate, Chunk 13 must begin with architecture/design before code changes.

This spike remains local-only. It does not add signup, billing, cloud hosting, production auth, SaaS infrastructure, or public deployment.

## Goal

Prove whether the current single-user architecture can safely support exactly two isolated local test identities without state mixing:

- separate WhatsApp auth/session paths
- scheduled rows associated with an internal `userId`
- worker sends through the matching session only
- independent unlink/relink behavior
- basic resource measurements for two active sessions

## Non-goals

- No public SaaS.
- No cloud scheduler.
- No local sender agent protocol yet.
- No user registration flow.
- No password/account database.
- No groups.
- No arbitrary JID sending.
- No production multi-tenant authorization model.
- No claim that the design is safe for public users.

## Proposed Local Spike Architecture

### User Identity

Use two fixed internal test user ids:

- `test-user-a`
- `test-user-b`

These ids are local internal labels only. They must not contain phone numbers or account identifiers.

### Auth State Isolation

Move from one global auth path to per-user auth roots for the spike:

```text
auth/users/test-user-a/
auth/users/test-user-b/
```

The existing `auth/` directory remains ignored and sensitive. No auth subdirectory should be logged, committed, backed up by `backup:db`, or served through HTTP.

### Session Management

Add a `SessionManager` keyed by internal `userId`.

Responsibilities:

- create or return a managed WhatsApp adapter for a known user id
- keep connection lifecycle isolated per user
- expose sanitized status per user
- close one user session without closing the other
- prevent unknown user ids from creating arbitrary auth paths

The `WhatsAppAdapter` boundary remains the only transport boundary used by scheduler code.

### Database Ownership

Add `user_id` to scheduled messages through a numbered migration.

Expected database behavior:

- every new scheduled message has a `user_id`
- due-message claiming filters by `user_id` when a worker is processing a specific session
- list/update/cancel operations are scoped by `user_id`
- existing single-user rows need an explicit migration/default-owner decision before code implementation

Open design choice before implementation:

- Option A: migrate existing rows to `local-user`.
- Option B: require a new clean DB for the Chunk 13 spike.

Option A is more practical because it preserves local data and keeps tests closer to real upgrade behavior.

### Worker Model

For the local spike, run one scheduler worker per test user, each using that user's adapter:

```text
worker(test-user-a) -> SessionManager(test-user-a) -> adapter A
worker(test-user-b) -> SessionManager(test-user-b) -> adapter B
```

Each worker must claim only rows for its own `userId`.

### Web/API Shape

Keep this minimal for the spike:

- expose user-specific connection status by internal user id
- allow selecting one of the two fixed test users in the local UI
- schedule/list/edit/cancel only within the selected user
- never show phone numbers, message text, QR payloads, auth paths, JIDs, or session details in logs

The API should reject unknown user ids.

## Acceptance Criteria Mapping

Original Chunk 13 requirement | Design interpretation
--- | ---
User A and B connected simultaneously | Two managed adapters can be active at once under different auth paths.
A schedules to A recipient; B schedules to B recipient; no cross-session send | Scheduled rows include `user_id`; workers claim/send only their own rows.
Restart restores two sessions if credentials are valid | Service startup recreates managed sessions for configured test users and uses their auth paths.
Revocation of A leaves B connected | Closing/relink-required state for A updates only A's session state.
Basic memory/reconnect metrics recorded | Add sanitized per-process resource snapshot and per-user reconnect counters.

## Metrics to Record

Minimum local metrics for the spike:

- process RSS memory
- process heap used
- CPU usage delta over an interval
- active session count
- per-user reconnect count
- per-user collapsed connection state

Metrics must not include phone numbers, JIDs, QR payloads, auth paths, message text, or credential data.

## Implementation Risks

- Running multiple Baileys sockets in one process may be unstable or resource-heavy.
- A global singleton or shared auth path bug could mix sessions.
- Existing DB rows need careful migration to avoid orphaned or cross-user scheduling behavior.
- UI mistakes could schedule under the wrong internal user id.
- Real acceptance requires two separate WhatsApp test accounts; automated tests can prove isolation logic but cannot prove live Baileys stability.

## Recommended Implementation Order

1. Add `user_id` domain/repository/API tests with fake adapters.
2. Add migration for `scheduled_messages.user_id`.
3. Add `SessionManager` with fixed allowed test users and per-user auth path derivation.
4. Add per-user worker wiring in service using fake adapter integration tests first.
5. Add minimal UI user selector.
6. Add sanitized metrics endpoint or health extension.
7. Run typecheck/tests/build.
8. Only then perform manual two-account WhatsApp verification if the user provides two test accounts.

## Stop Conditions

Stop and ask before implementation if:

- the spike is expected to support real public users
- arbitrary user ids are required
- cloud scheduling is required
- preserving existing production-like data conflicts with the `user_id` migration
- two WhatsApp test accounts are not available for manual acceptance
