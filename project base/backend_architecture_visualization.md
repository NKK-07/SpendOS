# Backend Architecture Visualization (Enterprise Expansion)

The following diagrams visualize how the backend processes expenses, handles policies, manages multi-level approvals, and eventually executes payment runs and ledger allocations using the new enterprise tables.

## 1. Expense Submission & Policy Evaluation

When an employee submits an expense, the system now splits the expense across cost centers and evaluates it against the policy engine.

```mermaid
sequenceDiagram
    actor Employee
    participant API
    participant ExpenseService
    participant PolicyEngine
    participant Database

    Employee->>API: POST /expenses (amount, receipt, allocations)
    API->>ExpenseService: createExpense()
    
    ExpenseService->>Database: Insert Expense (Status: SUBMITTED)
    ExpenseService->>Database: Insert ExpenseAllocations (mapped to Cost Centers & Accounts)
    
    ExpenseService->>PolicyEngine: evaluateExpense(expense, allocations)
    PolicyEngine->>Database: Fetch SpendPolicy & CostCenter rules
    PolicyEngine-->>ExpenseService: returns { action: ROUTE_TO_MANAGER, violations: [] }
    
    ExpenseService->>Database: Update WorkflowState -> IN_REVIEW
    ExpenseService->>Database: Write OutboxEvent (expense_submitted)
    ExpenseService-->>API: Expense Created
    API-->>Employee: 201 Created
```

## 2. Multi-Level Approval Workflow

Replacing the single-tier approval, the system now writes to the `expense_approvals` table to maintain a strict chain of custody.

```mermaid
sequenceDiagram
    actor Manager
    actor FinanceAdmin
    participant API
    participant ApprovalService
    participant Database

    Note over Manager, Database: Level 1 Approval (Department Manager)
    Manager->>API: POST /expenses/{id}/approve
    API->>ApprovalService: recordApproval(Manager)
    ApprovalService->>Database: Insert ExpenseApproval { level: 1, action: APPROVED }
    ApprovalService->>Database: Update Expense (WorkflowState -> PENDING_FINANCE)
    API-->>Manager: 200 OK

    Note over FinanceAdmin, Database: Level 2 Approval (Finance Team)
    FinanceAdmin->>API: POST /expenses/{id}/approve
    API->>ApprovalService: recordApproval(FinanceAdmin)
    ApprovalService->>Database: Insert ExpenseApproval { level: 2, action: APPROVED }
    ApprovalService->>Database: Update Expense (WorkflowState -> APPROVED, FinancialState -> PENDING_PAYMENT)
    ApprovalService->>Database: Write AuditLog (Finance Approved)
    API-->>FinanceAdmin: 200 OK
```

## 3. Batched Payment Runs

Instead of marking expenses paid one-by-one, Finance initiates a bulk payment run.

```mermaid
sequenceDiagram
    actor FinanceAdmin
    participant API
    participant PaymentRunService
    participant BankAPI
    participant Database

    FinanceAdmin->>API: POST /payment-runs (filters: pending_payment, date_range)
    API->>PaymentRunService: createBatch()
    
    PaymentRunService->>Database: Query 500 Approved Expenses
    PaymentRunService->>Database: Create PaymentRun (Status: DRAFT)
    PaymentRunService->>Database: Insert 500 PaymentRunItems
    PaymentRunService-->>API: Returns Batch Summary
    
    FinanceAdmin->>API: POST /payment-runs/{id}/execute
    API->>PaymentRunService: executeBatch()
    PaymentRunService->>Database: Update PaymentRun Status -> PENDING_BANK
    
    PaymentRunService->>BankAPI: POST /batch/icici (or Zoho ERP webhook)
    BankAPI-->>PaymentRunService: 202 Accepted (Bank Ref ID)
    
    PaymentRunService->>Database: Update PaymentRun with Bank Ref
```

## 4. Double-Entry Ledger Allocation (Source of Truth)

Once the payment run is confirmed, the system maps the allocations to actual immutable ledger journal entries.

```mermaid
sequenceDiagram
    participant Webhook
    participant LedgerService
    participant Database

    Webhook->>LedgerService: Bank Webhook (Batch Success)
    LedgerService->>Database: Update PaymentRunStatus -> COMPLETED
    
    loop For Each PaymentRunItem
        LedgerService->>Database: Fetch ExpenseAllocations for Expense
        
        LedgerService->>Database: Create JournalGroup (MERCHANT_SPEND)
        
        Note over LedgerService, Database: DEBIT Entries (Based on Allocations)
        LedgerService->>Database: Insert JournalEntry (Debit: Marketing Account - ₹6000)
        LedgerService->>Database: Insert JournalEntry (Debit: Engineering Account - ₹4000)
        
        Note over LedgerService, Database: CREDIT Entry
        LedgerService->>Database: Insert JournalEntry (Credit: Corporate Bank Account - ₹10000)
        
        LedgerService->>Database: Update Expense (FinancialState -> PAID)
    end
```
