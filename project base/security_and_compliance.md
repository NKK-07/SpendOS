# Security & Compliance Architecture

SpendOS processes sensitive financial data and PII, requiring enterprise-grade security and strict adherence to financial compliance standards.

## 1. Authentication & Authorization

### 1.1 Identity Verification
- All user passwords are computationally hashed using Argon2id (or bcrypt) prior to storage.
- Multi-Factor Authentication (MFA) is fully supported natively using TOTP (Time-based One-Time Passwords).
- Active Sessions are tracked in Redis, allowing administrators to instantly invalidate compromised tokens across all devices.

### 1.2 Role-Based Access Control (RBAC)
Every endpoint checks the `UserRole` before proceeding.
- **EMPLOYEE:** Can only view and interact with their own submitted expenses.
- **MANAGER:** Can view expenses submitted by their reporting structure.
- **FINANCE / ADMIN:** Global read/write access subject to Segregation of Duties.
- **PRINCIPAL:** Reserved for company founders or legal owners, granting overriding authority.

## 2. Segregation of Duties (SoD)

To prevent internal fraud, the PolicyEngine enforces strict mathematical Segregation of Duties.
- **Self-Dealing Prevention:** `submitted_by` can NEVER equal `approver_id`. A manager cannot approve their own expense.
- **Payout Segregation:** The user who initiates a `PaymentRun` cannot be the same user who approved the underlying expenses (if configured in strict mode).

## 3. Auditability & Non-Repudiation

### 3.1 Immutable Audit Log
Every critical action in the system generates a record in the `audit_log` table.
- This includes: `POLICY_UPDATED`, `EXPENSE_APPROVED`, `TICKET_RESOLVED`, `PAYMENT_RUN_EXECUTED`.
- The log tracks: Actor ID, Target Entity, Action taken, exact Timestamp, and the delta of changes (Metadata).
- The `audit_log` is strictly append-only. There are no API endpoints to UPDATE or DELETE audit records.

### 3.2 Document Chain of Custody
- When a receipt is uploaded, the original S3 object is marked immutable.
- If a reviewer requests a better receipt, the user uploads a `proof` type document. The original is never overwritten, preserving the historical context of the submission.

## 4. Regulatory Compliance

### 4.1 DPDP Act (India) & GDPR
- Users can be deactivated (`is_active = false`) and "Frozen", ensuring their historical financial records remain intact for accounting compliance, while their PII is masked or inaccessible for new transactions.

### 4.2 GST Readiness
- The updated schema mandates strict capturing of `merchant_name`, `gstin`, `invoice_number`, and `tax_amount_paise`.
- This ensures that finance teams have all necessary data to file Input Tax Credit (ITC) claims without manually contacting employees.

## 5. Data Protection

### 5.1 Encryption
- **In Transit:** All API traffic strictly requires TLS 1.2 or higher.
- **At Rest:** Database volumes and AWS S3 buckets storing receipts are encrypted using AES-256 server-side encryption.

### 5.2 XSS and Injection Protection
- The use of Prisma ORM completely mitigates SQL Injection attacks by utilizing parameterized queries natively.
- All rich-text inputs (comments, notes) are parsed through an XSS sanitizer before saving to the database.
