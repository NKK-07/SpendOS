# Exhaustive Business Logic & Cryptography Reference

This document maps out the specific internal classes and cryptographic algorithms used to enforce the SpendOS security and operational boundaries.

## 1. Cryptographic Ledger (`AuditService`)
File: `apps/api/src/services/audit.ts`

### 1.1 The Chaining Algorithm
SpendOS uses a deterministic SHA-256 hash chain to render the `audit_log` tamper-evident.
- **Payload Construction**: When `AuditService.log()` is called, it constructs a JSON string containing exact keys: `company_id`, `actor_id`, `action`, `target_id`, `target_type`, `metadata`, `correlation_id`, and crucially, `previous_hash`.
- **Pre-Hashing State**: It executes a highly-ordered database read (`orderBy: { chain_sequence: 'desc' }`) for the specific `company_id` to retrieve the most recent `record_hash`.
- **Hashing**: `const recordHash = crypto.createHash('sha256').update(hashPayload).digest('hex')`
- **Immutability Validation**: The method `verifyChainIntegrity()` loops through the entire table by `chain_sequence` from `1` to `N`. It recalculates the SHA-256 hash of row `1` and verifies it exactly matches the `previous_hash` of row `2`. Any discrepancy immediately throws a violation flag.

## 2. Step-Up Authentication (`MFAService`)
File: `apps/api/src/services/mfa.service.ts`

### 2.1 MFA Elevation Tokens
Standard JWT Sessions are vulnerable to theft. To execute critical tasks, SpendOS demands "Step-Up MFA".
- **Token Generation**: `verifyAndElevate(userId, otpCode, context)`
  - Verifies the TOTP code (via a mocked `otplib` integration).
  - Derives a Risk Context: `const riskContextHash = crypto.createHash('sha256').update(`${deviceId}:${ipSubnet}`).digest('hex')`.
  - Signs a new JWT `mfa_elevation_token` using a unique `MFA_JWT_SECRET`. The token expires strictly in 5 minutes (`ELEVATION_TTL_MINUTES = 5`).
- **Context Binding (`validateElevationToken`)**:
  - The controller passes the incoming request's IP and Device ID. 
  - The service recalculates the `riskContextHash` locally. If the decoded token's hash does not perfectly match the live request's hash, it rejects the token as stolen/moved.

## 3. The Rules Engine (`PolicyEngine`)
File: `apps/api/src/services/policy.engine.ts`

### 3.1 `assertTransition`
A centralized gatekeeper that blocks or permits any state change inside the SpendOS ecosystem.
- Invokes three specific checks: `assertSoD` (Access Control), `evaluateLock` (Concurrency Control), and `evaluateTransitionRules` (Workflow validity).

### 3.2 Attribute-Based Access Control (ABAC) in `assertSoD`
- **The JSON Scope**: Reads `actor.approval_scope` (e.g., `{ "cost_centers": ["ENG"], "max_approval_limit": 500000 }`).
- **Limit Evaluation**: Validates that `expense.amount_paise <= scope.max_approval_limit * 100`.
- **Deep Relational Matching**: Loops through `expense.allocations`. Extracts the associated `CostCenter` code from every allocation slice. Ensures that the `actor.approval_scope.cost_centers` array `.includes()` every single code attached to the expense. If the expense spans into a department the approver doesn't oversee, the approval is hard-rejected.

### 3.3 State Evaluation (`evaluateTransitionRules`)
- Operates on a structured input representing the transition matrix: `workflowFrom`, `workflowTo`, `financialFrom`, `financialTo`, `disputeState`.
- **Double-Lock Validation**: Rejects an `APPROVE_EXPENSE` action if the financial state changes from `NOT_APPROVED` to anything other than `APPROVED` simultaneously.
- **Dispute Locking**: If `disputeState === OPEN`, actions like `MARK_PAID` are rigidly intercepted and denied.
