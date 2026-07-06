# Exhaustive Security & Database Constraints Reference

This document exposes the raw database-level security layer and exact cryptographic mechanisms used to defend SpendOS.

## 1. Raw PostgreSQL Constraints (PL/pgSQL Triggers)
File: `packages/database/prisma/enterprise_constraints.sql`

To achieve enterprise-grade security, SpendOS does not trust the Node.js application layer exclusively. Instead, strict financial logic is enforced directly via database triggers. If an attacker bypasses the API routing or an engineer deploys a bug, the database throws a hard `RAISE EXCEPTION`.

### 1.1 `enforce_sod_submitter_approver`
- **Target**: `expense_approvals` table (`BEFORE INSERT OR UPDATE`)
- **Logic**: Queries the `expenses` table for the target `expense_id`. Fetches the `submitted_by` UUID. If the `approver_id` matches the `submitted_by` UUID, the transaction is violently rejected.
- **SQL Snippet**:
  ```sql
  IF (SELECT submitted_by FROM expenses WHERE id = NEW.expense_id) = NEW.approver_id THEN
      RAISE EXCEPTION 'SoD Violation: Submitter cannot approve their own expense.';
  END IF;
  ```

### 1.2 `enforce_payment_run_state_machine`
- **Target**: `payment_runs` table (`BEFORE UPDATE`)
- **Logic**: Strict conditional matching for the `status` Enum.
- **Rules Enforced**:
  - `DRAFT` can only become `SUBMITTED`.
  - `SUBMITTED` can only become `APPROVED` or `DRAFT`.
  - `APPROVED` can only become `PENDING_BANK_PROCESSING` or `DRAFT`.
  - Any illegal jump (e.g., `DRAFT` directly to `EXECUTED`) throws `RAISE EXCEPTION 'Invalid State Transition'`.

### 1.3 `enforce_four_eyes_payment`
- **Target**: `payment_runs` table (`BEFORE UPDATE`)
- **Logic**: Triggers when `NEW.status = 'APPROVED'`. Evaluates `NEW.initiated_by = NEW.approved_by`. If true, raises a violation. A single user can never originate and authorize a mass payout.

## 2. Cryptographic Replay Protection (Idempotency)
File: `apps/api/src/controllers/payment.controller.ts`

- **The Attack Vector**: An attacker intercepts a legitimate `execute_payment` payload. Even if TLS is used, the client might accidentally click submit twice, or an attacker with the token might replay the exact request to double-charge.
- **The Defense**:
  - The client generates a unique `X-Nonce` and an `X-Idempotency-Key` for the transaction.
  - The server hashes the entire `req.body` using `crypto.createHash('sha256')`.
  - The server attempts an `INSERT` into the `idempotency_keys` table with `{ key, nonce, request_hash }`.
  - Because `nonce` and `key` have a `UNIQUE` constraint in Postgres, the second attempt will instantly fail at the Prisma ORM layer with a `P2002` error. The API handles this and returns a `409 Conflict`, effectively neutralizing the replay.

## 3. Webhook Zero-Trust Architecture
File: `apps/api/src/controllers/webhook.controller.ts`

- **The Attack Vector**: SpendOS uses an asynchronous, out-of-band malware scanning pipeline via AWS EventBridge. If the webhook endpoint (`/webhooks/s3-malware-scan`) is unauthenticated, anyone could POST a request marking an infected file as `CLEAN`.
- **The Defense**:
  1. **HMAC-SHA256 Signature**: The request requires `X-Signature`. SpendOS calculates `crypto.createHmac('sha256', HMAC_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')`. If it doesn't match `X-Signature`, it drops.
  2. **Timestamp Expiration**: Using `X-Timestamp`, SpendOS drops any payload older than 5 minutes. This prevents an attacker from intercepting a legitimate webhook request and replaying it months later to overwrite a future file's status.
  3. **Event Deduplication**: The EventBridge `event_id` is written to the `IdempotencyKey` table. Even if the signature and timestamp are perfectly valid, if that specific `event_id` has already been processed, the database ignores it.
