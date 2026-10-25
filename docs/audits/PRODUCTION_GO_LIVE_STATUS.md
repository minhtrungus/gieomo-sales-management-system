# Gieo Mơ Production Go-Live Status

## Current reconciliation — 2026-10-16 (Phase A–H pass)

**Verdict remains NO-GO.** This section supersedes stale source-state claims below while retaining the earlier report as historical evidence. The eight phase reports in `docs/audits/PHASE_*.md` are the authoritative fresh evidence set (Phase A timeline, B data register, C recovery plan, D voucher reconciliation, E backup gate, F migration rehearsal, G test evidence, H go/no-go).

- Fresh gates all green locally: `CANONICAL_REPLAY_PASS migrations=30 tip=030` + `MANDATORY_PG_PASS files=9 skipped=0` (**49/49** SQL tests), Node suite **543 pass / 0 fail / 55 env-gated skip**, `tsc --noEmit` **0 errors**, `next build` **SUCCESS** on both the dirty workspace and a clean `origin/main@0b7825e` worktree. Lint is debt, not a gate blocker (480/270 errors dirty/origin, dominated by pre-existing `no-explicit-any`).
- Production fingerprint (read-only): a **pre-022 / pre-023 deployed schema** — public insert policies present, runtime `deduct_variant_stock_atomic` granted to `anon`/`authenticated`, no `payment_events`, no `apply_payment_event`/`reject_payment_atomic`/combo persistence RPCs, migration ledger **0 rows**. Deployed build behavior matches the pre-`27b1755` writer: 63 orders, **130/130 order_items with NULL product/variant/combo IDs**, **34 paid orders with 0 payments rows**, all 63 orders keyless, 16 duplicate-candidate pairs still forming through 2026-10-16.
- Voucher tie: only 3 discounted orders exist; ratio/window/min-order rules resolve each uniquely (1×CAMONBAN 5%, 2×GIEOMO200 10%) and `times_used` (1/2) matches exactly; `voucher_id` backfill and verifier defined in Phase D (`MATCH_PROBABLE`, reversible).
- Backup/restore gate is **FAIL/BLOCKED**: Supabase CLI reports no restorable backup points (earliest=0/latest=0, PITR off), Docker-free environment cannot `pg_dump`, and the app JSON export (7 orders, 2026-10-07) is not a restore artifact.
- Release blockers for re-assessment: (R1) deployed build must be re-pointed to the RPC/idempotency/least-privilege contract with migrations 022–030; (R2) payment backfill + status reconcile; (R3) rehearsed restore point; (R4) migration deployment; (R5) item catalog backfill; (R6) duplicate/test-order adjudication. See `PHASE_H_GO_NO_GO_ASSESSMENT.md` §2/§4.

**Safety-review addendum (2026-10-16, review-only — `PHASE_C_EXECUTION_SAFETY_REVIEW.md`):** Two evidence interpretations are corrected and the Phase C plan is re-gated. (1) The legacy deployed order writer deducted stock via direct conditional UPDATEs on `product_variants.stock`/`products.stock` — an empty `inventory_adjustments` ledger does **not** mean no historical consumption; stock attribution requires an owner-approved baseline (§5 of the review). (2) `orders.payment_status=paid` does not prove money moved: the 34 paid orders are split into VERIFIED_PAID/VERIFIED_UNPAID/CONFLICTING_EVIDENCE/NEEDS_MANUAL_REVIEW classes from provider-grade evidence, with no automatic payment mutation outside VERIFIED_PAID. (3) Migration ordering must be expand/contract: additive migrations (020–023, 024–026, 029/030 RPCs) before app cutover, revocations (022/027/028) only after the RPC-based app is verified live. Verdict is unchanged: **NO-GO**; all destructive windows stay forbidden while the backup/restore gate (R3) is BLOCKED. Next safest actions: owner enables a rehearsed restorable backup point and consolidates the dirty worktree into the reviewed release artifact.

**Validation addendum (2026-10-16, review-only — `PHASE_C_EXECUTION_SAFETY_REVIEW_ADDENDUM.md`):** SQL-level validation of the safety review produced a corrected dependency graph and three new blockers that keep the plan in **REVIEW ONLY** (staging rehearsal not yet authorized): (a) the app still contains V015-shaped `order_idempotency` claim/lease/replay machinery in `src/lib/services/idempotencyService.ts` that fails under the 021/025 ledger shape on retry/key-conflict paths (latent — the live checkout uses the V2 RPC writer only); (b) `tests/atomicOrderRpc.test.ts` mocks an `order_idempotency` shape that violates both the V015 and V025 CHECK constraints (`failed_terminal`/`error_message` statuses never exist in real SQL), so unit-only ledger claims are not schema-conformance evidence — the 49/49 PG integration results remain the trustworthy set; (c) keyless admin/POS orders can still reach the legacy direct-write path (`GIEOMO_ORDER_WRITER` env, `orderService.ts:439-446`) and would be denied by 022/028. Also: migration `021` is contract-destructive (renames/archives legacy RPCs and ledger) and cannot be bundled with "additive" steps; migration `027` fail-closed-checks require 023/024/026 to be applied first; the proposed stock-baseline-via-`adjust_variant_stock` is impossible (the function rejects `delta=0`) and needs a dedicated baseline migration or owner-approved physical count. No new evidence supports GO; staging rehearsal remains gated on G1 (backup/restore) plus blockers (a)–(c).

- Live workspace: local `main@1c51af6`, 15 commits behind `origin/main@0b7825e`; 167 working-tree entries after this session and no staged changes. A read-only remote check on 2026-10-16 confirmed `origin/main@0b7825e` and review branch `0221475`; the review branch is not the live workspace state.
- Canonical repository migration chain is now verified as 001–030. A fresh disposable PostgreSQL 18.6 replay passed all 30 files plus the payment and order SQL integrity suites. This does **not** prove Production applied state.
- The current payment confirm/webhook writers use the atomic `apply_payment_event` RPC. The older claim that both current writers are multi-transaction is superseded.
- Admin payment rejection now uses canonical migration 029 `reject_payment_atomic`; real PostgreSQL tests cover idempotency, invalid paid-state rejection, injected-fault rollback, concurrency, audit/history consistency, and runtime ACL. This is verified only in source and a disposable database, not Production.
- Combo admin/API now carries and validates `combo_items.variant_id`, and canonical migration 030 persists the combo header and complete component mapping in one row-locked transaction. Active combos without a valid mapping fail closed. Real PostgreSQL tests cover fault rollback, invalid mapping, concurrent replacement serialization, and runtime ACL.
- Voucher PATCH now persists `discount_type`. Meaningful values for `min_items_count`, `is_gift_voucher`, `gift_min_order_value`, `visibility`, and `max_discount_amount` now fail closed with HTTP 409 instead of being silently dropped. Their database/RPC implementation remains P1.
- Fresh gate results on this workspace: the canonical 001–030 replay runs nine mandatory Node/PostgreSQL files fail-closed and passed **49/49 with zero skip** on disposable PostgreSQL 18.6. Full Node: **598 total, 543 pass, 0 fail, 55 environment-gated skip**; the mandatory runner separately proves the required PostgreSQL subset did not skip. Type-check, session-touched lint, production build, targeted behavior tests, migration-chain validation, and `git diff --check` pass. Supabase DB lint remains NOT RUN/BLOCKED because vanilla PostgreSQL lacks `plpgsql_check`.
- GitHub source evidence: PR #2 OPEN; Vercel checks pass; Supabase Preview skipped. Environment approval configuration, Production deploy SHA, Production migration ledger/schema/ACL fingerprint, backup restore, staging smoke, and rollback evidence remain unknown.

Release remains blocked by the dirty/non-canonical 167-entry artifact, incomplete voucher schema/RPC contract and unresolved voucher business semantics, unknown Production identity/ACL/ledger, absent staging/restore evidence, and unreviewed ownership of the mixed pre-existing WIP. Migrations 028–030 are canonical and verified only in source plus a disposable database; they are not deployed. See `docs/engineering/INTEGRATED_CANDIDATE_SESSION_STATUS.md` for the earlier architecture map and owner decisions.

## 1. Executive verdict

Assessment timestamp: **2026-10-15T19:17:39+07:00**. Evidence addendum: **2026-10-15T21:50:42+07:00** (integrated-candidate reconciliation round — see §9). The verdict below is unchanged by the addendum.

**Verdict: NO-GO for Production deployment, Production migration, and historical data remediation.**

This execution continued from the forensic audit and remediation plan. It performed source/Git inspection, a fresh local test run, and a fresh disposable PostgreSQL rehearsal. It did **not** write to Production, deploy, apply a Production migration, alter the Production migration ledger, repair historical catalog links, create payment records, or change any order/payment status.

The strongest new evidence is a real PostgreSQL 18.6 rehearsal that reproduced both known payment partial states:

- a payment row can commit while the order remains pending;
- an order can become paid while payment history is absent.

The current application payment paths still span multiple database transactions, and the current workspace is not a coherent release artifact. Therefore local mock/source passes cannot justify a release.

## 2. Evidence classification

### CONFIRMED

- Local branch remains `main` at `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Local `origin/main` is `0b7825ecc5c524f822d2ef5602b4fb7a48182f70`; integrated ref is `3731b2557bdd7946c2b596245638eedf1cbddfb9`.
- The current workspace has **138 porcelain entries** after creating this report and remains unstaged; it is not an immutable release artifact.
- The dirty checkout implementation sends one create-order POST and caches the server result locally; it no longer contains the previously observed second `saveNewOrder` POST.
- The dirty general order PATCH rejects both `paymentStatus` and `payment_status` before writes.
- The dirty order writer and migration 016 include catalog identity fields for newly created order items.
- The dirty admin and SePay payment writers still use multiple PostgREST transactions rather than one database transaction.
- The dirty SePay route returns early for an already-paid order and does not durably record the additional transfer.
- Active local migration files stop at 020; migrations 021–026 exist on `origin/main`, and 027 exists on the integrated ref. Presence in Git is not Production apply evidence.
- Fresh local Node run: **589 tests; 548 pass, 1 fail, 40 skipped**. The failure is `tests/voucherConcurrency.integration.test.ts` importing missing optional package `pg`; the skipped tests are PostgreSQL tests without a configured target/driver. This run is **not** a green release gate.
- A fresh disposable PostgreSQL 18.6 cluster was created on loopback under a unique `.tmp/postgres-r1-*` directory, positively identified, exercised, stopped, and removed by the harness.
- The rehearsal applied the prepared sequence `bootstrap → 001 → 002 → 011 → 013 → 014 → 015 → 016 → 018 → draft 021 → draft 022` successfully.
- SQL evidence matrix: **16 cases = 8 PASS, 2 FAIL, 6 BLOCKED**.
- The two executed FAIL cases reproduced payment/order/history partial commits. This is direct database evidence that the current multi-transaction payment design is not atomic.
- The disposable cluster and its generated log/data directory were removed; no `postgres-r1-*` directory remained afterward.

### LIKELY

- The historical snapshot-only writer caused most or all of the 114 supplied ID-less order items.
- The historical order-first invalid payment insert caused some or all of the 11 supplied paid-without-payment orders.
- The public two-POST checkout artifact documented in the remediation plan may have produced duplicate orders, but no Production duplicate count was queried.

### POSSIBLE

- Catalog deletion with `ON DELETE SET NULL` affected a subset of historical item links.
- Manual/reset activity removed payment rows.
- Production schema changes were applied manually or through a deployment process that did not populate the migration ledger.

### UNKNOWN / NOT CHECKED

- Exact Production frontend and backend deployment SHAs.
- Current Production aggregate counts and duplicate-order count.
- Production schema/ACL/function/index fingerprints and actual migration apply history.
- Production RLS policies, grants, default privileges, and sensitive routine `EXECUTE` privileges.
- Provider evidence for the 11 paid orders.
- Historical catalog candidates for the 114 order items.
- Production backup/PITR recoverability and restore time.
- Staging compatibility, smoke tests, and monitoring.

## 3. Work performed in this execution

### 3.1 Source and Git inspection

The live workspace and relevant refs were inspected read-only. No fetch, pull, reset, clean, stash, checkout, switch, rebase, stage, commit, push, or deploy was performed.

A clean linked worktree was proposed to isolate a candidate from the 138-entry dirty workspace. The environment denied the Git-metadata write. No branch or worktree was created. The denial was not bypassed.

### 3.2 Fresh local test run

Command:

```powershell
node --test tests/*.test.ts
```

Result:

| Total | Pass | Fail | Skip | Classification |
|---:|---:|---:|---:|---|
| 589 | 548 | 1 | 40 | **FAIL / NO-GO** |

The optional `pg@8` installation was attempted with `--no-save --package-lock=false`. The sandboxed attempt could not complete, and elevated dependency download was denied. `package.json` and `package-lock.json` were not changed. The denial was not bypassed.

### 3.3 Disposable PostgreSQL rehearsal

Command:

```powershell
powershell.exe -ExecutionPolicy Bypass -File scripts/postgres/run-r1-local-evidence.ps1 -Port 55440
```

Verified target properties:

| Property | Value |
|---|---|
| Database engine | PostgreSQL 18.6 |
| Network | `127.0.0.1:55440` only |
| Database/user | Random synthetic names generated by the harness |
| Data directory | Unique repository-local `.tmp/postgres-r1-*` |
| Production/staging connection | None |
| Disposition | Stopped and removed |

SQL evidence:

| Status | Count | Meaning |
|---|---:|---|
| PASS | 8 | Prepared migration/catalog, identity dedupe, durable draft event, and draft ACL checks behaved as asserted |
| FAIL | 2 | Real partial-state defects were reproduced |
| BLOCKED | 6 | No approved atomic apply contract/business rule or concurrency boundary exists |

The six blocked cases cover concurrent webhooks, webhook/admin race, transaction fault injection, overpayment apply, additional-transfer apply, and P0-A3 quantity/concurrency limits.

The harness then stopped before Node/PostgreSQL suites because `pg` was unavailable. Those suites are **NOT RUN**, not PASS.

## 4. Status by priority finding

| Area | Current status | Evidence | Release disposition |
|---|---|---|---|
| Duplicate order prevention | **PARTIAL / NOT DEPLOYED** | Dirty checkout has one POST and a stable key; public artifact previously showed two POSTs; Production duplicate count and deployment SHA unknown | NO-GO until a clean candidate and real PG/browser concurrency evidence exist |
| Payment integrity | **FAIL** | Multi-transaction writers remain; PostgreSQL reproduced both partial-commit directions | NO-GO; one locked atomic database contract is required |
| New order-item identity | **FIXED IN DIRTY CODE ONLY** | Dirty TypeScript/migration source includes IDs and snapshots; Production deployment/apply unknown | NO-GO until canonical migration/code pair passes isolated PG |
| 114 historical item rows | **UNCHANGED** | No automatic mapping or Production write performed | Separate human-reviewed data decision only after prevention release |
| 11 paid orders / zero payments | **UNCHANGED** | No provider reconciliation and no synthetic ledger repair | Separate finance-approved case process only |
| Migration chain | **UNRESOLVED** | Workspace active files 001–020; remote chain 001–026; integrated adds 027; Production ledger supplied as empty | NO-GO; do not repair ledger as discovery |
| RLS/grants | **PRODUCTION UNKNOWN** | Draft ACL passed disposable rehearsal; Production catalog not queried | NO-GO until read-only Production fingerprint and isolated role tests match |
| Release artifact | **UNRESOLVED** | Local main, origin/main, integrated ref, and dirty workspace differ | NO-GO until one clean immutable SHA is selected |
| Real PG gates | **PARTIAL / FAILING** | SQL matrix executed; Node PG suites not run; payment atomicity probes failed | NO-GO |
| Backup/restore/staging | **NOT CHECKED** | No authorized target or evidence | NO-GO |

## 5. Release blockers

1. **RB-01 — No clean canonical artifact.** The current tree has 138 entries; local `main`, `origin/main`, and the integrated ref contain different code/migration states. The safe linked-worktree isolation action was not permitted by the execution environment.
2. **RB-02 — Payment application is not atomic.** PostgreSQL reproduced payment-with-pending-order and paid-order-without-history states.
3. **RB-03 — Payment policy is incomplete.** Webhook/admin arbitration, overpayment, additional transfer, and fault semantics are not fully approved and tested.
4. **RB-04 — Canonical migration chain is unresolved.** No migration may be selected or marked applied merely from repository presence; Production ledger provenance is absent.
5. **RB-05 — Mandatory PostgreSQL tests are not green.** Node PG suites were not run because `pg` could not be installed, and the SQL payment matrix contains two genuine FAIL results.
6. **RB-06 — Production deployment identity is unknown.** Neither backend SHA nor schema-to-code compatibility is proven.
7. **RB-07 — Production RLS/grants are unknown.** Disposable draft ACL behavior does not prove Production authorization.
8. **RB-08 — Historical finance/catalog cases are unreconciled.** The 11 paid orders and 114 ID-less item rows remain unchanged by design.
9. **RB-09 — Backup/restore and staging gates are absent.** No restore drill, staging release, provider smoke, soak, or monitoring evidence exists.
10. **RB-10 — Suspected Production duplicates are unquantified.** The prior public artifact exposed a duplicate-send mechanism, but no safe Production aggregate was run.

## 6. Required next authorized actions

These are the minimum conditions before a GO decision; they are not authorization to execute Production changes.

1. Authorize creation/use of a clean isolated candidate worktree or provide a clean repository clone at the selected integrated SHA.
2. Select one canonical code/migration line and reconcile the V015/V016 path with migrations 021–027 without overwriting historical migration files.
3. Implement one atomic payment RPC covering event dedupe, order lock, payment row, order state, history, and audit; route both admin and SePay through it and remove the already-paid unrecorded-event path.
4. Install the test-only PostgreSQL driver in the clean candidate and make skipped mandatory PG tests fail CI.
5. Run clean-chain, upgrade-chain, concurrency, rollback/fault, idempotency, payment race, cancellation/restock, and RLS/grant suites on a newly identified disposable database.
6. Obtain read-only Production deployment and catalog fingerprints, then compare them with the selected candidate without repairing the ledger.
7. Complete backup/restore rehearsal and a matching staging deployment with monitored smoke/soak evidence.
8. Reconcile the 11 payment cases through an authorized finance workspace and classify the 114 item rows through the approved A/B/C process. Do not include sensitive identifiers in general evidence.

## 7. GO criteria

Production can be reconsidered only when all of the following are true:

- one clean immutable SHA and one reviewed migration chain are selected;
- all mandatory tests pass with zero fail and zero mandatory skip on real PostgreSQL;
- checkout produces one order under double-click, retry, lost-response, and concurrent submission;
- every applied payment transition is atomic and every inbound money event is durable/idempotent;
- new order items retain authoritative catalog IDs plus snapshots;
- Production schema/ACL/deployment fingerprints match the candidate;
- backup restore and staging rollback/forward-fix drills pass;
- finance, database, security, application, release, and rollback owners sign their gates;
- historical remediation is approved separately from the prevention release.

Until then, **do not deploy, migrate, repair the Production ledger, backfill catalog IDs, create historical payment rows, or alter order/payment state.**

## 8. Repository changes from this execution

- Created this report only: `docs/audits/PRODUCTION_GO_LIVE_STATUS.md`.
- No application code, migration, test, CI configuration, existing document, package manifest, or lockfile was modified.
- No Git staging, commit, push, or deployment was performed.
- No Production connection or write was performed.

## 9. Addendum — integrated-candidate reconciliation round (2026-10-15T21:50:42+07:00)

**Scope:** worktree `gieomo-sales-management-system-worktrees/integrated-candidate`, branch
`integrated/r1-recon-p0a3-security`, HEAD `0221475` (pushed, 0/0 with origin), PR #2.
This round performed **no** commit, push, merge, PR close, Production connection, Production
write, `supabase db push`, deploy, or destructive Git operation. All round outputs are
uncommitted working-tree changes pending a separate request with diff review.

### 9.1 Gate evidence (candidate repo, disposable resources only)

| Gate | Result | Classification |
|------|--------|----------------|
| Migration chain validation (`validate-chain.mjs`, tip 027) | exit 0; 27 contiguous files; SHA-256 manifest emitted | PASS |
| Canonical chain replay on disposable PostgreSQL **18.6** (loopback port, random names, repo-local `.tmp/postgres-canonical-*`) | exit 0; `CANONICAL_REPLAY_PASS migrations=27 tip=027`; canonical RPC set + runtime-role privilege assertions; `PAYMENT_INTEGRITY_PG_PASS`; `ORDER_INTEGRITY_PG_PASS`; cluster stopped and removed afterwards | PASS |
| Supabase db lint inside replay | exit 1 — `plpgsql_check` unavailable on vanilla PG (`SUPABASE_LINT_BLOCKED` warning path, not required) | NOT RUN |
| Node PG integration suites (5 files, `ATOMIC_PG_URL` = disposable replay DB) | **49 tests: 46 pass, 3 fail**; all 3 failures are `028:*` assertions of the still-draft migration 028 target state, which the test file header declares **expected to fail** on a 001–027-only database; one committed SQL alias typo in the same file (`x.priv` → `p.priv`) was found and fixed in the working tree (that test then passes at 027) | PASS for applied-chain scope; 3 BLOCKED pending 028 promotion |
| Non-PG suite (29 files) | **275/275 pass, 0 fail, 0 skipped** | PASS |
| `tsc --noEmit` | exit 0 | PASS |
| Production build (`next build`, Next.js 16.3.5) | exit 0 after replacing a `node_modules` junction (pointed at the main worktree and made Turbopack panic with `Symlink … out of the filesystem root`) with a real `npm ci` install; junction removal did not touch the main worktree's install. Scope: working tree (HEAD + session changes + WIP); isolated pure-HEAD build NOT RUN | PASS (working-tree scope) |
| Lint | session-touched files: **0 errors introduced** (the 2 `react-hooks/set-state-in-effect` errors proven pre-existing at HEAD via `--stdin` lint of HEAD versions; 1 pre-existing `Scissors` warning); whole tree: 440 problems (259 errors / 181 warnings) as pre-existing debt, HEAD-only whole-tree baseline NOT RUN | PASS (0 introduced) / baseline NOT MEASURED |
| `git diff --check` | exit 0 (LF→CRLF notices only) | PASS |
| PR #2 checks | OPEN; Supabase Preview SKIPPED; Vercel Preview Comments SUCCESS; one unnamed check SUCCESS; `mergeable: UNKNOWN` at query time | no failing check observed |
| INP (Part G) | no first-party RUM/lab tooling or config in repo | NOT MEASURED |
| Staging smoke (incl. F1 homepage UI smoke) | no staging target available in this session | BLOCKED |

### 9.2 Functional audit results (read-only unless noted)

- **F2 (voucher edit) — contract mismatch quantified:** the live edit path is form →
  `updateStoredVoucher` (**POST**) → `buildVoucherPayload` whitelist → upsert on `code`; PATCH exists
  (`route.ts:63`) but no client calls it and it also omits `discount_type`. The form collects
  `min_items_count`, `is_gift_voucher`, `gift_min_order_value`, and `visibility`; none has a DB
  column (no `ALTER TABLE vouchers ADD COLUMN` exists in 001–027) and all are stripped by
  `buildVoucherPayload` → **silent field drop** (localStorage shows the value until the next server
  sync). `max_discount_amount` has no column and no form input, so the cap in `pricing.ts:65` is
  permanently 0 (never caps). No behavior change was made; switching the UI to PATCH before the
  columns exist would preserve the same drops and additionally block `discount_type` edits.
- **F3 (combo SKU / reserve-hold) — invariants documented, decisions outstanding:** atomic
  create/cancel RPCs (016→025→026) enforce `stock >= qty` row-locked decrements, fail-closed
  unmapped combo components (`D3:COMBO_COMPONENTS_UNMAPPED`), per-order
  `order_inventory_reservations` provenance, and exact-once cancellation restore; voucher
  reserve/release covered by tests; manual adjustments ledgered in `inventory_adjustments`.
  Gaps: no `combos.sku` (synthetic `COMBO-<6>` snapshots only); the admin combos API never writes
  `combo_items.variant_id` and no mapping UI exists, so admin-created combos stay "pending Admin
  mapping" and their orders fail closed; no distinct reserve/hold state, no SKU-change mechanism,
  no SKU before/after audit; Production `combo_items.variant_id` data state unknown (BLOCKED, no
  read-only Production access). Six owner decisions are listed in the candidate session report;
  the spec forbids inventing the business rules.
- **F6 — authority re-verified, one display gap closed:** the client cannot submit a final amount
  (`buildCanonicalOrderPayload` has no money fields); the RPC recomputes `v_final` in-transaction
  (`025:349`) and the UI prefers the server-returned amount; the two order-entry previews have no
  voucher input. A voucher-discount row was added to `sale/orders` (server fields only,
  `getOrderVoucherDiscount`), with tests. The `admin/payments` discount breakdown remains open and
  was left untouched because that file is payment-workstream WIP.
- **F7 — SKU now travels with the shared helper:** `getOrderItemPresentation` returns `sku`
  (snapshot-first precedence), both presentation consumers (admin order detail, sale orders) render
  it, and regression tests cover present/fallback/empty/null/multi-item/fallback-presentation cases.
  The working tree had previously lost all SKU rendering in admin detail after the order-UI WIP
  replaced the committed `4d10f82` block; that regression is repaired in the working tree.
- **F1/F4/F5/F8:** committed states re-confirmed green inside the 275-test suite; no scope change.

### 9.3 Effect on blockers

- **RB-05 (mandatory PG tests not green) — partially progressed, still open:** the full
  001–027 chain now replays cleanly on a disposable PostgreSQL 18.6 and both SQL integrity suites
  pass; the five node PG files execute (46/49) with the 3 remaining failures documented as
  expected-fail assertions for the unpromoted 028 draft. The §3.3 SQL matrix FAILs (payment
  partial states) and the payment-atomicity work remain exactly as recorded above.
- **RB-01, RB-02, RB-03, RB-04, RB-06, RB-07, RB-08, RB-09, RB-10: unchanged.** The candidate
  branch is a coherent pushed line, but PR #2 does not contain the payment-integrity WIP
  (~61 dirty files in the candidate worktree), so it cannot clear RB-02/RB-03.
- **Verdict after the addendum: NO-GO stands** for Production deploy, Production migration, and
  historical data remediation. All §6/§7 conditions remain in force.

### 9.4 Addendum - Phase C application-layer blockers 1-3 closed in the working tree (2026-10-17)

The three application-side blockers from the execution-safety review addendum
(1: reachable app dependencies on the archived V015 idempotency ledger; 2: unit
tests mocking impossible V015-ledger shapes; 3: keyless order creation falling back
to the legacy multi-step PostgREST writer via GIEOMO_ORDER_WRITER) are closed in
the working tree this session. The full professional audit and the entire current session's verification evidence are described uniformly in
`docs/audits/PHASE_C_BLOCKERS_1_3_REMEDIATION.md`: order creation now has a single
reachable pipeline, i.e., POST /api/orders -> createOrderServerAtomicV2 -> RPC
`create_order_atomic` (025); operations that are keyless/malformed-key are proactively
rejected at the WAL level (HTTP 400 `failed_terminal`), and the V015 dependency has been
physically removed from TS (including the `idempotencyService.ts` file). Go-live gates
are unaffected since fresh evidence is newly acquired: unit suite 533/478 pass/0 fail/55
skip, mandatory PG 49/49 `MANDATORY_PG_PASS` via a disposable local PG (with
`CANONICAL_REPLAY_PASS`, migration=30 tip=030, no code application to Production), tsc 0 errors,
next build SUCCESS. **The NO-GO verdict for Production remains unchanged; G1 (backup/restore,
PITR) is still BLOCKED** and the staging rehearsal/un-promotion conditions are unrenounced.