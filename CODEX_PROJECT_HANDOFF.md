# Gieo Mơ — Codex Project Handoff & Execution Guide

> **Purpose:** Single source of operational context for Codex to continue work on the Gieo Mơ sales-management repository without colliding with OpenCode, losing existing work, or deploying unreviewed changes.
>
> **Current posture:** Read-only handoff first. No implementation, migration, data repair, commit, push, or deploy until the user explicitly approves a specific next step.

---

## 1. Project and workspace

- Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
- Remote documented in the repository: `https://github.com/minhtrungus/gieomo-sales-management-system.git`
- Deployment path documented in project docs: GitHub `main` → Vercel.
- Stack reported by prior audits: Next.js 16, React 19, Tailwind CSS v4, Zod, Supabase/PostgreSQL, Zustand.
- Product: Gieo Mơ — fundraising shop / order management.
- Primary operational concern: payment integrity, order lifecycle correctness, inventory integrity, reconciliation, and a safe Production release.

### Last known Git baseline (must re-check before acting)

- Branch: `main`
- HEAD: `1c51af625a575a41733d59b29cc9be9ae0892c60` (`1c51af6`, `feat(orders): release voucher slot on cancel`)
- Last reported working tree: **77 entries** (29 modified, 48 untracked); staged files: **0**.
- These are historical reported values, not guaranteed current state. Re-run read-only Git status at the start of every session.
- Many changes are uncommitted/untracked and come from multiple earlier batches. A dirty file's full diff against HEAD is cumulative; do not attribute the whole diff to the most recent batch.
- Do not assume HEAD or the working tree is the Production deployment.

---

## 2. Non-negotiable safety rules

1. **Preserve the working tree.** Never use `git reset`, `git clean`, `git checkout --`, `git restore`, blanket revert, stash, or other destructive cleanup. Do not overwrite existing user changes.
2. **One batch at a time.** Inspect, report, and stop for user approval before the next batch.
3. **No release actions without explicit approval.** No staging, commit, push, merge, deploy, Vercel action, or Production change unless the user specifically authorizes it.
4. **Database safety.** Do not run SQL or connect to Production/database by default. Operator runs approved read-only queries manually. Never apply migrations unless explicitly authorized in a separate, unambiguous instruction.
5. **No automatic data repair.** Historical payment records are audit/reconciliation-only. Never backfill, synthesize, or modify payment records without a separately approved recovery plan grounded in bank/SePay evidence.
6. **Secrets.** Never read or print `.env`, secret values, access tokens, Supabase service-role keys, SePay keys, or credentials. It is acceptable to check whether an environment-variable *name* exists, without displaying its value, if the user explicitly asks.
7. **Evidence discipline.** Do not claim tests ran unless actual command output/exit code is available. Distinguish source review, unit tests, PostgreSQL integration tests, and Production verification.
8. **Skipped tests are not passes.** PostgreSQL integration tests have historically been skipped when `pg` and/or `ATOMIC_PG_URL` is missing. Never claim concurrency, atomicity, unique-index runtime behavior, or Production behavior was verified by skipped tests.
9. **No scope creep.** Do not bundle unrelated inventory, combo, admin, or UI changes into a payment hotfix merely because they are in the working tree.
10. **Do not assume OpenCode is finished or inactive.** OpenCode may have the same repository open. Before editing, tell the user to stop concurrent edits and re-check Git status. Never run Codex and OpenCode implementation tasks simultaneously in this repository.
11. **PowerShell compatibility.** User works on Windows PowerShell. Prefer separate commands; avoid relying on `&&`, `||`, `grep`, `head`, `tail`, or Unix-only shell behavior.
12. **No broad “fix everything” tasks.** Each task must have explicit scope, allowed files, exclusions, test gates, and a stop condition.

### Required start-of-session procedure

- Confirm the exact workspace path.
- Run read-only `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, and `git diff --cached --stat`.
- Record modified/untracked files and staged count.
- Do not edit until the user approves an implementation task.
- If the baseline differs from this document, report the difference and treat the live repository as authoritative; do not “restore” it to this document's historical baseline.

---

## 3. Incident summary: payment records missing

### Root cause supported by source review

Prior read-only incident investigation reported that the code at historical HEAD `1c51af6` in both:
- `src/app/api/orders/payment/route.ts`
- `src/app/api/webhook/sepay/route.ts`

updated an order's payment status before attempting to insert a row into `payments`, using columns `status` and `confirmed_at` that do not exist in the schema from migration 001. The insert error was not checked. This can leave orders marked paid while `payments` has no corresponding record.

This is a source-based root-cause finding for that historical code, **not proof of which commit is running on Production**.

### Payment PATCH bypass closure — Batch 1 report

Reported implementation:
- `src/app/api/orders/route.ts`: after authorization and body parsing, reject HTTP 400 if the raw JSON object has own property `paymentStatus` or `payment_status`, including `null`, empty string, or mixed requests. This rejection occurs before any database write.
- `src/lib/data/orderStore.ts`: removed `updateStoredPaymentStatus`, the fire-and-forget PATCH helper.
- `src/app/admin/orders/[id]/page.tsx`: removed the remaining caller; payment confirmation remains server-first.
- `src/app/sale/orders/page.tsx`: removed a dead import.
- `tests/cancelVoucherRelease.test.ts`: updated the old M9 expectation to assert 400 and no state change.
- New `tests/patchPaymentBypassClosed.test.ts`: 9 tests reported passing.

Reported verification:
- Focused tests: 75/75 pass.
- Full suite: 399 tests, 365 pass, 0 fail, 34 skipped.
- `npm run type-check`: pass.
- `npm run build`: pass.
- `git diff --check`: pass.
- `npm run lint`: exit 1 with 748 repo-wide problems reported as pre-existing; the new test file was lint-clean.
- 34 PostgreSQL integration tests skipped; no PostgreSQL concurrency/unique-index runtime claim.
- Reported Git baseline after Batch 1: HEAD unchanged, staged 0, 77 entries (29 M + 48 ??).

These are prior tool-run reports, not commands run by the current Codex session. Re-check source and current test output before relying on them.

### Critical deployment warning

Do **not** deploy the server-side PATCH closure on its own while old UI bundles may still call the old payment-status PATCH. Old UI may receive 400 and display stale/local paid state. Payment server and dependent UI should be reviewed and deployed together as an approved release scope.

### Payment branches needing explicit audit

Prior investigation flagged:
- SePay test ping: no payment record is expected.
- Transfer memo without a recognizable order code: may return success without recording a payment; business/monitoring gap.
- Order not found: no payment record; should be observable.
- Already-paid idempotent early return: no new row; expected only if the existing record is correct.
- Underpayment: prior report says HTTP 200 with `success:false` and internal note, no payment row; reconciliation may not represent this as a distinct underpayment state.
- Admin reject: no payment record is expected.
- Payment insert error: should return retryable 500 in the working-tree fix.
Do not silently redesign these branches inside an unrelated batch. Audit and propose a scoped follow-up if still applicable.

---

## 4. Migration status — unverified until operator supplies evidence

Prior audit classified the following migration files as present in the working tree but untracked (`??`) and **not Production-verified**. Do not treat file existence as proof that a migration was applied.

| Migration | Purpose | Release relevance |
|---|---|---|
| 001 | Base schema, including `payments` | Foundational schema; actual Production state should be confirmed |
| 012 | Atomic variant stock deduction RPC | Dependency for legacy order stock path |
| 015 | `order_idempotency` table and `orders.idempotency_key` | Needed for keyed checkout flow |
| 016 | `create_order_atomic` and `pricing_preview` RPCs | Needed when keyed checkout uses atomic writer mode |
| 017 | `cancel_order_atomic` RPC and cancellation recovery flags | Needed for the current cancellation path; absence should fail closed rather than silently cancel |
| 018 | Partial unique index on `(order_id, transaction_code)` where transaction code is not null | Final database-level duplicate-payment guard |
| 019 | Inventory adjustment ledger and RPC | Inventory scope only; not required for payment-only hotfix |
| 020 | Inventory ledger snapshots and `ON DELETE SET NULL` policy | Inventory/product-delete scope only; not required for payment-only hotfix |

Historical notes said the user applied 019 and 020; a later audit did not have direct Production verification. Treat all migration states as **unknown** until the operator provides current evidence.

Never run migrations automatically. For the payment release, check the actual dependency graph from current source before deciding which migrations are release prerequisites.

---

## 5. Release scope classification from the prior audit

This is a starting hypothesis for review, not authorization to release.

### A — Payment incident core

- `src/lib/services/paymentRecordService.ts`
- `src/app/api/orders/payment/route.ts`
- `src/app/api/webhook/sepay/route.ts`
- `src/app/api/orders/route.ts` — includes Batch 1 PATCH closure
- `src/lib/data/orderStore.ts`
- `src/app/admin/orders/[id]/page.tsx`
- `src/app/sale/orders/page.tsx`
- `supabase/migrations/018_payments_unique_transaction.sql`
- Relevant tests including:
  - `tests/patchPaymentBypassClosed.test.ts`
  - `tests/cancelVoucherRelease.test.ts`
  - `tests/paymentRecordService.test.ts`
  - `tests/resurrectionGuard.test.ts`

### B — Dependencies or compatible client paths that may need to travel together

Review exact imports and call paths before inclusion:
- `src/lib/services/orderService.ts`
- `src/lib/services/idempotencyService.ts`
- `src/lib/services/orderRequestHash.ts`
- `src/lib/services/reconciliationService.ts`
- `tests/reconciliationPayments.test.ts`
- `src/lib/data/paymentConfirm.ts`
- Admin order creation/POS/sale creation clients and their tests:
  - `src/app/admin/orders/create/page.tsx`
  - `src/app/admin/orders/pos/page.tsx`
  - `src/app/sale/create-order/page.tsx`
  - `src/app/order/success/page.tsx`
  - `tests/paymentConfirmServerFirst.test.ts`
  - `tests/paymentBypassFollowup.test.ts`
  - `tests/orderIdentityServerFirst.test.ts`
- Migration 017 for the current cancel path.
- Migrations 015/016 if keyed checkout/atomic writer is in the chosen release.

Do not include every B file automatically. Trace actual imports, runtime paths, and whether the deployed app would break if a file were omitted.

### C — Keep out unless separately approved

Prior audit identified unrelated or separable work around:
- inventory APIs/UI and migrations 019/020;
- combo APIs/UI;
- product deletion and stock adjustments;
- members, pickup points, categories, and unrelated admin pages;
- reconciliation UI pagination/request-sequence guard, unless specifically needed for the release;
- checkout UI idempotency changes if not needed for the chosen path;
- unrelated mock data, tests, and admin UI cleanup.

The repository contains cumulative diffs. Never create a release by blindly staging every dirty file.

### Release packaging principle

Prefer a small, auditable release with clearly reviewed file scope. The previous audit suggested separating:
1. payment server pipeline + PATCH closure;
2. idempotency/cancel RPC dependency chain and its migration prerequisites;
3. compatible client UI paths from Batch 3A/3A.2.

However, do not make multiple commits or deploy any subset until the user approves the exact scope. A multi-commit plan must preserve compatibility at every intermediate deploy; otherwise deploy a reviewed compatible set atomically as one release.

---

## 6. Roadmap: Batch 3, 4, 5

The following is the previously agreed roadmap. It is **not permission to start all batches**. Finish and review one batch at a time.

### Batch 3 — Payment UX, INP & Reconciliation Performance

#### 3A — Payment confirmation server-first (reported implemented; verify before release)
- Confirmation should be server-first through `/api/orders/payment`.
- Local UI state must only sync after server success or an explicitly handled idempotent result.
- Avoid fire-and-forget payment-status PATCHes.
- Audit create-order/POS/sale callers and server-generated order identity.
- Verify retry/idempotency behavior and cash/COD handling.

#### 3B — Reconciliation catalog correction (reported implemented; verify before release)
- `products` does not have a canonical stock column in the reported base schema; canonical stock is `product_variants.stock`.
- Product-only rows must not be assigned a fabricated current stock.
- A `variant_id` set to null after deletion should be distinguished from an active catalog variant, using stored snapshots where available.
- Catalog query failures must not silently turn into an empty catalog and false classifications.

#### 3C — Reconciliation pagination/performance (reported implemented; R1 remains open)
- Prior implementation reported a lightweight Phase A scan, page-detail Phase B, payments chunks, stable sorting, server-side `limit`/`offset`, and pagination UI.
- Phase A may still scan all matching orders; payment and catalog result sets may be silently capped by PostgREST maximum rows.
- **R1 remains open** until operator verifies PostgREST max-row configuration, relevant row counts, API totals, and spot-checks. Do not assume page slicing prevents backend row caps.
- Batch 3C.1 request-sequence guard reported implemented to prevent stale responses from overwriting newer filters/results. Its tests used a deferred-fetch pipeline/guard helper rather than a full React component render; retain this limitation in review notes.

#### 3D — POS double-submit protection (planned, not reported implemented)
- Audit POS submit/payment actions for duplicate orders or payments on repeated clicks, retries, or slow network.
- Add synchronous in-flight guards and stable idempotency where applicable.
- Server/database idempotency remains the source of truth; UI disabling alone is insufficient.
- Include tests for double-click, timeout/retry, duplicate server response, and recovery after failure.
- Do not start until payment incident release is stable and the user explicitly approves this batch.

#### 3E — Reconciliation cleanup/monitoring (planned; scope to be confirmed)
- Audit global vs filtered KPIs, inventory ledger visibility, search behavior, and dead status branches.
- Add clear observability for query failures, payment mismatches, unmatched transfers, and underpayment.
- Do not conceal errors as empty results.
- Keep Production row-cap hardening separate if it requires a larger pagination/RPC design.

### Batch 4 — Admin, Sale & Authorization Hardening (planned)

Start with a read-only audit, then split into small approved implementation batches. Potential topics from prior planning:
- role/authorization checks for admin and sale endpoints;
- ensure client-side role checks are not treated as server authorization;
- payment, order-state, delivery-state, and cancellation transitions;
- audit logs and actor attribution;
- destructive actions, duplicate submission, and error handling;
- input validation and consistent API response contracts;
- prevent stale localStorage/client state from overriding server truth.

Do not assume every listed topic is a confirmed defect. Re-audit current source, rank findings by severity, and propose a scope before changing code. No broad refactor.

### Batch 5 — Production Readiness (planned)

Read-only audit first; then separately approved work:
- Production deployment SHA and release artifact verification;
- migration inventory and schema drift checks;
- environment-variable presence checks without exposing values;
- backup/restore procedure and tested recovery evidence;
- logging, alerting, payment mismatch and webhook monitoring;
- read-only reconciliation and historical incident review;
- smoke tests, rollback/forward-fix runbook;
- release gates and post-deploy monitoring.

Do not claim backups are recoverable until a restore test is documented. Do not run backup, restore, migration, or Production operations without explicit approval.

---

## 7. Current release gates

Before any payment hotfix release, the user/operator should provide or approve evidence for:

1. **Vercel deployment SHA and timestamp.** Production commit remains unknown until checked in Vercel.
2. **Migration verification.** Confirm the required functions/indexes/tables on Production using operator-run read-only queries.
3. **Historical incident counts.** Count paid orders, payment rows, and paid orders lacking payment rows; do not repair automatically.
4. **Bank/SePay reconciliation.** Export actual transactions and match order codes, amounts, and timestamps before any data recovery decision.
5. **Payment path tests.** Admin confirm, repeated confirm, cancelled order, POS cash/COD, SePay ping, matched webhook, unmatched transfer, underpayment, and insert failure/retry.
6. **PATCH closure.** Both `paymentStatus` and `payment_status`, including null/empty/mixed payloads, must be rejected before writes; normal order/delivery/internal-note PATCHes must still work.
7. **Integration-test decision.** Prefer PostgreSQL integration tests on a separate approved test database. If unavailable, document the unverified concurrency risks and obtain explicit risk acceptance.
8. **Lint policy.** Prior report: `npm run lint` exits 1 with 748 repo-wide issues described as pre-existing. Do not silently claim lint is green; isolate new-file lint and state the repo-wide limitation.
9. **Compatible client/server deployment.** Avoid a window where old clients call a newly blocked endpoint.
10. **Forward-fix plan.** Rollback to historical code may reintroduce the original payment-record incident. Prefer a reviewed forward-fix unless a more severe failure requires rollback.
11. **Post-deploy monitoring.** Monitor insert errors, paid orders missing records, duplicate transaction-code conflicts, unmatched SePay transfers, and reconciliation mismatch statuses.

---

## 8. How Codex should work with the user

For each task:
1. State the exact batch and intended outcome.
2. Read current Git status and inspect relevant source.
3. Present findings and a minimal plan.
4. Wait for approval before editing.
5. Make only the approved changes.
6. Run focused tests first, then relevant regression/full suite, type-check/build/lint as applicable.
7. Report actual commands, exit codes, skipped tests, and limitations.
8. Review `git diff --check` and the exact changed-file list.
9. Re-check HEAD, staged count, modified/untracked status, and ensure pre-existing changes remain.
10. Stop. Do not automatically continue to the next batch.

When reporting, use these labels:
- **Source-verified:** directly observed in current code.
- **Test-verified:** test command actually ran and passed.
- **DB-test-verified:** integration test actually ran against an approved test database.
- **Production-verified:** confirmed through Production evidence supplied by the operator.
- **Unknown / unverified:** no sufficient evidence.

Do not use “fixed” to mean “deployed.” Say “implemented in working tree” until release evidence exists.

---

## 9. First prompt to run in Codex

Paste the following as the first task after opening the repository. This deliberately does **not** ask Codex to implement the roadmap yet.

```text
Read `CODEX_PROJECT_HANDOFF.md` completely and follow its safety rules.

TASK: READ-ONLY HANDOFF AUDIT — NO IMPLEMENTATION.

1. Confirm the workspace is the Gieo Mơ repository.
2. Record current branch, HEAD SHA, staged count, modified files and untracked files.
3. Compare the current state with the historical baseline in the handoff document. The live repository is authoritative; do not alter it to match the document.
4. Inspect the current source and tests for:
   - PATCH payment-status closure;
   - payment confirmation and `recordPaymentOnce`;
   - SePay webhook insertion/error behavior;
   - order creation/idempotency dependencies;
   - reconciliation query and PostgREST row-cap risk.
5. Produce a source-backed release dependency map for the smallest safe payment release. Distinguish required files from cumulative unrelated diffs.
6. List the exact Production evidence still missing and the read-only operator checks required.
7. Confirm which tests can be run locally without touching a database. Do not run PostgreSQL integration tests unless the user has explicitly configured and approved a separate test database.
8. Do not read secrets or `.env` values. Do not run SQL, call Production APIs, edit files, stage, commit, push, deploy, stash, reset, clean or revert.
9. Report findings with file paths and line numbers, label each finding Source-verified / Test-verified / DB-test-verified / Production-verified / Unknown, and end with a proposed next step.
10. STOP and wait for the user's approval. Do not start Batch 3D, Batch 4, Batch 5, or any implementation.
```

---

## 10. Model selection guidance

The user’s model picker showed:
- Default
- GPT-6.1 Sol
- GPT-6 Astra
- GPT-6 Sol
- GPT-6 Luna
- GPT-5.6 Sol
- GPT-5.6 Terra
- GPT-5.6 Luna
- GPT-5.5

Practical starting recommendation for this repository:
- **GPT-6.1 Sol** for normal implementation, multi-file coding, tests, and iterative work: balance of capability and efficiency.
- **GPT-6 Astra** for difficult payment-incident root-cause analysis, cross-file dependency reasoning, high-risk security/release reviews, or when Sol misses important details.
- **GPT-6 Luna** for bounded, repetitive, low-risk tasks such as summarizing test output or simple documentation edits.
- Keep reasoning at **Medium** for ordinary batch work; use **High/Extra High** for incident audits and release decisions if available. Higher reasoning uses more allowance and is not automatically better for every task.
- If using **Default**, confirm which model it selects in the current Codex client/workspace before relying on it for a high-risk task.
- Model availability and usage vary by account and Codex version. This is guidance, not a guarantee that a model is fastest for the user's machine or plan.

Official model-selection references:
- https://developers.openai.com/api/docs/guides/model-selection
- https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex

---

## 11. Final guardrail

The objective is not to make Codex modify everything in one pass. The objective is to get Gieo Mơ to a **reviewable, test-backed, migration-aware, observable and recoverable Production release** while preserving all existing work.

**Current action: run the read-only first prompt above, review the report, then approve one clearly bounded task.**
