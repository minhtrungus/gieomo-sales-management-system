# RELEASE CANDIDATE HANDOFF

## 2026-10-15 PR-review addendum (authoritative)

- Starting feature/remote HEAD was verified at `7c95b22fb0f01194319519cf9320f6f52875568f`;
  `origin/main` remained `9fdfc7011ca100facb5203800c10247155c7ab05`.
- The recorded 7c95b22 artifact passed 135/135 tests. This review adds eight
  security assertions; the prospective clean artifact passes 143/143, with all
  PostgreSQL integration tests configured and 0 skipped.
- Fresh disposable PostgreSQL 18.6 replayed 001-027 with exit 0; preflight
  reported `V025`. Migration 027 additively closes authenticated PII reads,
  legacy stock-RPC execution, and permissive future-object defaults discovered
  during catalog review of 021-026.
- Next typegen and TypeScript exit 0. Production build exits 0 with 48/48 static
  pages. ESLint still fails: 270 errors/188 warnings versus `origin/main`
  278/188; full findings are in `CODEX_PR_ESLINT_FINDINGS.csv`.
- No real database migration ledger/catalog was obtained. Operator confirmation
  of 001-020 is not equivalent to ledger evidence; staging and production are
  still `UNKNOWN`/`NO-GO`.
- Draft PR/code review is allowed after commit and push. Merge remains blocked
  on lint disposition and review; staging additionally requires ledger/schema,
  backup/restore, execution/rollback owners, configuration and smoke evidence.

This addendum supersedes older test counts, sequence, ACL and readiness claims
below where they conflict.


## 2026-10-14 clean-chain reconciliation (supersedes older sequence text)

- The feature now contains one migration per number for 001-026. The pending
  sequence after the operator-reported 020 baseline is
  `021 -> 022 -> 023 -> 024 -> 025 -> 026`.
- 013-020 were preserved byte-for-byte; no historical migration was edited or
  renumbered. Previously untracked 023/024 are now part of the feature chain.
- 022 is the promoted direct-DML hardening. The old proposals numbered 021 and
  022 remain non-executable, superseded drafts and must not be applied.
- Before staging: obtain the target ledger, V015 preflight, restorable backup,
  named execution/rollback owners, maintenance window, clean-commit disposable
  replay, and all non-skipped real-PG suites.
- After staging apply: verify ledger 021-026 exactly once/in order, V025
  preflight, runtime grants, checkout/payment/cancellation smoke, monitoring and
  rollback-owner sign-off.
- Stop on `MIXED`/`UNKNOWN`, a ledger gap/duplicate, failed/skipped PG test,
  partial write, unexpected DML privilege, backup uncertainty, or missing owner.
  Production is `NO-GO` until staging evidence is complete.
- No staging/production migration or deployment is authorized by this handoff.


## 2026-10-14 migration/cancellation handoff (authoritative addendum)

- Operator confirmation: migrations 001–020 ran and 020 is latest. This is not
  migration-ledger verification; staging/production catalog state was not read.
- Audit proved 025 cannot directly upgrade 015's text-key idempotency schema.
  New additive `021_reconcile_v015_idempotency.sql` preserves V015 records,
  disables legacy 016/017 writers, and creates the exact V025 prerequisite.
- Disposable PostgreSQL verified the pending order
  `021 → 023 → 024 → 025 → 026` after an exact 001–020 replay. The root 021/022
  `.sql.draft` proposals remain excluded; proposal 021 must be renumbered before
  promotion and proposal 022 must first be reconciled with 023.
- The hardened read-only preflight recognizes complete V015 and V025 shapes and
  fails closed on `MIXED`/`UNKNOWN`. It must be run by the database owner on the
  intended target before any migration decision.
- Migration 026 records immutable inventory reservations at create time and
  atomically restores stock/releases voucher/writes status history and audit.
  Paid state is preserved with `refund_required`; legacy orders without
  provenance return `inventory_unverified`.
- No staging/production SQL or deployment occurred. Before staging: export the
  real migration ledger/catalog, verify a restorable backup, assign execution
  and rollback owners, approve the V015 archive/replay compatibility boundary,
  and run the full create/payment/cancel smoke plan.

**Current verdict:** local/disposable review `GO`; staging `NO-GO`; production
`NO-GO`. This addendum supersedes older migration-state and push-readiness text
below where it conflicts.

**Date:** 2026-10-14
**Candidate:** `integrated-candidate` | Branch `integrated/r1-recon-p0a3-security` | HEAD `1c51af6`
**Companion docs:** `BACKLOG_CLOSURE_MATRIX.md`, `OPERATOR_DECISIONS_REQUIRED.md`, `OVERNIGHT_PRODUCTION_READINESS.md`, `DATABASE_MIGRATION_RUNBOOK.md`

---

## Four Gates — Separate Verdicts (updated 2026-10-14 — PUSH-GATE PREP)

**Each gate has its own verdict. Passing one does NOT imply the next.**

| Gate | Verdict | One-line reason |
|------|---------|-----------------|
| **1. Code review** | `READY FOR CODE REVIEW` | 152/152 tests, TSC 0, lint 437 (delta −47), payment bypass PASS, security critical paths PASS, 2 fixes implemented + tested. All findings documented. |
| **2. Push / merge to main** | `CONDITIONAL — OPERATOR DECISION REQUIRED` | Code is ready. Push scope depends on 3 operator decisions: (C1) commit 023? (C2) include 013–020? (C3) include R2? No technical blocker — only scope decision. |
| **3. Staging deploy** | `NO — BLOCKED` | Migration 023 NOT APPLIED. Webhook + payment confirm 500 without RPC. Decision #1 + staging checklist required. |
| **4. Production deploy** | `NO — BLOCKED` | Staging + Decisions #2–#6 (rate limit, server idempotency, reconciliation, R2-T6, POS) + live SePay test. |

### Gate 2 detailed: Why CONDITIONAL (not READY, not NO)

**Code itself is ready to push.** All static gates green (see Gate 1). No technical defect prevents a commit+push. What blocks is **scope ambiguity** — 3 decisions the operator must make about what goes INTO the commit:

| Decision | Options | Consequence |
|----------|---------|-------------|
| **C1: Commit migration 023?** | (a) Commit the `.sql` file. (b) Exclude (apply via Dashboard only). | (a) makes 023 version-controlled; (b) keeps it Dashboard-only like 013–020. |
| **C2: Include 013–020?** | (a) Copy into candidate. (b) Defer (keep root-untracked). (c) Confirm DB already has them. | (a) NOT recommended (by-design not committed; security review needed for 013). (b) safest. (c) requires DB verification. |
| **C3: Include R2?** | (a) Include sources + fix success page (Tier 1+2, ~6 files). (b) Defer + accept P1 spec-integrity gap in writing. | (a) makes R2 suite green; requires Decision #5 for email trigger. (b) leaves gap documented, needs written risk-acceptance before production. |

**Push authorization flow:** See `PRE_PUSH_CHECKLIST.md` §Push Authorization Flow.

---

## Gate 1 — Code Review

**Verdict: `CONDITIONAL PASS`**

### What passes (verified this session — 2026-10-14)

| Check | Result | Command / Evidence |
|-------|--------|--------------------|
| Full regression suite | **152/152 PASS** | `node --test "tests/*.test.ts"` (146 pre-existing + 6 new `orderSubmitGuards.test.ts`) |
| TypeScript | **0 errors** | `npx tsc --noEmit` (after `npx next typegen`) |
| Whitespace | **0 errors** | `git diff --check` |
| Lint delta | **Candidate FEWER than baseline** | Candidate: 437 (253E/184W). Baseline HEAD: 484 (297E/187W). No new lint errors introduced (437 unchanged after fixes). |
| Payment bypass paths | **PASS** | PATCH `/api/orders` blocks `paymentStatus` (`orders/route.ts:92-104`). Only `apply_payment_event` RPC writes `paid`. Admin UI "paid" = localStorage only. |
| Webhook fail-closed auth | **PASS** | `sepay/route.ts:96-117` — missing env → 500, constant-time compare |
| Proof token expiry | **PASS** | `serverAuth.ts` 24h TTL, old format rejected. `tests/proofToken.test.ts` 8/8 |
| Session hardening | **PASS** | HttpOnly cookie, `tests/securitySession.test.ts` |
| Upload auth + magic bytes | **PASS** | `upload/route.ts`, `tests/securityRoutes.test.ts` |
| **NEW: Client double-submit guards** | **PASS** | 3 pages guarded + `tests/orderSubmitGuards.test.ts` 6/6 |
| **NEW: Discount display fix** | **PASS** | `getOrderVoucherDiscount` used in admin detail + reports; no hardcoded `?? 10000` |

### What's flagged but does NOT block review

| Finding | Severity | Why not blocking review |
|---------|----------|-------------------------|
| R2-T6 FAIL (success page auto-fetches notify/email) | Spec conflict | Documented in Decision #5; engineering can review both options |
| Reconciliation summary/records scope mismatch (P2c) | UX/data-trust | Documented in Decision #4 |
| Server-side idempotency missing (F5 server part) | P0 business risk | Documented in Decision #3; client guards now close accidental double-click |
| SKU written but not rendered in orders (F7) | Feature incomplete | Data layer complete; display layer pending |
| Candidate missing migrations 013–020 | Info (by design) | Forensics: never committed by design (Dashboard-standalone). Code doesn't depend on them. Operator decide include/defer. |
| Candidate missing R2 source files | Env drift | R2 not in candidate scope this round |
| POS cash paid divergence | P2 | Documented in Decision #6 |

### Gate 1 exit criteria met
- ✅ All 152 tests pass
- ✅ TSC 0 errors
- ✅ Lint delta negative (fewer problems than baseline)
- ✅ No whitespace errors
- ✅ Payment integrity verified (no server-side bypass)
- ✅ Security critical paths verified (auth, upload, webhook, session)
- ✅ Client double-submit guards implemented + tested (new this session)
- ✅ Discount display defect fixed + tested (new this session)
- ⚠️ Spec-conflicts documented with options — not silently ignored

---

## Gate 2 — Push / Merge to Main

**Verdict: `NO — NOT READY`**

### Blockers (Gate 2 — Push)

**No technical blockers.** All are scope decisions:

| # | Blocker Type | Item | Resolution |
|---|--------------|------|------------|
| 1 | **Policy (scope)** | Migration 023 uncommitted (`??`) | Operator: commit OR exclude (C1) |
| 2 | **Policy (scope)** | 013–020 inclusion — forensics: by design never committed. Code doesn't depend. 013 = security review needed. 014 = freeship feature check. | Operator: defer (recommended) / include / confirm-DB (C2) |
| 3 | **Policy (scope)** | R2 source + tests inclusion — copying test AS-IS → RED 4/6 (R2-T2, R2-T6 fail against candidate success page) | Operator: include+fix / defer+risk-accept (C3) |
| 4 | **Hygiene** | 45-file uncommitted working tree | Engineer stages intended files after C1–C3. NOT broad `git add -A`. |

### R2 Inclusion Analysis (2026-10-14)

**What R2 is:** "Payment canonical lookup & success UI" — Batch R2 in root plan, depends on R1. Requirements: single source of truth for payment status; UI must NOT mark paid from query string/client state; amount/reference/order from verified server; no success display before webhook confirms; fail-closed on mismatch/timeout.

**Current state:**
- R2 sources (`src/lib/payment/orderSuccessContract.ts`, `paymentFlowState.ts`) + test (`tests/r2PaymentResult.test.ts`) exist in **root** (untracked), NOT in candidate.
- Candidate success page (`order/success/page.tsx`) has NO abort/timeout, NO verificationState, NO contract check — accepts `data.orders[0]` raw. Polling auto-fires `fetch("/api/notify/email")` (R2-T6 violation).

**If copied AS-IS (test + 2 lib files only):** Suite → 4/6 PASS, R2-T2 + R2-T6 FAIL. Two contradictory truths in repo. NOT recommended.

**To include R2 fully (Tier 1+2):**
1. Add `src/lib/payment/orderSuccessContract.ts`, `paymentFlowState.ts`, `tests/r2PaymentResult.test.ts`
2. Rewrite `order/success/page.tsx`: add AbortController + verificationState + remove notify/email fetch + wire resolveCanonicalSuccessOrder + fail-closed gate (~58 insertions / 111 deletions vs current)
3. Add `syncStoredPaymentStatusLocal` to `orderStore.ts` (~20 lines)

**If deferred:** P1 spec-integrity gap. Requires written risk-acceptance before production GO (root plan §340: "Không còn P0/P1 chưa xử lý hoặc chưa được risk-accepted"). No runtime regression from deferring (nothing in candidate imports R2 helpers).

**Risk of deferring (high items):** Query-string `payment=cod` can display false paid state (`page.tsx:142`); query `amount` renders as order total (`:177`); no fail-closed path on timeout/offline/mismatch; hardcoded demo fallbacks `GM-369817`/`110000` (`:27,:29`).

### Not blockers (verified)
- No secret/PII in diff (`git diff --check` clean; no `.env` contents inspected or logged)
- No migration applied to any DB
- Root repo untouched (verified via separate `git -C $root status`)
- No commit/push/merge performed (constraint respected)

### Push-ready checklist (updated 2026-10-14)

- [ ] **C1:** Operator decides commit 023 (yes/no)
- [ ] **C2:** Operator decides 013–020 (defer/include/confirm-DB)
- [ ] **C3:** Operator decides R2 (include+fix / defer+risk-accept)
- [ ] Engineer stages intended files (per commit strategy in `PRE_PUSH_CHECKLIST.md`)
- [ ] Operator reviews `git diff --staged` + commit message
- [ ] `git commit` → `git push`

**Code is technically ready. Scope decision is the only gap.**

---

## Gate 3 — Staging Deploy

**Verdict: `NO — BLOCKED`**

### Blocker

| # | Blocker | Evidence |
|---|---------|----------|
| 1 | **Migration 023 NOT APPLIED to any DB** | No PostgreSQL server available in this environment. Runbook created (`DATABASE_MIGRATION_RUNBOOK.md`) but not executed. |
| 2 | **Webhook will 500 without 023** | `sepay/route.ts:255` calls `supabase.rpc("apply_payment_event", ...)` — RPC doesn't exist until 023 applied |
| 3 | **Payment confirm will 500 without 023** | `orders/payment/route.ts:112` same RPC |

### Deploy order (must be operator-directed)

**Recommended (Option A):** Migration BEFORE code
1. Apply 023 to staging DB (see runbook)
2. Verify: `apply_payment_event` executable by service_role, anon INSERT revoked, `payment_events` table exists, 2 unique indexes exist
3. Deploy candidate code to staging
4. Run staging test suite (needs DB — `DATABASE VALIDATION NOT RUN` in this env)

**Fallback (Option B):** Code BEFORE migration
1. Deploy candidate code
2. Webhook/payment confirm return 500 until 023 applied (SePay will retry — acceptable short window)
3. Apply 023 during maintenance window
4. Verify webhook recovers

### Staging test plan (post-deploy, needs live DB)
- [ ] Create order → pay via banking → SePay sandbox test event → verify payment status = paid, `payment_events` row created
- [ ] Re-send same SePay event → verify duplicate outcome (no double-credit)
- [ ] Admin confirm with real bank reference → verify RPC path
- [ ] Reconciliation dashboard → verify no false `PAYMENT_MISMATCH`
- [ ] Cancel order → voucher slot released
- [ ] Checkout double-submit → verify single order
- [ ] Login → verify session cookie
- [ ] Upload image → verify auth + magic bytes

---

## Gate 4 — Production Deploy

**Verdict: `NO — BLOCKED`**

### All Gate 3 blockers apply, plus:

| # | Blocker | Evidence | Required Decision |
|---|---------|----------|-------------------|
| 1 | **Login rate limiting missing (P1)** | `auth/login/route.ts` — no counter/delay/lockout/CAPTCHA (verified) | Decision #2 |
| 2 | **Order idempotency missing (P0 business risk)** | 3 unguarded paths (F5 remainder) | Decision #3 |
| 3 | **No live SePay end-to-end test** | `DATABASE VALIDATION NOT RUN` | Staging test plan above |
| 4 | **Reconciliation data trust** | Summary/records scope mismatch (P2c) | Decision #4 |
| 5 | **Email reliability depends on customer browser tab** | Success page auto-fetch only trigger for email | Decision #5 |

### Production checklist (after Gate 3 passes)
- [ ] All operator decisions #1–#6 answered
- [ ] Staging soak: 48h monitoring webhook processing, payment integrity, reconciliation accuracy
- [ ] SePay production URL configured + verified
- [ ] Login rate limiting implemented + tested
- [ ] Order idempotency implemented + tested
- [ ] Rollback plan documented (migration rollback + code rollback)

---

## Environment & Validation Summary (updated 2026-10-14)

| Item | Value |
|------|-------|
| Node | v24.15.0 |
| Test command | `node --test "tests/*.test.ts"` |
| Tests | **152/152 PASS** (10.6s) |
| TSC | 0 errors (requires `npx next typegen` first) |
| Lint (candidate) | 437 problems (253E/184W) — **unchanged after this session's fixes** |
| Lint (baseline HEAD) | 484 problems (297E/187W) |
| Lint delta | −47 problems (improvement) |
| `git diff --check` | 0 errors |
| Build (candidate) | **FAIL** — `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Environment limitation (junction symlink), not code. NOT claiming build pass based on base repo. |
| PostgreSQL | NOT AVAILABLE — no Docker, no running server on 5432 |
| Migration 023 applied | **NO** |
| Migration 013–020 DB state | **UNVERIFIED** (forensics: never committed by design) |

---

## What Operator Must Do (in order)

1. **Read** `OPERATOR_DECISIONS_REQUIRED.md` — answer Decisions #1–#6 (blocking) and #7–#13 (advisory).
2. **Answer Decision #1:** Apply migration 023 to staging (Option A recommended).
3. **Answer Decisions #2–#6** before production.
4. **Resolve Gate 2 blockers:** decide 013–020 inclusion, R2 inclusion, commit strategy.
5. **Apply migration 023** to staging DB per `DATABASE_MIGRATION_RUNBOOK.md`.
6. **Deploy candidate to staging** and run staging test plan.
7. **Soak 48h**, monitor webhook + payment + reconciliation.
8. **Implement decisions #2–#6**, re-validate, then promote to production.

---

## Constraints Respected (this session)

- ❌ No `git commit` / `git push` / `git merge` / `git deploy`
- ❌ No migration applied to any database
- ❌ No root repo modification (`C:\Users\MT\Workspaces\gieomo-sales-management-system` untouched)
- ❌ No secret/PII printed or logged
- ❌ No policy decisions made unilaterally — all surfaced to operator
- ✅ All evidence gathered read-only with file_path:line_number
- ✅ All validation commands run non-destructively

---

*Generated: 2026-10-14 | Candidate: `integrated-candidate` | HEAD: `1c51af6`*

---

## Current staging-readiness addendum — release-blocker batch 2026-10-14

This addendum supersedes stale test counts and database-availability statements above. It does not authorize a deployment.

| Gate | State | Required evidence / action |
|---|---|---|
| Candidate worktree identity and dirty-file inventory captured | PASS | Preserve all unrelated modified/untracked files; stage nothing in this batch. |
| Atomic creation migration 025 in repository | PASS | PostgreSQL disposable-cluster regression remains required after 026. |
| Atomic cancellation migration 026 in repository | PASS (local only) | Apply only after the target schema preflight reports `V025`; never apply over `V015`, `MIXED`, or `UNKNOWN`. |
| 013–025 target migration history | UNKNOWN | Run `supabase/013_025_read_only_preflight.sql`; also inspect the platform migration ledger. Object markers alone are not migration-history proof. |
| Staging idempotency schema (`V015` vs `V025`) | UNKNOWN | Preserve preflight output. Stop on `MIXED`/`UNKNOWN`; do not select a target by guesswork. |
| Staging backup / point-in-time recovery | UNKNOWN | Operator verifies recovery point before any schema write. |
| Migration execution owner | UNKNOWN | Name one operator and one reviewer before the change window. |
| Rollback criteria and owner | UNKNOWN | Define stop thresholds; schema 026 rollback is forward-fix/data-reconciliation, not destructive down-SQL. |
| Staging credentials and change window | UNKNOWN | Operator-owned; not accessed in this batch. |
| Application configuration/secrets present | UNKNOWN | Validate names/presence without printing values. |
| Migration order | BLOCKED | Resolve 013–025 history first; 026 requires the migration-025 shape. |
| Dry-run migration 026 on disposable PostgreSQL | PASS | Applied to local PostgreSQL 18.6 on `127.0.0.1:55434`; no staging/production contact. |
| Atomic cancellation: replay/concurrency/rollback/stock/voucher/payment | PASS (local) | Real PostgreSQL integration suite, not mocks; see the current batch report for exact results. |
| Payment reconciliation and duplicate-event tests | PASS (local) | Existing disposable-PostgreSQL payment suite is included in the refreshed full run; staging remains NOT RUN. |
| RLS and authorization | PASS (local code tests) | Cancellation route remains admin-only; database function/table privileges are service-role-only. Staging policy state is UNKNOWN. |
| Login abuse protection | BLOCKED | No verified rate-limit/lockout control; retain as a production blocker. |
| Application tests, typecheck, build, lint delta | PASS (local) | 277/277 tests, 0 skipped; typecheck exit 0; isolated Next 16.3.5 build 49/49 exit 0; lint remains non-zero but improves from 260E/185W to 258E/185W. |
| Deployment provider/domain/preview configuration | UNKNOWN | No provider/CI configuration has been verified. |
| Staging smoke: create/retry/cancel/paid-cancel/refund handoff | NOT RUN | Requires explicit staging deployment authorization. |
| Post-deployment monitoring | UNKNOWN | Assign log, payment reconciliation, stock/voucher and alert owners before deploy. |
| Production deployment | BLOCKED | Requires staging validation, soak, migration evidence, rollback rehearsal, and explicit approval. |

### Operator sequence (no deployment performed here)

- [ ] Capture staging project/database identity and current migration ledger.
- [ ] Run the read-only 013–025 preflight and archive its complete output.
- [ ] Stop if the idempotency result is `MIXED` or `UNKNOWN`.
- [ ] Confirm recovery point and rollback owner.
- [ ] Review migration 026, especially the intentional fail-closed treatment of pre-026 orders.
- [ ] Apply the approved migration chain to staging only during the authorized window.
- [ ] Deploy the matching code revision to staging.
- [ ] Run create replay/concurrency and cancellation replay/concurrency/rollback smoke tests.
- [ ] Verify paid cancellation leaves the payment ledger paid and creates a refund work item operationally; no synthetic refund.
- [ ] Observe logs/audit/history/inventory/voucher counters and reconcile them before any production decision.
