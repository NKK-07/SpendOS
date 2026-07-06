# Expense State Machine

## Allowed States
1. `DRAFT`: Initial state. The expense is being created by the employee. Receipts can be attached.
2. `SUBMITTED`: The expense is locked for editing by the employee and awaits manager review.
3. `APPROVED`: A manager has reviewed and approved the expense.
4. `REJECTED`: A manager has rejected the expense (terminal state).
5. `REIMBURSED`: Finance has processed the payment, and the ledger has been updated (terminal state).

## Transition Rules

| Current State | Next State | Trigger Action | Required Role | Ledger Impact |
|---|---|---|---|---|
| `(None)` | `DRAFT` | `createExpense` | Employee | None |
| `DRAFT` | `SUBMITTED` | `submitExpense` | Employee (Owner) | None |
| `SUBMITTED` | `APPROVED` | `approveExpense` | Manager | None |
| `SUBMITTED` | `REJECTED` | `rejectExpense` | Manager | None |
| `APPROVED` | `REIMBURSED` | `reimburseExpense`| Finance / Admin | **YES** |

## Invariants & Forbidden Transitions
* **No Skipping States**: An expense cannot go from `DRAFT` directly to `APPROVED` or `REIMBURSED`.
* **Immutability of Receipts**: Once an expense enters `SUBMITTED` state, receipts can no longer be added or removed.
* **Terminal States**: `REJECTED` and `REIMBURSED` are final. An expense cannot transition out of these states.
* **Ownership Constraint**: Only the employee who created the `DRAFT` can transition it to `SUBMITTED`.
* **Manager Constraint**: Only a user with the Manager role within the same company can transition from `SUBMITTED` to `APPROVED`/`REJECTED`.
* **Finance Constraint**: Only a user with Finance/Admin role can transition from `APPROVED` to `REIMBURSED`.
