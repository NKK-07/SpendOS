# Backend and API Architecture

SpendOS uses a modern, high-performance Node.js backend designed for strict financial compliance, idempotency, and scalability.

## 1. Core Technology Stack
- **Framework:** Fastify (Chosen for low overhead and high throughput)
- **Validation:** Zod (Strict runtime schema validation to prevent malformed payloads)
- **ORM:** Prisma (Type-safe database interactions with PostgreSQL)
- **Caching & Locks:** Redis (Used for distributed locking to prevent double-spending and race conditions)
- **Language:** TypeScript (Strict mode enabled to eliminate null reference errors)

## 2. API Design Principles
The API follows RESTful conventions but strictly enforces "Command" semantics for state changes to prevent dirty reads or race conditions.

### 2.1 Idempotency & Safe Retries
Every state-mutating endpoint (POST/PUT/PATCH) requires an `Idempotency-Key` header.
- The system checks the `idempotency_keys` table before processing.
- If a network partition occurs and the client retries the request, the backend intercepts it and returns the cached response rather than duplicating the expense or payment run.

### 2.2 Data Validation Boundary
All incoming JSON payloads are stripped of unknown properties.
All strings (like `description` and `merchant_name`) are processed through the `xss` library to sanitize potential malicious scripts before hitting the controller.

## 3. Service Layer & Business Logic

The backend is strictly divided into Controllers (Handling HTTP) and Services (Handling Business Logic).

### 3.1 Policy Engine (`PolicyEngine`)
Before any action (submit, approve, mark paid) is committed, it passes through the PolicyEngine.
- **Segregation of Duties (SoD):** The engine mathematically guarantees that the `submitted_by` user can never equal the `approver_id`.
- **Lock Evaluation:** If an expense is currently locked by Manager A, Manager B cannot approve it.
- **Rule Evaluation:** Checks the company's `SpendPolicy` (e.g., auto-approve thresholds, receipt requirements) and dynamically routes the expense to the correct workflow state.

### 3.2 Double-Entry Ledger Engine
Instead of just updating a "balance" column, SpendOS uses an immutable, append-only double-entry ledger.
- An expense allocation triggers a `JournalGroup` containing multiple `JournalEntry` records.
- Debits and Credits must exactly balance to `0` or the database transaction aborts.

### 3.3 Transactional Outbox (`OutboxEvent`)
To interact with external services (like sending an email or pinging an ERP webhoook) without risking dual-write failures, the backend uses the Outbox Pattern.
- When an expense is approved, the database transaction writes the updated status AND an `OutboxEvent` row.
- A background worker reliably polls this table and delivers the event to the external queue.

## 4. Key Endpoints

### `POST /expenses`
- **Purpose:** Submits a new expense with attached allocations and GST details.
- **Flow:** Validates via Zod -> Stores Expense & Allocations -> Evaluates Auto-approval Policy -> Writes Outbox event -> Returns 201.

### `POST /expenses/:id/approve`
- **Purpose:** Records a managerial or financial approval.
- **Flow:** Validates SoD -> Writes to `ExpenseApproval` -> Evaluates if next level approval is needed -> Updates `WorkflowState` -> Returns 200.

### `POST /payment-runs`
- **Purpose:** Batches approved expenses into a payout instruction.
- **Flow:** Locks expenses -> Creates `PaymentRun` and `PaymentRunItems` -> Sets state to `PENDING_BANK`.
