# Future Architecture Plan - Public Use Safety Gate

## Current Recommendation

Finish the current local single-user PoC chunks first. Do not convert this project into a public, multi-user, or cloud-hosted service by only adding stronger web auth around the current design.

Before any public-use work starts, pause implementation and redesign around a safer split:

- Cloud scheduler/control plane: stores user accounts, schedules, delivery status, and job metadata.
- Local sender agent: runs on the user's own machine or device, holds the WhatsApp linked-device auth/session state locally, connects outbound to the cloud, receives due-send jobs, sends through the existing `WhatsAppAdapter` boundary, and reports status back.

## Why This Gate Exists

The current app can send WhatsApp messages because it controls a linked-device WhatsApp session. That session is effectively account-level credential material. In a public SaaS design, storing many users' WhatsApp session state on one server would create a high-impact security target.

The safer direction is to avoid central custody of WhatsApp session keys. The server should coordinate scheduling; the user's local agent should hold and use the WhatsApp session.

## Proposed Future Design

1. User creates an account in the cloud scheduler.
2. User installs or runs a local sender agent.
3. User pairs the local agent with their cloud account using a short-lived pairing code or device token.
4. User links WhatsApp only on the local agent.
5. The cloud scheduler stores schedules and queues due jobs.
6. The local agent maintains an outbound authenticated connection to the cloud.
7. When a job is due, the agent receives it, sends the message locally through `WhatsAppAdapter`, and reports success/failure.

## Security Requirements Before Public Deployment

- Real user authentication and session management.
- Tenant isolation between users.
- Per-device pairing, revocation, and token rotation.
- HTTPS everywhere.
- CSRF protection for browser flows.
- Rate limits and abuse controls.
- Sanitized audit logs.
- Encrypted storage for schedule data.
- Prefer end-to-end encryption of message text so only the local agent can decrypt it.
- Clear backup policy that does not centralize WhatsApp auth/session state.
- Operational monitoring without logging phone numbers, JIDs, message text, QR payloads, session keys, or secrets.

## Tradeoff

This design reduces central security risk, but scheduled sends only work while the user's local sender agent is online and connected. If the agent is offline at the due time, the cloud scheduler can mark the job delayed and send it when the agent reconnects, depending on the product rules chosen later.

## Implementation Gate

If Chunk 13 or any later work changes scope toward public hosting, multi-user accounts, cloud sync, or remote scheduling, stop before coding and create a dedicated architecture chunk for the local sender agent / cloud scheduler split.
