# Chunk 14 - Secure 24/7 MVP Work Plan

Status: draft for user review.

Last updated: 2026-09-14.

## Goal

Move the current local WhatsApp send-later prototype toward a secure, always-available MVP while storing the least data possible at every moment.

The current prototype proves local scheduling, local WhatsApp linking, real scheduled delivery, reconnect handling, a local web UI, and a limited two-user local spike. Chunk 14 should decide the production path before more code is written.

## Non-Negotiable Architecture Decision

Do not host many users' WhatsApp linked-device auth/session state in one central cloud service.

The MVP should use this split:

- Cloud control plane: accounts, device pairing, encrypted schedules, job state, billing, monitoring, and abuse controls.
- Local sender agent: runs under the user's control, stores WhatsApp linked-device auth/session state locally, keeps an outbound authenticated connection to the cloud, receives due jobs, decrypts message content locally, sends through `WhatsAppAdapter`, and reports sanitized delivery state.

This gives the product a real 24/7 control plane without turning the cloud into a vault full of WhatsApp account sessions. The tradeoff is honest: a scheduled send can execute only when that user's local sender agent is online and healthy, unless the product later supports an official provider API.

## Data-Minimization Rules

Store only what the system needs to make the next decision.

- Cloud must not store WhatsApp auth/session files, QR payloads, raw contact books, chat history, or message text in plaintext.
- Cloud should store user id, device id, schedule id, due timestamp, timezone, status, retry metadata, and encrypted recipient/message payload.
- Cloud should store only a keyed hash or encrypted form of recipient identifiers for search, dedupe, abuse limits, and support diagnostics.
- Local agent should store WhatsApp auth/session state, local device key material, a small outbound queue, and transient decrypted jobs.
- Decrypted recipient/message content should exist only in agent memory while preparing/sending a due job.
- Audit logs should use schedule ids, device ids, status codes, coarse error classes, and timestamps. They must not include phone numbers, JIDs, message text, QR payloads, auth state, session keys, or decrypted payloads.
- Retention should be short by default: sent/cancelled message payloads deleted immediately or within 24 hours, operational status retained 30 days, security audit retained 90 days, user-delete purge completed within a defined window.
- Backups should exclude WhatsApp auth/session state. Cloud backups may include encrypted schedule payloads only while those payloads are still within retention.

## Recommended MVP Stack

These are not final vendor commitments; they are the cheapest credible paths to compare in implementation spikes.

| Area | Start Cheap | Scale Path | Why It Fits |
| --- | --- | --- | --- |
| Edge/API/front door | Cloudflare Workers free tier, then Workers Paid | Workers Paid plus Durable Objects, Queues, WAF, Access | Workers has a free tier around 100k requests/day and paid starts around $5/month. It is a good fit for a small control plane and WebSocket-facing agent coordination. Source: https://www.cloudflare.com/developer-platform/products/workers/ |
| Admin/internal access | Cloudflare Zero Trust free plan | Pay-as-you-go per active user | Good for protecting internal admin tools, staging, metrics, and support consoles early. Free covers small teams; pay-as-you-go is listed at about $7/user/month. Source: https://www.cloudflare.com/plans/zero-trust-services/ |
| Database | Turso or Supabase/Neon free tier | Turso Developer, Supabase Pro, Neon usage-based paid plans | Turso keeps the current SQLite mental model and advertises a free tier with 100 databases and 5 GB storage; a per-user database option can reduce blast radius. Supabase/Neon are better if we need Postgres features, RLS, and analytics later. Sources: https://turso.tech/pricing, https://supabase.com/pricing, https://neon.com/pricing |
| App hosting alternative | Railway trial/free credit or Render Starter | Railway/Render paid services | Easier Node hosting if Workers/Durable Objects are too constraining. Railway's docs describe a 30-day/$5 trial and then $1/month free credit; Render-style always-on small services are often around the low-dollar monthly range. Sources: https://docs.railway.com/reference/pricing/plans, https://render.com/pricing |
| Auth | Clerk free tier or Supabase Auth | Clerk Pro or Supabase Pro | Fast path to real user auth, session handling, email verification, OAuth, and MFA options without building auth ourselves. Clerk advertises a free tier up to 50k monthly retained users and Pro from about $20/month. Source: https://clerk.com/pricing |
| Secrets | Platform secrets plus Doppler free tier | Doppler paid team plan or cloud KMS | Start with platform secret storage. Add Doppler once more than one environment or collaborator needs managed secrets. Doppler lists a free tier for 3 users and paid seats after that. Source: https://www.doppler.com/pricing |
| Error monitoring | Sentry Developer | Sentry Team/Business | Start with free error tracking, then pay when more users, alert routing, or retention are needed. Sentry docs list a free Developer plan and paid Team/Business plans. Source: https://docs.sentry.io/pricing/ |
| Uptime monitoring | UptimeRobot free | UptimeRobot Solo/Team or Better Stack | Start with external checks on `/health`, agent-heartbeat endpoints, and public API. UptimeRobot advertises 50 free monitors. Source: https://uptimerobot.com/ |
| Secret scanning | GitHub secret scanning/push protection plus local scans | GitHub Secret Protection for private org repos, Snyk/GitGuardian if needed | Secret scanning and push protection should be mandatory before any cloud deploy. GitHub documents push protection as blocking supported secrets before they are pushed; public repos get free secret scanning. Sources: https://docs.github.com/en/code-security/concepts/secret-security/push-protection, https://docs.github.com/code-security/secret-scanning/about-secret-scanning |
| Official WhatsApp alternative | Keep Baileys local-agent route for prototype MVP only | Evaluate WhatsApp Business Platform or a BSP for compliant business use | If the product becomes business/customer messaging, evaluate Meta's official platform. Meta's pricing page says charges are per delivered message. Source: https://business.whatsapp.com/products/business-platform/pricing |

## Proposed Architecture

```text
Browser UI
  -> Cloud control plane over HTTPS
      -> Auth provider
      -> Encrypted schedule store
      -> Due-job queue
      -> Agent heartbeat/session registry
      -> Sanitized audit and metrics
  <- Local sender agent over outbound TLS/WebSocket
      -> Local encrypted device store
      -> WhatsAppAdapter/Baileys
      -> Local-only WhatsApp auth/session state
```

The browser creates and edits schedules in the cloud. Message content and recipient data are encrypted before storage. The local sender agent owns the decryption key or receives it through a pairing flow that the cloud cannot use to decrypt stored payloads. When a schedule is due, the cloud releases the encrypted job to the paired agent. The agent decrypts locally, sends locally, then reports a minimal result.

## Work Plan

### 14.1 Product Gate

Define the MVP promise in one sentence and make the hard tradeoffs explicit.

Deliverables:

- Decide whether MVP is for personal reminders, solo professionals, small teams, or businesses.
- Decide whether "24/7" means "cloud is always up and sends when the user's local agent is online" or "messages must send even if the user's machine is off."
- Decide whether the Baileys/local-agent approach is acceptable for MVP risk, or whether official WhatsApp Business Platform must be evaluated before launch.
- Define supported schedule types for MVP: one-time only, recurring later, or both.
- Define support policy for offline agents: mark delayed, send on reconnect, expire after grace period, or notify user.

Exit criteria:

- One approved MVP scope.
- One approved availability promise.
- One approved WhatsApp delivery strategy.

### 14.2 Threat Model and Data Inventory

Create a written threat model before building public infrastructure.

Deliverables:

- Data inventory by location: browser, cloud DB, cloud logs, queue, local agent disk, local agent memory, backups.
- Trust boundaries and attack paths: stolen cloud DB, stolen local machine, malicious user, support access, leaked logs, compromised deploy token, replayed agent token.
- Minimum data table for each feature.
- Retention table for every data type.
- Decision record for message encryption and key ownership.

Exit criteria:

- Cloud plaintext message storage is explicitly rejected or consciously approved with a reason.
- WhatsApp session centralization remains rejected.
- Logging redaction rules are testable.

### 14.3 Cloud Control Plane Spike

Build a tiny cloud service that has no WhatsApp dependency.

Deliverables:

- Authenticated account creation/login.
- Device registration and revocation.
- Schedule CRUD with encrypted payload fields.
- Due-job claim API scoped to one paired device.
- Agent heartbeat endpoint.
- Sanitized `/health` and `/ready`.
- Tenant isolation tests.

Recommended first stack:

- Cloudflare Workers + Durable Objects for agent connection/session coordination.
- Turso, Supabase, or Neon for schedule metadata.
- Clerk or Supabase Auth for authentication.

Fallback stack if Workers becomes awkward:

- Railway or Render Node service.
- Managed Postgres.
- Same auth/security model.

Exit criteria:

- A user can create an encrypted schedule in the cloud.
- No cloud code can send WhatsApp messages.
- A device can claim only its own user's due jobs.

### 14.4 Local Sender Agent MVP

Extract the current combined local service into an installable local sender agent.

Deliverables:

- Agent config and pairing flow.
- Local encrypted storage for WhatsApp auth/session and agent device token.
- Outbound-only connection to the cloud.
- Due-job receive/decrypt/send/report loop.
- Offline queue and reconnect behavior.
- Local health page or tray/CLI status.
- Auto-start instructions for Windows first, then macOS/Linux.

Exit criteria:

- Agent can be killed/restarted without losing WhatsApp session.
- Agent never accepts inbound internet traffic.
- Agent sends only jobs scoped to its paired device.
- Agent logs do not contain recipients, message text, QR payloads, or session data.

### 14.5 End-to-End Encryption Design

Design message encryption so the cloud stores as little readable content as possible.

Recommended MVP design:

- Generate a device encryption key pair during local-agent setup.
- Store the public key in the cloud device record.
- Encrypt recipient/message payloads client-side or server-side to the device public key.
- Keep the private key only on the local agent.
- Rotate device keys on re-pair.
- Delete encrypted payload after terminal state when product rules allow it.

Open design question:

- If schedules are created from a browser while the agent is offline, decide whether browser-side encryption is required or whether the cloud may briefly see plaintext during schedule creation before encrypting it. The safer default is browser-side encryption.

Exit criteria:

- Cloud database compromise does not reveal plaintext message text or recipients.
- Cloud support/admin tooling cannot decrypt customer schedules.
- Recovery story is defined if the user loses the local agent key.

### 14.6 Reliability and 24/7 Operations

Make the cloud always available and make local-agent availability visible.

Deliverables:

- Cloud deployment with staging and production.
- External uptime checks.
- Agent heartbeat and "last seen" display.
- Delayed-send policy when agent is offline.
- Idempotent job handoff with lease/ack/final status.
- Backoff and retry policy for cloud-agent delivery.
- Database backups and restore drill.
- Runbook for: cloud down, DB down, agent offline, WhatsApp relink required, queue backlog, failed sends.

Exit criteria:

- Cloud `/health` is monitored externally.
- Agent offline state is visible within one heartbeat interval.
- A due job cannot be claimed by the wrong device.
- Restarting cloud services does not duplicate already-finalized jobs.

### 14.7 Security Hardening

Add controls before any public beta.

Deliverables:

- Real auth with email verification and MFA option.
- CSRF protection for browser session flows if cookie auth is used.
- Strict CORS and security headers.
- Rate limits for login, pairing, schedule creation, API reads, and agent claims.
- Pairing codes that are short-lived, one-time-use, and scoped.
- Device token rotation and revocation.
- GitHub push protection or equivalent secret scanning.
- Dependency audit and update policy.
- SAST/secret scan in CI.
- Minimal production access: least-privilege deploy tokens, separate staging/prod secrets.
- Sanitized structured logs and audit trails.

Exit criteria:

- Security tests cover tenant isolation, auth bypass attempts, pairing replay, revoked device access, and log redaction.
- Production secrets are not in `.env` files committed to repo or pasted into chats/docs.
- Public routes have explicit auth/rate-limit decisions.

### 14.8 Privacy, Legal, and Abuse Controls

Prepare for real users before inviting them.

Deliverables:

- Privacy policy describing exactly what is stored, where, why, and for how long.
- Terms of use covering user responsibility for WhatsApp usage and recipient consent.
- Data deletion/export flow.
- Abuse limits: sends per minute/day, account creation throttles, blocked destinations if needed.
- Support diagnostics that do not expose message text or full recipients by default.
- Manual abuse review workflow using hashed identifiers and event ids.

Exit criteria:

- User can delete account and trigger data purge.
- Support can debug delivery status without reading message content.
- Abuse controls are active before public signup.

### 14.9 MVP Launch Checklist

Launch only after these are true:

- Cloud control plane has production deploy, HTTPS, auth, rate limits, monitoring, and backups.
- Local agent has signed/reproducible release artifacts or clear install scripts.
- WhatsApp auth/session state never leaves the local agent.
- Message payloads are encrypted at rest in the cloud.
- Logs and analytics are scrubbed.
- External uptime monitor and error tracking are active.
- Restore drill completed.
- Device revoke/re-pair tested.
- Agent offline/reconnect tested.
- Privacy policy and terms are published.
- Beta user limit and support channel are defined.

## Suggested First Implementation Order After This Plan Is Approved

1. Write the threat model and data inventory.
2. Decide the MVP user segment and 24/7 promise.
3. Build a no-WhatsApp cloud control-plane spike.
4. Extract local sender agent from current service.
5. Add pairing, device tokens, and cloud-agent job handoff.
6. Add payload encryption and retention deletion.
7. Add monitoring, backups, and runbooks.
8. Run a closed beta with a hard user cap.

## Open Questions for User Review

1. Who is the first MVP user: only you, a few trusted testers, solo professionals, small businesses, or broader public users?
2. Does "24/7" mean the cloud should always accept schedules and send when the user's local agent is online, or must messages send even when the user's own device/computer is off?
3. Are you comfortable launching an MVP on the local-agent/Baileys linked-device approach, or should Chunk 14 include a formal WhatsApp Business Platform comparison before any beta?
4. Should the first MVP support only one-time scheduled messages, or should recurring messages be part of the first paid product?
5. What is the first monthly budget target for infrastructure: $0-10, $10-25, $25-50, or higher if it reduces engineering time?
6. Which geography matters first for hosting and privacy expectations: Israel, EU, US, or global?
7. Should users be able to schedule from the browser while their local sender agent is offline?
8. How much delivery history should users see after a message is sent: status only, redacted recipient plus status, or message preview for a short retention period?
