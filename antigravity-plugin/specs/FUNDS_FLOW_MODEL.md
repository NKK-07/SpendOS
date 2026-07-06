# FUNDS_FLOW_MODEL.md

## 1. Core Principles
Every rupee must have a legally and technically defined lifecycle. 

## 2. Phase 1: Reimbursement Flow (No Wallets)
**Flow**: Employee pays personally → Receipt uploaded → Expense approved → Reimbursement generated → Bank transfer executed → Ledger settled.

**State Transitions & Journal Entries**:
1. **Approval**:
   - `Debit`: Corporate Expense (Expense)
   - `Credit`: Accounts Payable - Employees (Liability)
2. **Payout Initiated**:
   - Payout State: `INITIATED` -> `PROCESSING`
3. **Payout Success (Webhook)**:
   - `Debit`: Accounts Payable - Employees (Liability)
   - `Credit`: Corporate Bank Account (Asset)
   - Payout State: `SUCCESS`
4. **Payout Failure (Webhook)**:
   - Payout State: `FAILED`
   - Recovery: Manual review or automatic retry via a new payout intent.

## 3. Phase 2: UPI Wallet Flow
**Flow**: Company Treasury → Department Wallet → Employee Wallet → Merchant → Settlement → GST Capture → ERP Export.

**State Transitions & Journal Entries**:
1. **Treasury Load (Company deposits money into Nodal Account)**:
   - `Debit`: Nodal Account (Asset)
   - `Credit`: Unallocated Company Funds (Liability)
2. **Wallet Allocation (Admin grants employee ₹10,000)**:
   - `Debit`: Unallocated Company Funds (Liability)
   - `Credit`: Employee Wallet (Liability)
3. **UPI Payment to Merchant (Employee spends ₹1,000)**:
   - State: `INITIATED` -> `PENDING_UPI`
   - **Internal Application Action**: ₹1,000 is marked as `Held` against the wallet. `Available Balance` is decremented. No ledger entries are written yet.
4. **UPI Success Webhook**:
   - `Debit`: Corporate Expense (Expense)
   - `Credit`: Nodal Account (Asset) -> Money leaves system to Merchant Bank.
   - `Debit`: Employee Wallet (Liability) -> Reduces limit.
   - `Credit`: Treasury Allocation (Asset) -> Reduces allocated funds.
   - State: `SUCCESS`
   - **Internal Application Action**: Hold is released.
5. **Reconciliation (T+1)**:
   - Validate `SUCCESS` state matches Nodal Bank Statement.
   - State: `SETTLED`

## 4. Reversal Logic (Refunds)
**Trigger**: Merchant issues a refund 3 days later.
**Journal Group**:
- `Debit`: Nodal Account (Asset)
- `Credit`: Employee Wallet (Liability)
- State: `REVERSED` -> `SETTLED`
