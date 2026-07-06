# SpendOS Database Schema v2 (Enterprise)

The SpendOS database uses PostgreSQL and Prisma ORM. Below is the updated textual layout reflecting the Enterprise Security Architecture v2.

## 1. Identity & Access Control

### `companies`
Core tenant table isolating all records.
- `id` (UUID), `name`, `email_domain`
- **Tenant Policies**: RLS (Row Level Security) binds all downstream records to this ID.

### `users`
Represents an employee, manager, finance personnel, or admin.
- `id` (UUID), `company_id`
- `role` (Enum): PRINCIPAL, ADMIN, VIP, MANAGER, EMPLOYEE
- **[v2]** `approval_scope` (JSON): ABAC definition explicitly granting access to specific `cost_centers` or `legal_entities`, plus `max_approval_limit`.
- `mfa_enabled` (Boolean), `mfa_secret` (String)

## 2. Core Financial Operations

### `expenses`
The primary aggregate for an employee claim.
- `id` (UUID), `submitted_by`
- `amount_paise` (BigInt), `merchant_name`, `gstin`, `invoice_number`, `tax_amount_paise`
- `status` (Enum), `workflow_state` (Enum), `financial_state` (Enum)

### `expense_documents`
Digital receipts stored in S3.
- `id` (UUID), `s3_key`, `file_name`
- **[v2 Flow]**: Uploaded to quarantine bucket first. Webhook updates state upon EventBridge malware scan completion.

### `expense_allocations` (New in v2)
Breaks down a single expense across multiple departments.
- `id` (UUID), `expense_id`, `account_id`, `cost_center_id`
- `amount_paise`, `percentage`

### `expense_approvals` (New in v2)
Multi-level approval tracking, moved out of the `expenses` table.
- `id`, `expense_id`, `approver_id`, `action` (APPROVED/REJECTED), `level`
- **[v2 Constraint]**: Backstopped by PostgreSQL raw trigger `enforce_sod_submitter_approver` (Submitter cannot be approver).

## 3. Treasury & Settlement

### `cost_centers` (New in v2)
- `id`, `company_id`, `name`, `code`, `manager_id`

### `payment_runs` & `payment_run_items` (New in v2)
Batches approved expenses for bank payouts.
- `status` (Enum): DRAFT, SUBMITTED, APPROVED, PENDING_BANK_PROCESSING, EXECUTED, SETTLED.
- **[v2 Constraint]**: PostgreSQL trigger `enforce_payment_run_state_machine` strictly prevents skipping states (e.g. DRAFT to EXECUTED).
- **[v2 Constraint]**: PostgreSQL trigger `enforce_four_eyes_payment` strictly prevents `initiated_by` from being the `approved_by` user.

## 4. Security & Idempotency

### `audit_log` (Upgraded in v2)
Cryptographically verifiable, tamper-evident ledger.
- `id`, `actor_id`, `action`, `target_id`, `metadata`
- **[v2 Additions]**: `chain_sequence` (BigInt), `previous_hash` (SHA-256), `record_hash` (SHA-256), `correlation_id`.

### `idempotency_keys` (Upgraded in v2)
Prevents double-charging or webhook replay attacks.
- `key` (String, PK)
- `request_hash` (String)
- **[v2 Addition]**: `nonce` (Unique String) - explicitly coupled with the request to defeat altered-payload replay attacks.
