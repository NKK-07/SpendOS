# Global SpendOS Engineering Constitution

**Priority Order:**
1. Financial Correctness
2. Security
3. Compliance
4. Reliability
5. Performance
6. Developer Experience

**Mandatory Rules:**
- Never use floating point for money
- Every financial action auditable
- Every mutation idempotent
- No hard deletes
- No silent failures
- No eventual consistency for balances
- Every external webhook idempotent
- Every state transition logged
- All PII encrypted
- Multi-tenancy enforced at DB level
