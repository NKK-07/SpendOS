# FAILURE_RECOVERY_SPEC.md

## 1. Core Principles
Define failure classes and recovery rules for distributed system anomalies to prevent ghost balances and mismatched ledger states.

## 2. Failure Classes
- `USER_FAILURE`: Invalid input, insufficient balance.
- `NETWORK_FAILURE`: API timeout, DNS issue.
- `BANK_FAILURE`: Core banking system down.
- `NPCI_FAILURE`: UPI network timeout.
- `WEBHOOK_FAILURE`: Webhook delayed, duplicated, or dropped.
- `DATABASE_FAILURE`: Transaction lock timeout, commit failure.
- `THIRD_PARTY_FAILURE`: Razorpay/Cashfree API 5xx errors.

## 3. Recovery Rules

### Scenario 1: UPI Provider Timeout + Delayed Webhook
**Situation**: Wallet debited (State: `PENDING_UPI`), gateway times out. Webhook arrives 17 minutes later.
**Rule**: Webhook is the ultimate async truth for external state.
- **Action**: Accept webhook idempotently. Transition `PENDING_UPI` -> `SUCCESS` (or `FAILED`). If `FAILED`, issue compensating transaction (Reversal Journal Entry) to credit the wallet back.

### Scenario 2: Request Retried + Duplicate Webhook
**Situation**: User clicks Pay, API times out, request retried. Webhook arrives twice.
**Rule**: Idempotency layer intercepts the second webhook.
- **Action**: The `Idempotency-Key` or `Provider-Txn-ID` lock is checked. First webhook processes. Second webhook returns the cached `response_snapshot` and is discarded.

### Scenario 3: Database Commit Succeeds + Webhook Publish Fails
**Situation**: The ledger is successfully updated, but the `Domain Event` (e.g., to notify the Analytics or Notification service) fails to publish to BullMQ/Kafka.
**Rule**: Transactional Outbox Pattern.
- **Action**: `Domain Events` must be written to an `Outbox` table in the same ACID transaction as the `Journal Group`. A separate relay worker publishes from the Outbox. No event is ever lost if the DB commits.

### Scenario 4: Late Refund
**Situation**: Transaction succeeds (`SUCCESS` / `SETTLED`). Merchant refunds 3 days later.
**Rule**: Append-only reversals.
- **Action**: Do not mutate the original transaction. Create a new `Refund Transaction` linked to the original. Apply Reversal Journal Entries (Debit Nodal, Credit Wallet).
