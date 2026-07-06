# Exhaustive Database Schema & Structural Integrity

SpendOS relies on a highly normalized PostgreSQL database managed by Prisma ORM, strictly enforcing multi-tenancy via Row-Level Security (RLS) and financial constraints via native PL/pgSQL triggers.

## 1. Identity, Access & Multi-Tenancy

### 1.1 `companies` (Tenant Boundary)
Every piece of data strictly cascades from or links to a `company_id`.
- **Columns**: `id` (UUID, PK), `name` (VarChar), `email_domain` (VarChar, Unique), `gstin` (VarChar), `sla_days` (Int), `session_timeout_minutes` (Int), `is_active` (Boolean).
- **Constraints**: RLS policy ensures `current_setting('app.current_company_id')` matches `company_id`.

### 1.2 `users` (Actor Entity)
Represents a human interacting with the system.
- **Columns**: 
  - `id` (UUID, PK), `company_id` (UUID, FK -> companies)
  - `role` (Enum: PRINCIPAL, ADMIN, VIP, MANAGER, EMPLOYEE)
  - `approval_scope` (JSON): The Attribute-Based Access Control (ABAC) definition (e.g., `{ "cost_centers": ["ENG"], "max_approval_limit": 500000 }`). Replaces rigid hierarchy mapping.
  - `mfa_enabled` (Boolean), `mfa_secret` (VarChar)
  - `is_frozen` (Boolean), `frozen_reason` (Text), `frozen_by` (UUID, FK -> users)
- **Indices**: Compound index on `[company_id, role, is_active, is_frozen]` for rapid RBAC lookups.

### 1.3 `invite_tokens` (Onboarding)
- **Columns**: `token_hash` (VarChar, Unique), `expires_at` (Timestamptz), `role` (UserRole). Links explicitly to the `inviter_id`.

## 2. Core Expense Lifecycle

### 2.1 `expenses` (The Claim Aggregate)
The root object of a user's reimbursement claim.
- **Columns**:
  - `id` (UUID, PK), `company_id` (UUID, FK), `submitted_by` (UUID, FK -> users)
  - `amount_paise` (BigInt), `expense_date` (Date)
  - `category` (Enum), `merchant_name` (Text), `gstin` (Text), `invoice_number` (Text), `tax_amount_paise` (BigInt)
  - `status` (Enum: submitted, approved, rejected, paid, disputed, etc.)
  - `workflow_state` (Enum), `financial_state` (Enum), `dispute_state` (Enum)
  - `review_locked_by` (UUID), `review_locked_at` (Timestamptz) - Implements optimistic UI locking to prevent duplicate review efforts.

### 2.2 `expense_documents` (Receipts & Proof)
- **Columns**: `s3_key` (VarChar), `file_name` (VarChar), `file_size_bytes` (Int), `document_type` (Enum: original, proof).
- **Security**: Uploaded directly to a quarantine bucket, waiting for AWS EventBridge webhooks to update internal status before enabling signed URL downloads.

### 2.3 `expense_allocations` (Enterprise Accounting)
Distributes a single expense across multiple internal cost centers.
- **Columns**: `expense_id` (UUID, FK -> expenses), `account_id` (UUID, FK -> accounts), `cost_center_id` (UUID, FK -> cost_centers), `amount_paise` (BigInt), `percentage` (Decimal).
- **Behavior**: A ₹1,000 expense can be allocated 60% to ENG (`amount: 60000`) and 40% to SALES (`amount: 40000`).

### 2.4 `expense_approvals` (Audit Trail of Authorization)
Tracks multi-level managerial and finance approvals.
- **Columns**: `expense_id` (UUID), `approver_id` (UUID), `action` (Enum: APPROVED, REJECTED, PROOF_REQUESTED), `level` (Int), `comment` (Text).
- **DB-Level Constraint**:
  - `trg_enforce_sod`: A raw PL/pgSQL trigger intercepts `INSERT`/`UPDATE`. It queries the parent `expense` to verify that `approver_id != submitted_by`. If violated, it throws a strict PostgreSQL exception, halting the transaction.

## 3. Settlement & Treasury

### 3.1 `payment_runs` (Batch Payouts)
Groups approved expenses for mass bank transfers.
- **Columns**: 
  - `id` (UUID, PK), `status` (Enum: DRAFT, SUBMITTED, APPROVED, EXECUTED, SETTLED, FAILED).
  - `initiated_by` (UUID, FK), `approved_by` (UUID, FK).
  - `total_paise` (BigInt), `bank_ref_id` (VarChar).
- **DB-Level Constraints**:
  - `trg_payment_run_state_machine`: Enforces strict directional transitions. `DRAFT -> EXECUTED` throws an exception. `SUBMITTED -> APPROVED` is permitted.
  - `trg_payment_run_four_eyes`: Triggers on `UPDATE`. If transitioning to `APPROVED`, verifies that `approved_by != initiated_by`.

### 3.2 `payment_run_items`
- **Columns**: `payment_run_id` (UUID, FK), `expense_id` (UUID, FK, Unique), `amount_paise` (BigInt).
- **Integrity**: `expense_id` is unique, preventing the same expense from being attached to multiple payment runs concurrently.

## 4. Ledger & Double-Entry Accounting

### 4.1 `accounts` & `wallets`
- **Accounts**: Chart of Accounts (`ASSET`, `LIABILITY`, `EQUITY`, `EXPENSE`, `REVENUE`) with `normal_balance` (`DEBIT`/`CREDIT`).
- **Wallets**: User-specific balances mapped to specific accounts (e.g., "Employee Advance Wallet" mapped to an ASSET account).

### 4.2 `journal_groups` & `journal_entries`
- **Journal Group**: The transaction envelope.
- **Journal Entry**: Individual debit/credit lines.
- **DB-Level Constraint**: `trg_verify_journal_group_balance` is a deferred trigger that executes immediately before transaction commit. It sums all `DEBIT` entries against all `CREDIT` entries for the group. If they do not perfectly equal 0, the entire database transaction is rolled back.

## 5. Security & Idempotency Storage

### 5.1 `audit_log` (Tamper-Evident Chain)
- **Columns**: `id`, `event_id`, `company_id`, `actor_id`, `action`, `target_id`, `target_type`, `metadata` (JSON).
- **Cryptographic Columns**:
  - `chain_sequence` (BigInt, Auto-Increment)
  - `previous_hash` (VarChar 64)
  - `record_hash` (VarChar 64)
- **Behavior**: Every new record hashes its own JSON payload concatenated with the `previous_hash`, weaving an unbreakable cryptographic chain that detects missing or altered rows.

### 5.2 `idempotency_keys`
- **Columns**: `key` (PK), `request_hash` (String), `nonce` (String, Unique), `response_snapshot` (JSON).
- **Behavior**: Tracks requests via a client-provided idempotency key. The unique `nonce` prevents replay attacks, and the `request_hash` prevents an attacker from re-using a valid key/nonce with a modified payload.
