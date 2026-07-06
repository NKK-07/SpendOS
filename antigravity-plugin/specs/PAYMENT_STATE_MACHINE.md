# PAYMENT_STATE_MACHINE.md

## 1. Core Principles
- Deterministic Forward-Only Transitions.
- Webhook Idempotency.
- Terminal States.

## 2. Payment States
```text
`INITIATED` -> Payment requested. Application creates an internal `Hold/Encumbrance` to lock funds.
`PENDING_UPI` -> Handed off to NPCI/Gateway, waiting for webhook. Funds remain Held.
`PROCESSING` -> Webhook received, validating signature and ledger checks.
`SUCCESS` -> Hold is released. Ledger entries committed to recognize the expense. TERMINAL state for the transaction leg.
`FAILED` -> Hold is released. Ledger entries NOT committed. TERMINAL state.
`REVERSED` -> Post-SUCCESS reversal (e.g., refund). TERMINAL state.
`SETTLED` -> Recon engine verified external bank settlement.
```

## 3. Allowed Transitions (DAG)
- `INITIATED` → `PENDING_UPI`, `FAILED`
- `PENDING_UPI` → `PROCESSING`, `FAILED`
- `PROCESSING` → `SUCCESS`, `FAILED`
- `SUCCESS` → `REVERSED`, `SETTLED`
- `FAILED` → (No transition)
- `REVERSED` → `SETTLED` (Reversal settled)
- `SETTLED` → (No transition)

## 4. Idempotency Flow
Every incoming request (Webhook or API) must include an `Idempotency-Key`.
1. Check `Idempotency Store` (in PostgreSQL).
2. If `EXISTS`, return `response_snapshot`.
3. If `NOT_EXISTS`, acquire lock for processing.
4. Process State Transition.
5. In a single Postgres ACID transaction:
   - Commit JournalGroup and JournalEntries.
   - Commit `outbox_events`.
   - Write `response_snapshot` to `idempotency_keys` table.
6. Release lock.
