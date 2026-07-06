# SpendOS — Codebase Roadmap & Vir Inspection Report

**Governing document:** `antigravity.md` → `antigravity-plugin/CONSTITUTION.md` → `antigravity-plugin/SYSTEM_CONTRACT.md`
**Priority order (from CONSTITUTION):** Financial Correctness → Security → Compliance → Reliability → Performance → DX

---

## Codebase Chunks

| # | Chunk | Root Path |
|---|-------|-----------|
| 1 | AI Agent System | `agents/`, `antigravity-plugin/` |
| 2 | Backend API | `spendos-monorepo/apps/api/` |
| 3 | Web Dashboard | `spendos-monorepo/apps/dashboard/` |
| 4 | Mobile App | `spendos-monorepo/apps/mobile/` |
| 5 | Shared Packages | `spendos-monorepo/packages/` |
| 6 | Infrastructure | `spendos-monorepo/infrastructure/`, `.github/workflows/` |
| 7 | Project Base (Specs & Docs) | `project base/` |
| 8 | Utility / Scratch | Root-level scripts, `conceptual-ui/`, `documentation/` |

---

## Vir Inspection Report

**Role:** Master System Architect & Brutalist Breaker
**Mode:** Full architectural and code fault scan — no feature writing, only breaking.
**Standard:** Production enterprise fintech. SOC2, GDPR, RBI compliance in scope.

Findings are graded: **CRITICAL** → **HIGH** → **MEDIUM** → **LOW**

---

### CHUNK 1 — AI Agent System

**Files:** `agents/Vir.md`, `agents/Alex.md`, `agents/James.md`, `agents/Mira.md`, `agents/team_vir/`, `antigravity-plugin/agents/*.md`, `antigravity-plugin/skills/`, `antigravity-plugin/specs/`, `antigravity.md`

#### Findings

| Grade | Finding |
|-------|---------|
| MEDIUM | **No runtime binding.** All agent definitions are `.md` files. There is no orchestration layer, no API client, no tool-use wiring. The agents exist as prompt templates only — none of them can act autonomously or be invoked programmatically. |
| MEDIUM | **`team_vir/` has no orchestrator contract.** `orchestrator.md` exists but no mechanism ensures the sub-agents (architect, dev, devops, qa, data-engineer) actually coordinate. Handoff protocol is undefined. |
| LOW | **Spec authority chain is correct but fragile.** `SYSTEM_CONTRACT.md` defines a strict priority chain (`SYSTEM_CONTRACT → LEDGER_SPEC → ACCOUNTING_ENGINE → PAYMENT_STATE_MACHINE → ...`). Any agent working outside this chain will produce contradictory designs. No automated check enforces spec consistency. |
| LOW | **`antigravity.md` rule #1 mandates reading `shortcuts_and_hacks.md` before every session.** This is a manual rule — it is not enforced by any tool or hook. It will be forgotten. |

---

### CHUNK 2 — Backend API

**Files:** `spendos-monorepo/apps/api/src/**`

#### Findings

| Grade | Location | Finding |
|-------|----------|---------|
| **CRITICAL** | `services/mfa.service.ts:33` | **Hardcoded MFA bypass.** `const isValid = otpCode === '123456'`. Any actor who knows this can bypass MFA on any account in the system. `otplib` integration is commented out directly above the line. This is a full authentication break. |
| **CRITICAL** | `services/policy.engine.ts:29` | **Policy enforcement is a facade.** `POLICY_ENFORCEMENT_MODE` defaults to `"shadow"`. In shadow mode, ALL SoD violations, ABAC violations, and state machine conflicts are logged but NOT blocked. The four-eyes rule, cost center restrictions, and role-based guards are currently non-enforcing in any environment where this env var is unset. |
| **CRITICAL** | `plugins/auth.ts:36` | **Hardcoded cookie secret fallback.** `COOKIE_SECRET \|\| "spendos-secret-key"`. If the env var is missing, all signed cookies use a known public string. Entire session layer is compromised on any misconfigured deployment. |
| **CRITICAL** | `plugins/auth.ts:97` | **Hardcoded mobile attestation bypass string in production path.** `attestationToken !== 'MOCK_VALID_ATTESTATION'` is the production check. The string `MOCK_VALID_ATTESTATION` is committed in source. Any actor who reads this file can forge device attestation on production. |
| HIGH | `services/audit.ts:44–53` | **Race condition in audit hash chain.** `findFirst` to get `previous_hash` and subsequent `create` are two separate DB operations with no lock between them. Under concurrent writes for the same `companyId`, two events can read the same `lastRecord`, produce the same `previous_hash`, and create a branched (forked) hash chain. The comment acknowledges this — the fix (SQS queue or advisory lock) is not implemented. Chain integrity is broken at scale. |
| HIGH | `services/expenses.service.ts:48–68` | **Outbox event created outside the expense transaction.** `createExpense` opens a `prisma.expense.create`, commits it, then calls `prisma.outboxEvent.create` in a separate operation. If the second call fails, the expense exists but the outbox event is lost permanently. This violates `SYSTEM_CONTRACT §11.2`: "All events must be written to an outbox_events table within the Postgres ACID boundary." |
| HIGH | `services/policy.engine.ts:76–83` | **ABAC cost center check is dead code.** The check fires only when `expense.allocations` is present. `expenses.service.ts` never includes `allocations` in the object passed to `PolicyEngine.assertTransition`. Cost center restrictions are permanently bypassed for every transaction. |
| HIGH | `plugins/auth.ts:57–58` | **CSRF errors are silently swallowed.** `fastify.csrfProtection(request, reply, () => {})` passes an empty no-op callback. Any CSRF validation failure is caught and discarded — the request proceeds as if CSRF passed. The CSRF protection layer does nothing. |
| HIGH | `plugins/rate-limit.ts:81` | **Rate limit key trusts a spoofable header.** `keyGenerator` uses `req.headers['x-forwarded-for']` directly. An attacker can rotate this header on every request to defeat rate limiting. Needs trusted proxy config or `req.ip` as the primary key. |
| MEDIUM | `packages/ledger/src/index.ts:129` | **300-second transaction timeout.** `maxWait: 300000, timeout: 300000` on the ledger `$transaction`. A 5-minute held lock on financial accounts under concurrent load will cascade into deadlocks and connection pool exhaustion. For a double-entry ledger, this should be under 10 seconds. |
| MEDIUM | `services/outbox.processor.ts:7` | **In-process `isProcessing` guard does not scale.** The boolean flag prevents concurrent runs within one process but provides false safety — each horizontally-scaled API instance has its own flag. Under N instances, N-1 of those instances will still race. The `FOR UPDATE SKIP LOCKED` is the real guard; the flag is misleading. |
| MEDIUM | `services/outbox.processor.ts:53` | **Comment says "every 5 seconds", interval is `2000ms`.** Minor but reflects implementation drift from intent. |
| MEDIUM | `services/expenses.service.ts:43` | **`"expense_auto_approved"` is not in the `AuditAction` union** (`services/audit.ts`). No runtime error, but the event type is invisible to any code filtering by `AuditAction` and will be absent from typed audit queries. Auto-approval events are silently unclassified. |
| MEDIUM | `server.ts:184` | **Background jobs run in all non-production environments by default.** `if (RUN_JOBS === 'true' \|\| NODE_ENV !== 'production')` means the outbox worker, OCR worker, and cron jobs fire in every dev and test environment. Integration test pollution and resource contention risk. |
| MEDIUM | `services/ledger.service.ts:22–26` | **`findMany` with `distinct` + `orderBy` on different columns is semantically fragile.** Prisma emits `SELECT DISTINCT ON (account_id) ... ORDER BY sequence_number DESC`. Postgres requires the `DISTINCT ON` key to appear first in `ORDER BY`. This query will error or produce inconsistent results. Balance reads may silently return stale data. Should use `GROUP BY` + `MAX(sequence_number)` subquery. |
| LOW | `services/server.ts:1–5` | **Sentry integration commented out.** No error telemetry in production. Silent failures are constitutionally forbidden (`CONSTITUTION: No silent failures`). |
| LOW | `services/auth.service.ts` | **No Redis JWT blacklist.** Session revocation is acknowledged in `shortcuts_and_hacks.md` but not implemented. Stolen tokens cannot be invalidated before expiry. |

---

### CHUNK 3 — Web Dashboard

**Files:** `spendos-monorepo/apps/dashboard/src/`

#### Findings

| Grade | Finding |
|-------|---------|
| HIGH | **Dashboard is a skeleton.** Only one source file exists: `apps/dashboard/src/app/preview/page.tsx`. The entire web surface is unbuilt. The `conceptual-ui/` directory contains three HTML/TSX mockups (`BillionaireFintech`, `NeuralController`, `TitanEdition`) that are disconnected from the app router — they are designs, not implementations. There is no route for auth, expenses, ledger, or approvals. |
| MEDIUM | **`conceptual-ui/` files exist at project root, not inside the app.** These are orphan files with no build pipeline. They will rot relative to any API changes. |

---

### CHUNK 4 — Mobile App

**Files:** `spendos-monorepo/apps/mobile/`

#### Findings

| Grade | Finding |
|-------|---------|
| MEDIUM | **Mobile attestation backend is mocked.** `auth.ts:97` accepts `'MOCK_VALID_ATTESTATION'` as a valid attestation string. The mobile app will never fail attestation checks in the current codebase regardless of device state. |
| LOW | **`CLAUDE.md` and `AGENTS.md` exist inside `apps/mobile/`** — suggests the mobile app has its own agent context. These must be kept consistent with the root agent system (`antigravity-plugin/`) or they will diverge. |

---

### CHUNK 5 — Shared Packages

**Files:** `packages/auth/`, `packages/database/`, `packages/ledger/`, `packages/shared-types/`

#### Findings

| Grade | Location | Finding |
|-------|----------|---------|
| HIGH | `packages/database/.env` | **`.env` file is committed.** Even a dev DSN in version control is unacceptable. Signals a pattern of weak secret hygiene. Must be in `.gitignore` and replaced with `.env.example`. |
| HIGH | `packages/database/prisma/enterprise_constraints.sql` | **DB constraints are not embedded in Prisma migrations.** `shortcuts_and_hacks.md §5` confirms this — the triggers (State Machine, Four-Eyes, SoD) were applied manually via `prisma db execute`. A fresh DB deployment will have no constraints. The system is structurally unprotected on any new environment (staging, DR, developer local). |
| MEDIUM | `packages/auth/repro_vulnerability.js` | **Vulnerability reproduction script committed to production source tree.** It tests whether MFA tokens are accepted as regular access tokens. The fix is correctly implemented in `src/index.ts:40` (the `decoded.type !== "access"` guard). The repro script should exit 0. However, leaving a file named `repro_vulnerability.js` in a package shipped to production is a liability for any SOC2 or security audit. It must be moved to a `test/` directory or deleted. |
| MEDIUM | `packages/database/` | **Multiple ad-hoc migration scripts.** `migrate_enums.js`, `migrate_enums2.js`, `run_migrate.js`, `check.js` alongside the Prisma migration directory. These are out-of-band schema mutations with no audit trail in the migration history. |
| LOW | `packages/auth/src/index.ts:88` | **`signToken` legacy alias** with a comment "keep so existing imports don't break during migration." Migration should be complete or tracked. Aliases that survive indefinitely become permanent. |

---

### CHUNK 6 — Infrastructure

**Files:** `spendos-monorepo/infrastructure/terraform/`, `.github/workflows/`

#### Findings

| Grade | Finding |
|-------|---------|
| HIGH | **No Outbox CDC worker in infrastructure.** `SYSTEM_CONTRACT §11.2` mandates an outbox pattern with a reliable worker (Debezium CDC or Node.js polling). The polling worker exists in `outbox.processor.ts` but runs in-process. There is no separate infrastructure-level worker deployment (ECS task, Lambda, etc.) that is dedicated and isolated. If the API process crashes mid-batch, in-flight events are dropped. |
| HIGH | **S3 malware scanning is stubbed.** `shortcuts_and_hacks.md §3` confirms that `WebhookController` only `console.log`s the scan result. Infected files are never quarantined or blocked. File uploads from users flow to production storage unscanned. |
| MEDIUM | **Terraform state backend not visible.** `infrastructure/terraform/main.tf` exists but no remote state backend (`s3`, `gcs`, etc.) is confirmed from the file listing. If state is local, concurrent infrastructure changes will corrupt it. |
| MEDIUM | **`enterprise_constraints.sql` is not in any CI gate.** The CI workflow (`ci.yml`) does not validate that DB constraints are applied. A migration that drops a table or alters an enum will pass CI without any constraint violation being caught. |
| LOW | **`deploy-prod.yml` workflow exists but no manual approval gate is visible** from the file listing. Automated production deploys without a human gate are a risk for a financial system. |

---

### CHUNK 7 — Project Base (Specs & Docs)

**Files:** `project base/`

#### Findings

| Grade | Finding |
|-------|---------|
| MEDIUM | **Three overlapping database schema documents with no declared winner.** `db_schema_v2.md`, `exhaustive_database_schema.md`, and `full_updated_db_schema.md` all exist. `SYSTEM_CONTRACT §2.2` says documentation beats implementation, but does not say which doc is canonical when docs disagree with each other. Agents reading these will get inconsistent answers. |
| MEDIUM | **Two overlapping security documents.** `security_and_compliance.md` and `security_and_compliance_v2.md` — same problem. No deprecation marker on v1. |
| LOW | **`documentation/output.txt` and `analysis-1.txt`** are unstructured text dumps at root level. No context, no author, no date. These will mislead any agent reading them as authoritative context. |

---

### CHUNK 8 — Utility / Scratch

**Files:** Root-level scripts, `conceptual-ui/`, `documentation/`, `qa_tests/`, `nexus/`

#### Findings

| Grade | Finding |
|-------|---------|
| HIGH | **Ad-hoc fix/migration scripts at monorepo root.** `fix.js`, `fix_build.py`, `fix_target_type.py`, `refactor_server.py`, `replace.js`, `replace_roles.js`, `update_expenses_modal.py`, `update_server_lock.py`, `update_shell.py`, `update_submit.py`, `update_tickets.py`, `prune.js`, `add_cron.py`. These are undocumented, one-off mutations. They represent schema or code changes applied outside of the migration/PR/review pipeline. If any of these have already been run, their effects are invisible to git history as applied database or file changes. |
| MEDIUM | **`nexus/` and `qa_tests/` directories are empty or near-empty.** Placeholder directories with no content are noise in the codebase map and mislead agents about what is built. |
| LOW | **`spendos-monorepo/verify-slice.ts` and `verify-torture.ts`** at monorepo root — validation scripts with no documented trigger or purpose. Should be in `scripts/` or `test/` with a README entry. |

---

## Summary: What Must Be Fixed Before Production

### Blockers (CRITICAL)

1. `mfa.service.ts:33` — Implement real TOTP verification via `otplib`. Remove the hardcoded `'123456'` bypass.
2. `policy.engine.ts:29` — Set `POLICY_ENFORCEMENT_MODE=strict` in production and in all environment configs. Shadow mode is not a production policy.
3. `plugins/auth.ts:36` — Remove the `"spendos-secret-key"` fallback. Make `COOKIE_SECRET` a required env var with a boot-time assertion.
4. `plugins/auth.ts:97` — Remove `'MOCK_VALID_ATTESTATION'` hardcoded string. Implement real Play Integrity / iOS App Attest verification or disable the check explicitly with a feature flag, not a known bypass string.

### Must Fix (HIGH — Pre-SOC2)

5. `services/expenses.service.ts:48–68` — Move outbox event creation inside the expense creation transaction.
6. `services/audit.ts:44–53` — Serialize audit writes via advisory lock or dedicated queue per `company_id`.
7. `policy.engine.ts:76–83` — Include `allocations` with cost centers in every expense fetch that goes through `PolicyEngine.assertTransition`.
8. `plugins/auth.ts:57–58` — Fix CSRF callback to actually propagate errors.
9. `plugins/rate-limit.ts:81` — Fix key generator to not blindly trust `x-forwarded-for`.
10. `packages/database/prisma/enterprise_constraints.sql` — Embed in a committed Prisma migration. Remove from manual-apply workflow.
11. `packages/database/.env` — Remove from version control. Add to `.gitignore`.
12. S3 malware scanning — Implement real quarantine/promote logic via `S3.CopyObject`.

### Quality Work (MEDIUM)

13. `packages/ledger/src/index.ts:129` — Reduce transaction timeout to ≤ 10 seconds.
14. `services/ledger.service.ts:22–26` — Rewrite balance query using `MAX(sequence_number)` subquery.
15. `server.ts:184` — Invert background job logic: require explicit `RUN_JOBS=true` in all environments, not just production.
16. `packages/database/` — Consolidate all migration scripts into Prisma migration history.
17. `packages/auth/repro_vulnerability.js` — Move to `test/` or delete from source tree.
18. Root-level fix scripts — Audit which have been run, document effects, move survivors to `scripts/`, delete the rest.
19. Canonical doc consolidation — Pick one DB schema doc, one security doc. Archive or delete the rest.
20. Add `"expense_auto_approved"` to the `AuditAction` union in `audit.ts`.
21. Add Sentry (or equivalent) error telemetry. Silent failures violate the CONSTITUTION.

---

---

## Execution Log

### Phase 1 — CRITICAL: Authentication Breaches ✅ COMPLETE
- MFA `'123456'` bypass → real `otplib` TOTP (`mfa.service.ts`); login MFA migrated to otplib v13 functional API (`auth.service.ts`).
- Elevation token secret derived via HMAC domain-separation from `JWT_SECRET` (no new required env var).
- Cookie secret fallback removed → config-validated `env.COOKIE_SECRET` (`auth.ts`).
- Forgeable `'MOCK_VALID_ATTESTATION'` → fail-closed `MOBILE_ATTESTATION_ENABLED` gate.
- Vir caught & fixed: `.env.example` placeholder reachable in prod (added `CHANGE_ME_IN_PRODUCTION` to boot guard + `RESET_PASSWORD_SECRET` guard); login-MFA verify hardened.
- Evidence: 6/6 new MFA unit tests; typecheck clean.

### Phase 2 — CRITICAL: Policy Enforcement Facade ✅ COMPLETE
- Strategy (user-approved): enforce SoD / role / reviewer-lock in strict mode; 3-axis state checks stay shadow-logged.
- `PolicyEngine.assertTransition` split into hard guarantees (throw) + state-axis (shadow); default mode flipped `shadow → strict`.
- Mis-encoded `MARK_PAID` tests corrected against authoritative route RBAC (`requireSettingsAccess` = PRINCIPAL/ADMIN).
- Vir caught & fixed: PolicyEngine threw plain `Error` → would return **500** for authorization blocks; converted to typed `ForbiddenError`/`ConflictError`/`BadRequestError` (403/409/400).
- Evidence: 19/19 policy tests, 26/26 service unit tests; typecheck clean.

### Phase 3 — HIGH: Financial Data Integrity ✅ COMPLETE
- Outbox-outside-transaction → `createExpense` now writes the expense, outbox event, and audit logs in a single `prisma.$transaction` (SYSTEM_CONTRACT §11.2). Read-only policy/submitter lookups moved before the tx.
- ABAC dead code → wired `approval_scope` onto the request actor (`auth.ts`) and pass cost-center `allocations` (fetched only when a scope exists) into `PolicyEngine` on approve/reject. ABAC now enforces (`max_approval_limit` live immediately; cost-center live once allocations exist). Null scope ⇒ no restriction (unchanged behavior).
- Evidence: 34/34 service unit tests (6 new ABAC + 2 new atomicity-boundary tests); typecheck clean.
- Carry-forward (product features, not built): allocation-creation flow and approval-scope assignment do not exist; cost-center "no-allocations = unrestricted" semantic and `max_approval_limit` unit convention to be pinned when those features land.

### Phase 4 — HIGH: Security Perimeter ✅ COMPLETE
- CSRF no-op callback → `enforceCsrf` helper (`lib/csrf.ts`); the auth preHandler now halts with the library's 403 on failure (no wasted work, no double-send). NB: the original finding was overstated — the old code blocked messily rather than fully bypassing; fix still warranted.
- Rate-limit trusted spoofable `X-Forwarded-For` → `rateLimitKey` uses Fastify `req.ip`; raw XFF no longer read (verified no other XFF site). Proxy trust is now an explicit `TRUST_PROXY` env wired into Fastify `trustProxy` (default false = trust nothing).
- Evidence: 39/39 unit tests across 6 suites (new `csrf.test.ts`, `rate-limit.test.ts`); typecheck clean.
- Operational requirement: behind a load balancer, set `TRUST_PROXY=<hops>` or rate limiting buckets per-proxy-IP (safe but over-aggressive). Live CSRF/rate-limit needs integration coverage.

### Carry-forward: 3-axis state wiring (deferred from Phase 2)
The service does not maintain `workflow_state` / `financial_state` / `dispute_state`; `ExpenseStateMachine` over legacy `status` is the authoritative state guard. To later enforce the 3-axis transition rules in strict mode, these columns must be advanced atomically in every service mutation (incl. a defined `SUBMITTED → IN_REVIEW` trigger) and existing rows backfilled. Tracked as an architecture task.

### Residual (not yet verified — no test DB available)
Integration suites (`src/__tests__/*.integration.test.ts`) exercise strict policy against a live DB. They must be run in an environment with Postgres/Redis before release to confirm no legitimate flow regresses.

---

*Vir does not write features. Vir breaks them so they can be built correctly.*
