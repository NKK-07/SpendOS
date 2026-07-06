# SpendOS Backend & API Architecture v2

## System Layout & File Locations
The SpendOS backend is built on **Node.js + Fastify** using **TypeScript** in a turborepo monorepo.
- **API Application**: `e:\SpendOS\spendos-monorepo\apps\api\src`
- **Database & ORM**: `e:\SpendOS\spendos-monorepo\packages\database`
- **Shared Types (Zod)**: `e:\SpendOS\spendos-monorepo\packages\shared-types`

## Code Implementation Mapping

### 1. The Controller Layer
Controllers handle HTTP requests, validate Fastify Context, and enforce API-level security.
- **`expenses.controller.ts`**: Handles REST actions for standard expense claims (`POST /expenses`, `GET /expenses/:id`).
- **`payment.controller.ts` (v2)**: Manages Enterprise Payment Runs. 
  - *Implementation Details*: Validates the `x-elevation-token` via the `MFAService`, binds the client-provided `nonce` to the payload's `request_hash`, and attempts to update the `PaymentRun` status inside a Prisma transaction. If a raw SQL constraint fails (e.g. Four-Eyes violation), the transaction catches the PostgreSQL error and translates it to an HTTP 403.
- **`webhook.controller.ts` (v2)**: Receives out-of-band events (like AWS EventBridge malware scans).
  - *Implementation Details*: Uses `crypto.createHmac` to validate `x-signature` and `x-timestamp`. Inserts the webhook's `event_id` into the `IdempotencyKey` table to silently drop duplicate/replay attacks.

### 2. The Service Layer
Services encapsulate complex business logic and cryptography.
- **`audit.ts` (AuditService)**: 
  - *Implementation Details*: Uses `crypto.createHash('sha256')` to build a blockchain-like ledger. It reads the previous record's hash and mixes it with the new payload. Exposes a `verifyChainIntegrity` method that recalculates the ledger from scratch to detect unauthorized DBA tampering.
- **`mfa.service.ts` (MFAService)**:
  - *Implementation Details*: Upgrades standard TOTP. When verified, it issues a 5-minute Fastify JWT (`jsonwebtoken`) that embeds the user's `session_id`, `scope`, and a `risk_context_hash` (derived from `device_id` and `ip_subnet`). If the token is intercepted and used from a different IP, the hash mismatch immediately invalidates the request.
- **`policy.engine.ts` (PolicyEngine)**:
  - *Implementation Details*: The `assertSoD` method parses the `User.approval_scope` JSON object (ABAC). Instead of hardcoded boolean checks, it validates if the approver is explicitly assigned to the `cost_center.code` attached to the expense allocations.

### 3. API Security & Routing
- **`routes/expenses.routes.ts`**: Defines standard Fastify routes. In v2, routes use `@fastify/rate-limit` configuration objects (`max: 5, timeWindow: '1 minute'`) to prevent brute force and denial of wallet attacks.
- **Zod Validation**: Input payloads are strongly typed using Zod and parsed by `fastify-type-provider-zod` before reaching controllers.
