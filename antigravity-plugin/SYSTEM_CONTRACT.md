# SpendOS — Global System Contract (v1.1 LOCKED)

## 1. SYSTEM PRINCIPLE
SpendOS is a ledger-first, double-entry financial system.
The ledger is the system of record. Everything else is a projection.
No balance, wallet, report, or dashboard is authoritative.

## 2. CORE ARCHITECTURE CONTRACT
### 2.1 System Layers (in strict dependency order)
- **L0 — Ledger Core (Source of Truth)**: Immutable double-entry ledger. All financial events recorded as journal entries. No updates, only append operations.
- **L1 — Financial Engine**: Idempotency layer, Payment orchestration, State machines, Reconciliation engine.
- **L2 — Domain Services**: Wallet abstraction (projection only), Policy engine, Approval workflows, Fraud detection.
- **L3 — Analytics Layer**: CQRS read models, Aggregations, Dashboards, GST reports.
- **L4 — Presentation Layer**: Web dashboard, Mobile apps, Admin consoles.

### 2.2 Canonical Source of Truth Hierarchy
If two documents disagree, SYSTEM_CONTRACT wins. If implementation disagrees with documentation, Documentation wins. If a transaction disagrees with the ledger, Ledger wins.
`SYSTEM_CONTRACT.md` ↓ `LEDGER_SPEC.md` ↓ `ACCOUNTING_ENGINE.md` ↓ `PAYMENT_STATE_MACHINE.md` ↓ `FUNDS_FLOW_MODEL.md` ↓ `FAILURE_RECOVERY_SPEC.md` ↓ `Implementation`

## 3. FINANCIAL TRUTH MODEL
### 3.1 Source of Truth Rule
Ledger = Truth. Everything else = Derived Projection.
No financial event may mutate state directly. Every financial event must:
1. Create Journal Group
2. Create Journal Entries
3. Store Idempotency Key
4. Create Outbox Event
5. Commit all above in a SINGLE Postgres ACID transaction.
State is derived from the ledger. The ledger is never derived from state.

### 3.2 Balance Definition (STRICT SNAPSHOT ARCHITECTURE)
No mutable `wallet.balance` field is allowed. Balance is read via an immutable `running_balance` snapshot on the journal entry.
`running_balance` is generated synchronously inside the SAME ACID transaction. Reconciliation can always recompute from genesis.

### 3.3 Immutable Ledger Rule
Ledger entries cannot be updated or deleted. Only appended. Corrections are reverse entries.

## 4. DOUBLE-ENTRY LEDGER CONTRACT
### 4.1 Chart of Accounts & Normal Balances
Replace simple debit/credit transfer model with true double-entry accounting.
- **Assets**: Debit = Increase, Credit = Decrease
- **Liabilities**: Credit = Increase, Debit = Decrease
- **Revenue**: Credit = Increase, Debit = Decrease
- **Expense**: Debit = Increase, Credit = Decrease
- **Equity**: Credit = Increase, Debit = Decrease

### 4.2 Journal Entry Structure
Every financial operation must balance. `SUM(debits) == SUM(credits)` strictly enforced at the `journal_group_id` level.

### 4.3 Ledger Entry Schema (Canonical)
```typescript
JournalGroup {
  id: UUID
  transaction_id: UUID
  created_at: timestamp
}

JournalEntry {
  id: UUID
  journal_group_id: UUID
  account_id: UUID
  entry_type: "DEBIT" | "CREDIT"
  amount_paise: bigint
  running_balance: bigint
  currency: "INR"
  created_at: timestamp
}
```

### 4.4 Ledger Invariants (MANDATORY)
- `SUM(debits) == SUM(credits)` within a `journal_group`
- No orphan entries
- No partial postings
- No negative double entry imbalance

## 5. IDENTITY & MULTI-TENANCY CONTRACT
### 5.1 Isolation Rule
Every record MUST contain: `company_id` (required, enforced at DB level)
### 5.2 Row Level Security (RLS)
Mandatory on ALL tables. No cross-tenant query allowed. Enforcement at DB + ORM layer.

## 6. PAYMENT STATE MACHINE CONTRACT
### 6.1 Immutable Payment States
`INITIATED`, `PENDING_UPI`, `PROCESSING`, `SUCCESS`, `FAILED`, `REVERSED`, `SETTLED`
### 6.2 State Transition Rules
Transitions are strictly forward-only. No skipping states. No rollback except `REVERSED`.

## 7. IDEMPOTENCY CONTRACT
### 7.1 Global Requirement
All mutations MUST include: `Idempotency-Key` (required)
### 7.2 Storage Rule
Idempotency must persist in the primary PostgreSQL database within the exact same ACID transaction as the ledger commit: `key → request_hash → response_snapshot`
### 7.3 Guarantee
Same request twice = identical result.

## 8. RECONCILIATION CONTRACT
### 8.1 External System Sync Rule
All external payment rails (UPI/bank) MUST be reconciled.
### 8.2 Reconciliation Source Hierarchy
Bank / UPI rail (external truth) ↓ Ledger (internal truth) ↓ Projections (analytics)
### 8.3 Allowed Adjustments
Only via: reversal entries, correction journal entries. No direct edits allowed.

## 9. WALLET CONTRACT
Wallets are NOT accounts. Wallets are: A computed view over ledger accounts. No stored balance is authoritative.

## 10. SECURITY CONTRACT
### 10.1 Mandatory Controls
- All inputs validated via schema (Zod)
- All money values in paise (INT64 only)
- No raw PII storage (PAN/Aadhaar encrypted/tokenized)
- JWT required for all authenticated endpoints
- HMAC verification for webhooks

## 11. EVENT MODEL CONTRACT
### 11.1 Financial
### 11.2 Event Rule (Mandatory Outbox Pattern)
Events are immutable, append-only, and drive all projections. Direct event publishing from application code is FORBIDDEN. All events must be written to an `outbox_events` table within the Postgres ACID boundary. A background worker will reliably publish them.

## 12. ERROR HANDLING CONTRACT
All APIs MUST return RFC7807 compliant errors.

## 13. CI / ARCHITECTURE VALIDATION GATES
Before any PR merges, the following gates MUST pass, or the merge is BLOCKED:
- **Ledger Gate**: All journal groups balanced (`SUM(debits) == SUM(credits)`).
- **State Machine Gate**: No illegal transition (e.g., `FAILED → SUCCESS` = forbidden).
- **Accounting Gate**: Every business event maps to a journal group.
- **Recovery Gate**: Every external dependency must have a recovery path.

## 14. NON-NEGOTIABLE FINANCIAL RULES
- RULE 1: Money cannot be lost, duplicated, or partially applied.
- RULE 2: Every debit has a matching credit.
- RULE 3: Ledger is never edited.
- RULE 4: External systems are always untrusted.
- RULE 5: Reconciliation is mandatory, not optional.

## 15. FINAL CONTRACT STATEMENT
Any system behavior violating this document is: INVALID SYSTEM STATE and must halt execution. No new financial tables altering accounting semantics may be added without an Architecture Change Request (ACR).
