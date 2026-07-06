# Mock vs. Prod: The SpendOS Technical Debt Ledger

This document serves as the official ledger of every shortcut, workaround, mock, and temporary hack taken while architecting and building SpendOS. Before transitioning to a full production release (especially one undergoing SOC 2 or enterprise security audits), every item on this list must be addressed.

## 1. Authentication & Identity
- **Hardcoded MFA Verification**: In `mfa.service.ts`, TOTP validation is mocked (`const isValid = otpCode === '123456';`). 
  - *Prod Fix*: Integrate `otplib` and cryptographically verify the token against the user's encrypted `mfa_secret`.
- **Assumed Fastify Context**: Controllers (e.g., `payment.controller.ts`) assume `req.user` and `req.session` are magically populated by upstream middleware.
  - *Prod Fix*: Build the actual JWT validation and session hydration middleware.
- **Missing Session Revocation**: While session invalidation was discussed as a capability, there is no active Redis blacklist for revoked JWTs.

## 2. Cryptographic Audit Logging
- **Concurrency Race Conditions**: The `AuditService` fetches the `previous_hash` via a database read right before inserting the new log. Under high concurrency, this will result in race conditions and branched hash chains.
  - *Prod Fix*: Route audit writes through an asynchronous queue (SQS/Kafka) or use a serialized database lock (e.g., PostgreSQL advisory locks) to guarantee strict chain ordering.
- **No External Root Anchoring Implementation**: The logic to calculate the `chain_root` exists, but there is no scheduled job that actually runs it.
  - *Prod Fix*: Create an AWS EventBridge Cron job that invokes a Lambda function to sign the daily Merkle root and publish it to an immutable S3 Object Lock vault or public transparency log.

## 3. Infrastructure & Integrations
- **S3 Malware Scanning Stubbed**: The `WebhookController` expects an EventBridge payload indicating if a file is `CLEAN` or `INFECTED`, but the action taken is just a `console.log`.
  - *Prod Fix*: Implement `@aws-sdk/client-s3` to physically move the file from the Quarantine Bucket to the Production Bucket via `S3.CopyObject`, and delete the quarantined original.
- **Rate Limiting Configuration Only**: Fastify `@fastify/rate-limit` configuration blocks were added to routes, but the plugin isn't registered globally with a Redis backing store.
  - *Prod Fix*: Setup Redis cluster, register the plugin in `server.ts`, and bind the rate limits to IP or User ID.

## 4. Policy & Segregation of Duties
- **ABAC Implementation is Shallow**: The `assertSoD` method in the Policy Engine evaluates the JSON `approval_scope` against an expense's allocations, but it assumes the `expense` object passed to it already contains the full nested `allocations` array.
  - *Prod Fix*: Ensure the database queries fetching expenses for approval use Prisma's `include` deeply enough to fetch all related allocations and cost center codes.
- **Event-Sourced Policy Snapshots Mocked**: The Prisma schema includes a `PolicySnapshot` table to track policy versions, but `PolicyEngine` currently doesn't query it or enforce version-in-time logic.

## 5. Database & Migrations
- **Raw SQL Constraints Applied Manually**: The strict PostgreSQL triggers (State Machine, Four-Eyes, SoD) were applied via `prisma db execute` directly to the shadow/dev database.
  - *Prod Fix*: Embed `enterprise_constraints.sql` directly into a committed Prisma migration file so that it executes automatically on fresh DB deployments.
- **Missing Outbox Worker**: The `OutboxEvent` table exists for reliable, distributed event publishing, but there is no polling worker or CDC (Change Data Capture) mechanism reading from it.
  - *Prod Fix*: Implement Debezium for CDC or write a Node.js polling worker to process and publish outbox messages to SNS/EventBridge.

## 6. Frontend / UI Layer (If Applicable)
- **Hardcoded State**: If the UI is built out, it currently relies on mocked data objects rather than fetching dynamically from the `/expenses` or `/payment-runs` endpoints.
- **Form Validations**: Client-side form validations are basic and may not perfectly mirror the strict Zod schemas enforced by the Fastify backend.
