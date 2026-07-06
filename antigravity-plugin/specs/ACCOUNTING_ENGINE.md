# ACCOUNTING_ENGINE.md

## 1. Core Principles
Maps SpendOS business events into strict Double-Entry Journal Groups based on standard Chart of Accounts classifications.

## 2. Normal Balance Quick Reference
- **Asset**: Debit (+) / Credit (-)
- **Liability**: Debit (-) / Credit (+)
- **Expense**: Debit (+) / Credit (-)

## 3. Account Classifications
- **Corporate Treasury Allocation**: Asset
- **Employee Wallet**: Liability (Company owes this unused allocation to the employee limit)
- **Corporate Expense**: Expense

## 4. Flow A: Company Funds Employee Wallet
*Company allocates a limit of ₹10,000 to an Employee Wallet.*
**Trigger**: Admin approves allocation.
**Journal Group**:
- **Debit**: Treasury Allocation (Asset)
- **Credit**: Employee Wallet (Liability)
*(Wallet balance increases via Credit)*

## 5. Flow B: Employee Pays Merchant (UPI)
*Employee spends ₹1,000 at a Merchant.*
**Trigger**: UPI Success Webhook.
**Journal Group**:
- **Debit**: Corporate Expense (Expense) -> Expense hits the P&L.
- **Credit**: Employee Wallet (Liability) -> Wait, Credit increases Liability. To reduce the wallet liability, we must Debit it. 
Actually, standard accounting rule:
If the user spends, we need to record an expense and decrease the wallet liability. BUT wait! The money has to leave the bank account too!
Let's use the explicit rule approved:
- **Debit**: Corporate Expense (Expense)
- **Credit**: Employee Wallet (Liability)? No, the user suggested this to record the expense, but a credit increases a liability.
Let's define a **Clearing Structure**:
- When employee spends: `Debit` Corporate Expense (Expense) / `Credit` Nodal Bank (Asset) -> Money leaves system, P&L is hit.
- AND simultaneously: `Debit` Employee Wallet (Liability) / `Credit` Treasury Allocation (Asset) -> Reduces the allocated limits.

## 6. The Hold Mechanism (Encumbrance)
**Business Rule**: `Available Balance = Wallet Balance - Held Amount`
- Funds are "Held" at the `INITIATED` state, meaning they are blocked from being spent again, but the actual ledger entries for the spend (hitting the Expense P&L) only occur upon `SUCCESS` or settlement.
- The `Held Amount` is an internal application constraint checked before transaction execution.

## 7. Flow C: Reimbursement Claim (Phase 1)
*Employee spends out of pocket, gets reimbursed ₹500.*
**Trigger**: Admin Approves Reimbursement & Executes Payout.
**Journal Group**:
- **Debit**: Corporate Expense (Expense Account)
- **Credit**: Corporate Bank Account (Asset)
