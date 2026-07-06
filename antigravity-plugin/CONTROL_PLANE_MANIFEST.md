# CONTROL_PLANE_MANIFEST.md

## 1. Metadata
- **Architecture Version**: 1.1
- **Freeze Date**: 2026-05-31
- **Status**: LOCKED

## 2. Document Inventory (The 8 Artifacts)
1. `SYSTEM_CONTRACT.md` - Master Truth
2. `LEDGER_SPEC.md` - DB Schemas
3. `PAYMENT_STATE_MACHINE.md` - Transition Rules
4. `ACCOUNTING_ENGINE.md` - Business Event Mappings
5. `JOURNAL_INVARIANTS.md` - SQL Constraint Rules
6. `FUNDS_FLOW_MODEL.md` - Money Lifecycle
7. `FAILURE_RECOVERY_SPEC.md` - Distributed System Recovery
8. `CONTROL_PLANE_MANIFEST.md` - This File

## 3. Dependency Graph & Authority Hierarchy
```
Architecture Agent (Owns Manifest & Specs)
       │
       ▼
SYSTEM_CONTRACT.md
       │
       ├─► LEDGER_SPEC.md
       ├─► ACCOUNTING_ENGINE.md
       ├─► PAYMENT_STATE_MACHINE.md
       ├─► FUNDS_FLOW_MODEL.md
       └─► FAILURE_RECOVERY_SPEC.md
       │
       ▼
Builder Agents (Backend, Frontend, Mobile)
       │
       ▼
Implementation Code
       │
       ▼
Verifier Agents (QA, Security, Ledger, Compliance) -> Can BLOCK Merge
```

## 4. Financial Invariants
- `SUM(debits) == SUM(credits)` per journal group.
- No mutable balances; use `running_balance` snapshot.
- No financial events mutate state directly; they commit to the ledger, and state is derived.
- No floating-point math.

## 5. Approval Signatures
**Authorized By**: SpendOS Architecture Authority (User & Antigravity)
**Constraint**: Future agents MUST read this file before touching code. No new financial tables or accounting semantics without an Architecture Change Request (ACR).
