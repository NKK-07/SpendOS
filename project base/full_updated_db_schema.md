# Full Updated Database Schema (Enterprise Ready)

This document shows the complete, merged Prisma schema containing both the original SpendOS tables and the newly integrated Enterprise modules (Cost Centers, Allocations, Approval Histories, and Payment Runs).

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ------------------------------------------------------
// IDENTITY & MULTI-TENANCY
// ------------------------------------------------------
model Company {
  id                      String   @id @default(uuid()) @db.Uuid
  name                    String   @db.VarChar(255)
  email_domain            String   @unique @db.VarChar(255)
  gstin                   String?  @db.VarChar(15)
  sla_days                Int      @default(14)
  session_timeout_minutes Int      @default(30)
  is_active               Boolean  @default(true)
  created_at              DateTime @default(now()) @db.Timestamptz
  updated_at              DateTime @default(now()) @updatedAt @db.Timestamptz

  users             User[]
  accounts          Account[]
  cost_centers      CostCenter[]
  payment_runs      PaymentRun[]
  // ... other relations (expenses, documents, etc.)

  @@map("companies")
}

enum UserRole {
  PRINCIPAL
  ADMIN
  VIP
  MANAGER
  EMPLOYEE
}

model User {
  id                        String    @id @default(uuid()) @db.Uuid
  company_id                String    @db.Uuid
  full_name                 String    @db.VarChar(255)
  email                     String    @unique @db.VarChar(255)
  password_hash             String    @db.VarChar(255)
  role                      UserRole
  auto_approval_limit_paise BigInt?
  is_active                 Boolean   @default(true)
  created_at                DateTime  @default(now()) @db.Timestamptz

  company Company @relation(fields: [company_id], references: [id])
  
  // Relations
  expenses_submitted Expense[] @relation("ExpenseSubmitter")
  approvals          ExpenseApproval[]
  payment_runs       PaymentRun[]
  
  @@map("users")
}

// ------------------------------------------------------
// ENTERPRISE COST CENTERS & ALLOCATIONS
// ------------------------------------------------------
model CostCenter {
  id          String   @id @default(uuid()) @db.Uuid
  company_id  String   @db.Uuid
  name        String   @db.VarChar(255)
  code        String   @unique @db.VarChar(50)
  manager_id  String?  @db.Uuid
  is_active   Boolean  @default(true)
  
  company     Company  @relation(fields: [company_id], references: [id])
  allocations ExpenseAllocation[]

  @@map("cost_centers")
}

model ExpenseAllocation {
  id             String      @id @default(uuid()) @db.Uuid
  expense_id     String      @db.Uuid
  account_id     String      @db.Uuid
  cost_center_id String?     @db.Uuid
  amount_paise   BigInt
  percentage     Decimal?    @db.Decimal(5,2)

  expense        Expense     @relation(fields: [expense_id], references: [id], onDelete: Cascade)
  account        Account     @relation(fields: [account_id], references: [id])
  cost_center    CostCenter? @relation(fields: [cost_center_id], references: [id])

  @@map("expense_allocations")
}

// ------------------------------------------------------
// EXPENSES & APPROVAL WORKFLOWS
// ------------------------------------------------------
enum ExpenseStatus {
  submitted
  proof_requested
  approved
  rejected
  paid
  disputed
}

model Expense {
  id                          String          @id @default(uuid()) @db.Uuid
  company_id                  String          @db.Uuid
  submitted_by                String          @db.Uuid
  amount_paise                BigInt
  expense_date                DateTime        @db.Date
  category                    String
  description                 String?         @db.Text
  
  // Compliance / GST Tracking
  merchant_name               String?         @db.Text
  gstin                       String?         @db.Text
  invoice_number              String?         @db.Text
  tax_amount_paise            BigInt?
  
  status                      ExpenseStatus   @default(submitted)
  created_at                  DateTime        @default(now()) @db.Timestamptz

  submitter   User                @relation("ExpenseSubmitter", fields: [submitted_by], references: [id])
  
  // New Enterprise Relations
  allocations ExpenseAllocation[]
  approvals   ExpenseApproval[]
  payment_run PaymentRunItem?

  @@map("expenses")
}

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
  level         Int            @default(1)
  acted_at      DateTime       @default(now()) @db.Timestamptz

  expense       Expense        @relation(fields: [expense_id], references: [id], onDelete: Cascade)
  approver      User           @relation(fields: [approver_id], references: [id])

  @@map("expense_approvals")
}

// ------------------------------------------------------
// PAYMENT BATCHING (ENTERPRISE SCALING)
// ------------------------------------------------------
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
  bank_ref_id  String?          @db.VarChar(255)
  created_at   DateTime         @default(now()) @db.Timestamptz

  company      Company          @relation(fields: [company_id], references: [id])
  initiator    User             @relation(fields: [initiated_by], references: [id])
  items        PaymentRunItem[]

  @@map("payment_runs")
}

model PaymentRunItem {
  id             String     @id @default(uuid()) @db.Uuid
  payment_run_id String     @db.Uuid
  expense_id     String     @unique @db.Uuid
  amount_paise   BigInt
  status         String     @default("PENDING")

  payment_run    PaymentRun @relation(fields: [payment_run_id], references: [id], onDelete: Cascade)
  expense        Expense    @relation(fields: [expense_id], references: [id])

  @@map("payment_run_items")
}

// ------------------------------------------------------
// LEDGER & AUDIT (Abbreviated)
// ------------------------------------------------------
model Account {
  id             String        @id @default(uuid()) @db.Uuid
  company_id     String        @db.Uuid
  name           String
  allocations    ExpenseAllocation[]
  @@map("accounts")
}

model AuditLog {
  id             String   @id @default(uuid()) @db.Uuid
  company_id     String   @db.Uuid
  actor_id       String   @db.Uuid
  action         String
  target_type    String?
  target_id      String?
  created_at     DateTime @default(now()) @db.Timestamptz
  @@map("audit_log")
}
```
