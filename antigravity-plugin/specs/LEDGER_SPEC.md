# LEDGER_SPEC.md

## 1. Core Principles
- True double-entry bookkeeping model.
- Chart of Accounts defines normal balances.
- Immutable journal groups and journal entries.
- Running balance computed synchronously.

## 2. Chart of Accounts Schema
```typescript
model Account {
  id              UUID     @id @default(uuid())
  company_id      UUID
  name            String   // e.g., "Main Treasury", "Employee XYZ Wallet"
  account_type    Enum     // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  normal_balance  Enum     // DEBIT, CREDIT
  created_at      DateTime @default(now())
}
```

## 3. Journal Group Schema
Groups journal entries to ensure balancing `SUM(debits) == SUM(credits)`.
```typescript
model JournalGroup {
  id              UUID     @id @default(uuid())
  company_id      UUID
  transaction_id  UUID     // Maps to Payment Orchestration transaction
  description     String   // e.g., "Wallet Funding", "Merchant Payment"
  created_at      DateTime @default(now())
  
  entries         JournalEntry[]
}
```

## 4. Journal Entry Schema
Immutable ledger entry with a synchronous snapshot balance.
```typescript
model JournalEntry {
  id                UUID     @id @default(uuid())
  journal_group_id  UUID
  account_id        UUID
  entry_type        Enum     // DEBIT, CREDIT
  amount_paise      BigInt   // Must be > 0
  running_balance   BigInt   // Synchronously updated snapshot
  currency          String   @default("INR")
  created_at        DateTime @default(now())
}
```

## 5. Outbox Event Schema
Ensures reliable publishing of domain events within the ACID transaction.
```typescript
model OutboxEvent {
  id              UUID     @id @default(uuid())
  aggregate_type  String
  aggregate_id    String
  event_type      String
  payload         Json
  published       Boolean  @default(false)
  created_at      DateTime @default(now())
}
```

## 6. Ledger Integrity Constraints (DB Level)
- `amount_paise` > 0
- Foreign Keys: `account_id` -> `Account`, `journal_group_id` -> `JournalGroup`
- `running_balance` calculation MUST be executed inside the same transaction as the `JournalGroup`.
- **Pessimistic Locking**: **FOR UPDATE** locks must be used on the `Account` during insertion to prevent race conditions on the `running_balance`.
- **Deterministic Lock Ordering**: To prevent database deadlocks, multiple accounts involved in a transaction MUST be locked in ascending UUID order.
