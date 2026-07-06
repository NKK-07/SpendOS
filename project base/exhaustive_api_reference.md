# Exhaustive API & Controller Reference

This document exhaustively details the Fastify routing layer, endpoint structure, security middleware, and controller logic for SpendOS.

## 1. Global Fastify Configuration

### 1.1 Server & Plugins (`apps/api/src/server.ts`)
The API uses Fastify configured with Zod for strict type checking.
- **`fastify-type-provider-zod`**: Intercepts all incoming requests. If a request body, querystring, or parameter fails the Zod schema definition, Fastify rejects it instantly with a `400 Bad Request` before it ever reaches controller logic.
- **`@fastify/rate-limit`**: Mounted on critical endpoints to thwart brute-force and scraping.

### 1.2 Authentication Middleware (`middlewares/auth.ts`)
Every protected route passes through a JWT validator that populates the `req.user` context.
- **Context Injection**: `req.user` contains `id`, `company_id`, `role`, and `session_id`.
- **RBAC Checks (`rbac.ts`)**: Secondary middlewares like `requireReviewer` or `requireSettingsAccess` enforce that `req.user.role` matches the minimum required permission tier before executing the controller.

## 2. API Controllers & Routes

### 2.1 `ExpensesController` (`apps/api/src/controllers/expenses.controller.ts`)
Manages the CRUD and workflow transitions for single expense claims.
- **`POST /expenses`**:
  - *Rate Limit*: 5 requests per minute.
  - *Logic*: Parses `CreateExpenseSchema`. Automatically sets `status = submitted` and `submitted_by = req.user.id`. Creates initial `Expense` record.
- **`GET /expenses`**:
  - *Logic*: Implements pagination and filtering. Automatically applies `company_id = req.user.company_id` to prevent cross-tenant leakage.
- **`POST /expenses/:id/approve`**:
  - *Middleware*: `requireReviewer`.
  - *Logic*: Invokes `PolicyEngine.assertTransition()`. Checks RBAC, checks if the expense is locked (`review_locked_by`), and inserts an `ExpenseApproval` record. Triggers double-entry ledger update if fully approved.

### 2.2 `PaymentController` (`apps/api/src/controllers/payment.controller.ts`)
Executes high-value batch payout workflows. Features intense security coupling.
- **`POST /payment-runs/:id/execute`**:
  - *Headers Expected*: `X-Elevation-Token` (MFA), `X-Idempotency-Key`, `X-Nonce`.
  - *Step 1: MFA Validation*: Calls `MFAService.validateElevationToken()`. It hashes the incoming `X-Device-Id` and `req.ip` and compares it to the `risk_context_hash` inside the JWT payload.
  - *Step 2: Idempotency & Replay*: Hashes the JSON request body via `crypto.createHash('sha256')`. Attempts a Prisma `create` on the `IdempotencyKey` table using the nonce and request hash. A Prisma `P2002` error (Unique Constraint Violation) instantly rejects the request as a replay.
  - *Step 3: State & Four-Eyes Validation*: Fetches the `PaymentRun`. If `initiated_by === req.user.id`, it throws a 403.
  - *Step 4: Transactional Execution*: Wraps the update (`status = PENDING_BANK_PROCESSING`, `approved_by = req.user.id`) inside a `$transaction`. Any Postgres PL/pgSQL constraint violations trigger a rollback.

### 2.3 `WebhookController` (`apps/api/src/controllers/webhook.controller.ts`)
Publicly exposed endpoints built exclusively for machine-to-machine (M2M) communication.
- **`POST /webhooks/s3-malware-scan`**:
  - *Headers Expected*: `X-Signature` (HMAC), `X-Timestamp`.
  - *Step 1: Timestamp TTL*: Parses `X-Timestamp`. If it is older than 5 minutes (`Date.now() - timestamp > 5*60*1000`), the request drops (prevents stealing old webhooks).
  - *Step 2: HMAC Validation*: Hashes the timestamp concatenated with the raw stringified body using `crypto.createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET)`. Compares it to `X-Signature`.
  - *Step 3: Deduplication*: The payload contains an `event_id`. This is inserted as a `nonce` into the `IdempotencyKey` table. If the event was already processed, it silently returns `200 OK` (idempotent success) but takes no action.
  - *Step 4: Routing*: Parses the `CLEAN` or `INFECTED` status and modifies the `ExpenseDocument` object.

## 3. Data Transfer Objects (Zod Schemas)
- `CreateExpenseSchema`: Enforces required fields (`amount_paise`, `category`, `expense_date`). Coerces amounts to strictly positive BigInts to prevent negative-value hacking attempts.
- `RejectExpenseSchema`: Requires a `rejection_reason` string (min 5 characters).
