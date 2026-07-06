# SpendOS Beta 1 Security Audit

## Route Authentication & Authorization Matrix

| Route | HTTP Method | Auth Required | Role Required | Ownership Constraints |
|---|---|---|---|---|
| `/auth/register` | `POST` | ❌ No | N/A | N/A |
| `/auth/login` | `POST` | ❌ No | N/A | N/A |
| `/uploads/*` | `GET` | ❌ No | N/A | N/A (Static File Serving) |
| `/employees` | `POST` | ✅ Yes | N/A | N/A |
| `/expenses` | `POST` | ✅ Yes | N/A | Auto-assigned to current user |
| `/expenses` | `GET` | ✅ Yes | N/A | `MANAGER`/`ADMIN`: Company-wide. `EMPLOYEE`: Self only. |
| `/expenses/:id/submit` | `POST` | ✅ Yes | N/A | Must own the expense, must be `DRAFT` |
| `/expenses/:id/approve` | `POST` | ✅ Yes | `MANAGER` or `ADMIN` | Must belong to same company, must be `SUBMITTED` |
| `/expenses/:id/reimburse`| `POST` | ✅ Yes | `ADMIN` | Must belong to same company, must be `APPROVED`. Creates ledger entry. |
| `/expenses/:id/receipts`| `POST` | ✅ Yes | N/A | Must own the expense, must be `DRAFT` |

*(Note: Other legacy routes like `/transactions/allocate`, `/transactions/spend`, `/wallets` are also currently protected by the global JWT middleware but are dormant for Beta 1).*

## Positive Amount Enforcement
- The `createJournalGroup` ledger function strictly throws an error if any individual `amountPaise <= 0n` or if total transaction volume `<= 0n`.
- The `/expenses` route checks that `amountPaise > 0` before inserting into the database.

## BigInt Safety
- The ledger processes all calculations natively using BigInt (`0n`).
- `Number(amountPaise)` conversions have been completely stripped from all API layers.
- Outputs are serialized using a custom `JSON.stringify` replacer that converts BigInt values to strings right before dispatching the HTTP response.
