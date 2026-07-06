# Reimbursement Accounting

## Core Principle
Expense creation and approval are purely business events. The ledger is ONLY impacted when money actually moves—which is at the point of reimbursement.

## Event Impact Matrix

| Event | Ledger Impact | Rationale |
|---|---|---|
| **Expense Created** | None | An employee submitted a draft or pending expense. No financial liability is formally recognized yet. |
| **Expense Approved** | None | The manager has authorized the expense, but the company has not yet dispersed funds. |
| **Expense Reimbursed** | **YES** | Finance has released the funds to the employee, representing an outflow of corporate cash and the realization of a corporate expense. |
| **Expense Rejected** | None | The expense was denied. No financial activity occurred. |

## Journal Entry Structure (Expense Reimbursed)

When an expense is marked as `REIMBURSED`, the system creates a `JournalGroup` with `TransactionType = EXPENSE_REIMBURSEMENT`.

**Ledger Postings:**
1. **Debit**: Corporate Expense Account (Asset/Expense)
2. **Credit**: Corporate Bank/Treasury Account (Asset)

*Note: Because wallets are currently dormant in this slice, we bypass the employee wallet and settle directly to their external bank account (represented by a credit out of Corporate Treasury).*

### Example (₹1,000 Reimbursement)
```text
Debit: Employee Travel Expense        ₹1,000
Credit: Corporate Treasury Account    ₹1,000
```
