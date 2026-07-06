# JOURNAL_INVARIANTS.md

## 1. Core Principles
The SQL and Application-level invariants that MUST trigger a `ROLLBACK` if violated.

## 2. Balancing Invariant
For any `journal_group_id`:
```sql
SELECT SUM(amount_paise) FROM JournalEntry WHERE journal_group_id = ? AND entry_type = 'DEBIT'
==
SELECT SUM(amount_paise) FROM JournalEntry WHERE journal_group_id = ? AND entry_type = 'CREDIT'
```
*Failure Action*: `ROLLBACK TRANSACTION`

## 3. Immutability Invariant
```sql
CREATE TRIGGER prevent_journal_update
BEFORE UPDATE OR DELETE ON JournalEntry
FOR EACH ROW EXECUTE PROCEDURE raise_exception('Ledger Immutability Violation');
```
*Failure Action*: SQL Exception / Rollback.

## 4. Running Balance Sequencing Invariant
When inserting a new `JournalEntry`, the `running_balance` MUST equal:
`Previous_Running_Balance +/- amount_paise`
(Logic depends on `account_type` and `normal_balance`).
**Concurrency Rule**: To guarantee sequential integrity, a pessimistic lock (`SELECT ... FOR UPDATE`) MUST be acquired on the `Account` prior to reading the previous balance and inserting the new entry.
*Failure Action*: Lock timeout -> `ROLLBACK`, Retry.

## 5. Amount Invariant
`amount_paise > 0`
Negative amounts are strictly forbidden. Use Reversal entries (swapping debits and credits) instead.
*Failure Action*: `CHECK (amount_paise > 0)` DB constraint violation -> `ROLLBACK`.
