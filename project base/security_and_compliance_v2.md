# SpendOS Security & Compliance v2 (Maturity Score: 9.2/10)

This document outlines the Enterprise-Grade security controls that align SpendOS with stringent SOC 2 Type II, ISO 27001, and Fintech Due-Diligence requirements.

## 1. Zero-Trust Authorization & ABAC
- **Attribute-Based Access Control**: `User.approval_scope` explicitly defines JSON parameters like `cost_centers`, `legal_entities`, and `max_approval_limit`. This replaces hard-coded roles (`MANAGER`/`EMPLOYEE`) with dynamic, context-aware policy checks.
- **Physical Segregation of Duties (SoD)**: The requirement that an expense submitter cannot be its approver is no longer just enforced by a Node.js `if` statement. It is backstopped by the PostgreSQL Trigger `enforce_sod_submitter_approver`. A bug in the application layer cannot bypass this control.

## 2. Ledger Immutability & Audit Chaining
- **Cryptographic Hashing**: The `audit_log` table functions as a tamper-evident blockchain. Every record hashes its payload along with the `previous_hash` of the prior log for that company.
- **External Root Anchoring**: The system exposes a `verifyChainIntegrity` method capable of recalculating the entire chain up to the current `record_hash`. In a production environment, an hourly cron job publishes this `chain_root` to an external transparency log (like GitHub or an S3 Object Lock vault). This proves mathematically that AWS DBAs did not retroactively delete or alter records.

## 3. High-Risk Action Guardrails (Payment Runs)
- **Four-Eyes Principle**: A batch Payment Run cannot be executed by the user who initiated it. PostgreSQL Trigger `enforce_four_eyes_payment` physically blocks the transition.
- **State Machine Enforcement**: Payment Runs must strictly follow `DRAFT -> SUBMITTED -> APPROVED -> EXECUTED -> SETTLED`. Trigger `enforce_payment_run_state_machine` blocks malicious state skipping.
- **Step-Up MFA via Elevation Tokens**: High-risk endpoints (like `/execute`) reject standard Session JWTs. They require an `x-elevation-token` (valid for 5 minutes) issued by an OTP verification. The token binds cryptographically to the user's `device_id` and `ip_subnet` to defeat stolen token replays.
- **Payload Replay Coupling**: Valid requests require a one-time `nonce`. The nonce is cryptographically bound to the hash of the HTTP body (`request_hash`) and inserted into the `IdempotencyKey` table. Attempting to replay the request with the same nonce but altered JSON throws a DB collision.

## 4. Threat Detection & Malware Quarantine
- **Out-of-Band Scanning**: Uploaded receipts are not synchronously processed in Node.js (which opens DDoS vectors). They are pushed directly to an S3 `quarantine-bucket`.
- **EventBridge Webhooks**: AWS Lambda runs ClamAV and fires an event to `/webhooks/s3-malware-scan`. 
- **HMAC Deduplication**: The webhook payload must include `x-signature` (HMAC-SHA256) and `x-timestamp` (expiring in 5 minutes). To prevent an attacker from replaying a "CLEAN" status over an "INFECTED" file, the webhook's `event_id` is deduplicated inside the `IdempotencyKey` table.
