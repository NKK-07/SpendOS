# Enterprise Database Schema Expansions

To move from an SME "flattened" model to a true Enterprise ERP architecture, the following tables must be introduced into the Prisma schema.

## 1. Cost Centers
Allows companies to track budgets and expenses across multidimensional business units independently of the financial ledger accounts.

```prisma
model CostCenter {
  id          String   @id @default(uuid()) @db.Uuid
  company_id  String   @db.Uuid
  name        String   @db.VarChar(255)
  code        String   @unique @db.VarChar(50) // e.g., "MKTG-100"
  manager_id  String?  @db.Uuid
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now()) @db.Timestamptz
  updated_at  DateTime @default(now()) @updatedAt @db.Timestamptz

  company     Company  @relation(fields: [company_id], references: [id])
  manager     User?    @relation(fields: [manager_id], references: [id])
  
  allocations ExpenseAllocation[]

  @@index([company_id])
  @@map("cost_centers")
}
```

## 2. Expense Allocations
Allows a single expense to be split across multiple Ledger Accounts and Cost Centers based on fixed amounts or percentages.

```prisma
model ExpenseAllocation {
  id             String      @id @default(uuid()) @db.Uuid
  expense_id     String      @db.Uuid
  account_id     String      @db.Uuid
  cost_center_id String?     @db.Uuid
  amount_paise   BigInt
  percentage     Decimal?    @db.Decimal(5,2) // Optional: e.g., 60.00%
  description    String?     @db.Text

  expense        Expense     @relation(fields: [expense_id], references: [id], onDelete: Cascade)
  account        Account     @relation(fields: [account_id], references: [id])
  cost_center    CostCenter? @relation(fields: [cost_center_id], references: [id])

  @@index([expense_id])
  @@index([cost_center_id])
  @@map("expense_allocations")
}
```

## 3. Approval Workflows
Maintains an immutable chain of custody for multi-level sequential approvals.

```prisma
enum ApprovalAction {
  APPROVED
  REJECTED
  PROOF_REQUESTED
  ESCALATED
}

model ExpenseApproval {
  id            String         @id @default(uuid()) @db.Uuid
  expense_id    String         @db.Uuid
  approver_id   String         @db.Uuid
  action        ApprovalAction
  comment       String?        @db.Text
  level         Int            @default(1) // e.g., Level 1 (Manager), Level 2 (Finance)
  acted_at      DateTime       @default(now()) @db.Timestamptz

  expense       Expense        @relation(fields: [expense_id], references: [id], onDelete: Cascade)
  approver      User           @relation(fields: [approver_id], references: [id])

  @@index([expense_id])
  @@index([approver_id])
  @@map("expense_approvals")
}
```

## 4. Payment Runs
Batches multiple approved expenses into a single payout instruction for the bank/ERP.

```prisma
enum PaymentRunStatus {
  DRAFT
  PENDING_BANK_PROCESSING
  COMPLETED
  FAILED
}

model PaymentRun {
  id           String           @id @default(uuid()) @db.Uuid
  company_id   String           @db.Uuid
  status       PaymentRunStatus @default(DRAFT)
  initiated_by String           @db.Uuid
  total_paise  BigInt           @default(0)
  bank_ref_id  String?          @db.VarChar(255) // Reference from ICICI/HDFC batch file
  created_at   DateTime         @default(now()) @db.Timestamptz
  completed_at DateTime?        @db.Timestamptz

  company      Company          @relation(fields: [company_id], references: [id])
  initiator    User             @relation(fields: [initiated_by], references: [id])
  items        PaymentRunItem[]

  @@index([company_id])
  @@map("payment_runs")
}

model PaymentRunItem {
  id             String     @id @default(uuid()) @db.Uuid
  payment_run_id String     @db.Uuid
  expense_id     String     @db.Uuid
  amount_paise   BigInt
  status         String     @default("PENDING") // e.g., PENDING, SUCCESS, FAILED

  payment_run    PaymentRun @relation(fields: [payment_run_id], references: [id], onDelete: Cascade)
  expense        Expense    @relation(fields: [expense_id], references: [id])

  @@unique([payment_run_id, expense_id])
  @@map("payment_run_items")
}
```
