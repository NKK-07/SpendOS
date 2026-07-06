# VIR Security Remediation Checklist
# SpendOS — Priority-Ordered Fix List
# Audit Date: 2026-06-23
# Status key: [ ] TODO | [~] IN_PROGRESS | [x] DONE | [!] BLOCKED

## RULES FOR THIS CHECKLIST
1. Items are fixed IN ORDER. Do not skip ahead.
2. No item may be marked DONE without passing tests.
3. Each item has an assigned agent. No agent touches another agent's item.
4. The Orchestrator controls the gate between items. Nothing moves without its approval.

---

## CRITICAL — Fix Immediately

- [ ] **VIR-001** | `auth.service.ts:127` `getMe`
  - Agent: **Dev**
  - Issue: `getMe` returns full user row — `mfa_secret`, `password_hash`, `recovery_codes` exposed on every `/me` call
  - Fix: Add explicit `select` block excluding all credential fields from the Prisma query
  - Files: `apps/api/src/services/auth.service.ts`, `apps/api/src/__tests__/services.integration.test.ts`
  - Gate: Integration test proves `/api/v1/auth/me` response contains NO `mfa_secret`, `password_hash`, or `recovery_codes`

- [ ] **VIR-002** | `schema.prisma` `User.mfa_secret`
  - Agent: **Dev** + **Data Engineer**
  - Issue: TOTP secret stored plaintext in DB — DB breach permanently defeats MFA for all users
  - Fix: Encrypt `mfa_secret` at rest using AES-256-GCM; key from env var `MFA_ENCRYPTION_KEY`
  - Files: `apps/api/src/services/auth.service.ts`, `apps/api/src/services/mfa.service.ts`, migration SQL
  - Gate: DB column value is verifiably NOT the raw TOTP secret string; TOTP verification still works end-to-end

- [ ] **VIR-003** | `.env` committed to git
  - Agent: **DevOps**
  - Issue: Real JWT/DB/AWS secrets in git history — anyone with repo access can forge any JWT
  - Fix: Add `.env` to `.gitignore`; add all committed secret values to `config.ts` unsafeDefaults blocklist; document secret rotation steps
  - Files: `.gitignore`, `apps/api/src/config.ts`, `spendos-monorepo/.gitignore`
  - Gate: `git check-ignore -v apps/api/.env` returns match; config validator rejects all committed secret values at boot

- [ ] **VIR-004** | `auth.service.ts:114` `refresh`
  - Agent: **Dev**
  - Issue: No JWT revocation — logout does not invalidate refresh tokens; stolen tokens work until natural expiry
  - Fix: On logout, write token JTI to Redis blacklist with TTL = remaining token lifetime; check blacklist on every `refresh` call
  - Files: `apps/api/src/services/auth.service.ts`, `apps/api/src/routes/auth.routes.ts`
  - Gate: Logout then replay of refresh token returns 401; active session is unaffected

- [ ] **VIR-005** | `plugins/auth.ts` + `/uploads/*`
  - Agent: **Dev**
  - Issue: `/uploads/*` served with zero authentication — financial documents publicly accessible by URL guessing
  - Fix: Remove `/uploads` and `/local-s3` from public routes; route all document downloads through an authenticated endpoint that verifies ownership before serving
  - Files: `apps/api/src/plugins/auth.ts`, `apps/api/src/routes/local-s3.routes.ts`, `apps/api/src/controllers/expenses.controller.ts`
  - Gate: Unauthenticated `GET /uploads/<any-path>` returns 401; authenticated owner receives 200; authenticated non-owner receives 403

- [ ] **VIR-006** | `policy.engine.ts` ABAC bypass
  - Agent: **Architect** + **Dev**
  - Issue: When `approval_scope = null` (default for all users), all financial delegation limits are skipped — unlimited approval authority
  - Fix: Invert guard: null scope = most restrictive (deny all allocations outside a configurable system-default limit, e.g. 0); require explicit scope assignment for approval rights
  - Files: `apps/api/src/services/policy.engine.ts`, `apps/api/src/services/expenses.service.ts`
  - Gate: User with `approval_scope = null` attempting to approve an expense above threshold receives 403; user with explicit scope can approve within bounds

---

## HIGH — Fix Before Production

- [ ] **VIR-007** | `expenses.service.ts` review lock TOCTOU
  - Agent: **Dev**
  - Issue: Lock acquisition and subsequent fresh-read are two non-transactional ops — stale state window between them
  - Fix: Wrap the `$queryRaw` UPDATE lock and the subsequent `findUnique` inside a single `prisma.$transaction`
  - Files: `apps/api/src/services/expenses.service.ts:133-158`
  - Gate: Concurrent lock acquisition test shows no stale-state window; the fresh read always reflects post-lock state

- [ ] **VIR-008** | `audit.ts` hash chain race condition
  - Agent: **Architect** + **Data Engineer**
  - Issue: Concurrent writes fork the hash chain — two records claim sequence N+1, destroying tamper-evidence
  - Fix: Serialize audit inserts per company using `SELECT pg_advisory_xact_lock(hashtext(company_id))` inside a transaction
  - Files: `apps/api/src/services/audit.ts`
  - Gate: Concurrent audit log test (50 simultaneous writes) produces a strictly linear chain with no forks; `verifyChainIntegrity` passes

- [ ] **VIR-009** | `auth.service.ts:87` no account lockout
  - Agent: **Dev** + **DevOps**
  - Issue: No lockout after N failed logins — credential stuffing unimpeded; rate limiter fails open when Redis is down
  - Fix: After 5 consecutive failures for the same email, lock the account for 15 minutes (Redis with DB fallback); emit audit event on N failures; per-email rate limit in addition to per-IP
  - Files: `apps/api/src/services/auth.service.ts`, `apps/api/src/plugins/rate-limit.ts`
  - Gate: 6th login attempt within window returns 429; account unlocks after TTL; audit log contains lockout event

- [ ] **VIR-010** | `mfa.service.ts` TOTP replay
  - Agent: **Dev**
  - Issue: Used TOTP codes not tracked — valid code replayable within 30s window
  - Fix: Store each verified TOTP code in Redis with key `totp:used:{userId}:{code}` and TTL of 90 seconds; reject duplicates
  - Files: `apps/api/src/services/mfa.service.ts`
  - Gate: Replaying a valid TOTP code within the same window returns 401; a fresh code at next period succeeds

- [ ] **VIR-011** | `webhook.controller.ts` default HMAC secret
  - Agent: **Dev** + **DevOps**
  - Issue: `WEBHOOK_HMAC_SECRET` defaults to `dev-webhook-secret` if env var absent; quarantine action is a no-op
  - Fix: Add `WEBHOOK_HMAC_SECRET` as required `z.string().min(32)` in `config.ts`; implement actual quarantine logic (update document status, block from serving)
  - Files: `apps/api/src/config.ts`, `apps/api/src/controllers/webhook.controller.ts`
  - Gate: Server fails to start if `WEBHOOK_HMAC_SECRET` absent or under 32 chars; forged webhook request returns 401; INFECTED document is blocked from download endpoint

- [ ] **VIR-012** | `expenses.service.ts:449` account name fragility
  - Agent: **Dev** + **Data Engineer**
  - Issue: `markPaid` looks up accounts by name string — admin renaming an account permanently breaks all payment processing
  - Fix: Add `account_role` enum column to `Account` table (`CORPORATE_EXPENSE`, `CORPORATE_TREASURY`, etc.); look up by role, not name
  - Files: `packages/database/prisma/schema.prisma`, migration SQL, `apps/api/src/services/expenses.service.ts`, `apps/api/src/services/auth.service.ts`
  - Gate: `markPaid` succeeds after account is renamed; lookup by `account_role` enum is used in all financial operations

- [ ] **VIR-018** | `policy.engine.ts` enforcement mode bypass
  - Agent: **Dev**
  - Issue: `POLICY_ENFORCEMENT_MODE` env var can disable all SoD enforcement at runtime with no config validation
  - Fix: Remove the env var switch entirely; hardcode strict enforcement; if shadow-mode is needed, make it a compile-time flag with no runtime path to disable
  - Files: `apps/api/src/services/policy.engine.ts`, `apps/api/src/config.ts`
  - Gate: `POLICY_ENFORCEMENT_MODE=permissive` in env has no effect; SoD violation always returns 403 regardless of env

---

## MEDIUM — Fix Before Enterprise Sales

- [ ] **VIR-013** | `rate-limit.ts` Redis fallback fails open
  - Agent: **DevOps**
  - Issue: In-memory fallback during Redis outage gives per-process limit only, effectively multiplied by N instances
  - Fix: On Redis failure, apply 10 req/min local limit (vs. 100); return 503 for login/refresh/password-reset if Redis unavailable; emit alert metric
  - Files: `apps/api/src/plugins/rate-limit.ts`
  - Gate: Simulated Redis outage returns 503 on sensitive endpoints; per-process limit drops to conservative value

- [ ] **VIR-014** | `outbox.processor.ts` FOR UPDATE outside transaction
  - Agent: **Dev** + **Data Engineer**
  - Issue: `FOR UPDATE SKIP LOCKED` runs outside a transaction — concurrent workers pick up the same events
  - Fix: Wrap the fetch query and processing loop in an explicit `prisma.$transaction` or explicit `BEGIN/COMMIT` block
  - Files: `apps/api/src/services/outbox.processor.ts`
  - Gate: Running 3 outbox worker instances simultaneously produces exactly 1 notification per event, never duplicates

- [ ] **VIR-015** | Idempotency key not required on financial endpoints
  - Agent: **Dev**
  - Issue: Financial write endpoints allow missing idempotency key — mobile retries create duplicate expenses/payments
  - Fix: Make `Idempotency-Key` header required (400 if absent) on `POST /expenses`, `POST /expenses/:id/mark-paid`, and all financial write routes; enforce at route schema level
  - Files: `apps/api/src/routes/expenses.routes.ts`, `apps/api/src/middlewares/idempotency.middleware.ts`
  - Gate: `POST /expenses` without `Idempotency-Key` header returns 400; retry with same key returns idempotent response

- [ ] **VIR-016** | `schema.prisma` CostCenter code global unique
  - Agent: **Data Engineer**
  - Issue: `CostCenter.code @unique` is global — cross-tenant collision; one company blocks all others from common codes
  - Fix: Change to `@@unique([company_id, code])`; migration to drop global index, add composite
  - Files: `packages/database/prisma/schema.prisma`, migration SQL
  - Gate: Two different companies can both create a cost center with code `"MKTG"`; same company cannot have duplicate codes

- [ ] **VIR-017** | `auth.service.ts:133` email enumeration via forgotPassword
  - Agent: **Dev**
  - Issue: Timing difference reveals whether email is registered; no per-email rate limit on forgot-password
  - Fix: Constant-time response regardless of user existence (add artificial delay when user not found); per-email rate limit (1 request per 5 min per email); log forgot-password requests to audit
  - Files: `apps/api/src/services/auth.service.ts`, `apps/api/src/routes/auth.routes.ts`
  - Gate: Response time for unknown vs known email is statistically indistinguishable (within 10ms); 2nd request within 5 min for same email returns 429

- [ ] **VIR-022** | Upload URL no ownership check
  - Agent: **Dev**
  - Issue: Any authenticated company member can get an upload URL for any expense in the company (not just their own)
  - Fix: Verify in the upload-url handler that the requesting user is either the expense submitter or has reviewer role
  - Files: `apps/api/src/controllers/expenses.controller.ts`, `apps/api/src/routes/expenses.routes.ts`
  - Gate: Employee requesting upload URL for another employee's expense receives 403; submitter and reviewers receive 200

---

## LOW / NOTES — Before SOC 2 Audit

- [ ] **VIR-019** | `mfa.service.ts` client-supplied deviceId
  - Agent: **Dev**
  - Issue: `deviceId` comes from client — untrusted input used as trust signal in risk hash
  - Fix: Device tokens must be server-issued and cryptographically signed; client presents signed token, not a raw ID
  - Files: `apps/api/src/services/mfa.service.ts`

- [ ] **VIR-020** | `config.ts` secret entropy validation
  - Agent: **DevOps**
  - Issue: Config guard checks for sentinel strings but not entropy — `"abc12345"` passes
  - Fix: Add minimum entropy check: secrets must be ≥32 chars with mixed character classes
  - Files: `apps/api/src/config.ts`

- [ ] **VIR-021** | `outbox.processor.ts` poll interval comment vs code mismatch
  - Agent: **Dev**
  - Issue: Comment says 5s, code says 2000ms; hardcoded interval not configurable
  - Fix: Add `OUTBOX_POLL_INTERVAL_MS` env var; fix comment to match code
  - Files: `apps/api/src/services/outbox.processor.ts`, `apps/api/src/config.ts`

- [ ] **VIR-023** | Background jobs start in non-prod implicitly
  - Agent: **DevOps**
  - Issue: `NODE_ENV !== "production"` starts all background jobs — pollutes CI, competes with dedicated worker in staging
  - Fix: Remove the `NODE_ENV` fallback; jobs start only if `RUN_JOBS=true` explicitly
  - Files: `apps/api/src/server.ts`

- [ ] **VIR-024** | `expenses.service.ts:483` verifyGst no ownership check
  - Agent: **Dev**
  - Issue: Any company member can trigger GST verification on any expense (potential cost abuse)
  - Fix: Restrict to submitter or reviewer role; add rate limit on GST verification calls
  - Files: `apps/api/src/services/expenses.service.ts`

- [ ] **VIR-025** | `auth.service.ts:190` MFA secret persisted before enrollment complete
  - Agent: **Dev**
  - Issue: `mfa_secret` stored in DB before user verifies they can produce valid TOTP — abandoned enrollments leave plaintext secrets forever
  - Fix: Store provisioned secret in short-TTL Redis key; commit to DB only on successful TOTP verification in `verifyMfa`
  - Files: `apps/api/src/services/auth.service.ts`

---

## Summary

| Priority | Count | Done |
|---|---|---|
| CRITICAL | 6 | 0 |
| HIGH | 7 | 0 |
| MEDIUM | 6 | 0 |
| LOW | 6 | 0 |
| **TOTAL** | **25** | **0** |

Last updated: 2026-06-23
