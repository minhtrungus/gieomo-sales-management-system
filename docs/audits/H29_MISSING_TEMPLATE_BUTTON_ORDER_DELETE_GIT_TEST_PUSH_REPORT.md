# H29 — Missing template button, order deletion and Git test push report

Date: 2026-10-23 (Asia/Saigon)  
Scope: forensic repo/runtime audit; local UI/API/RPC repair; synthetic PostgreSQL tests; no Supabase remote mutation, deploy, commit, or push  
Final status: **BLOCKED — OWNER DECISION REQUIRED**

## 1. Executive summary

The missing order-line action was not removed by a committed regression. The exact label `Thay đổi mẫu` did not exist in the committed history or the 16 inspected refs. A functionally matching but uncommitted H25 implementation labelled `Đổi mẫu giao` existed only in the separate `preview/payment-replay-followup` worktree. The root worktree therefore had no component to render, irrespective of cache or responsive CSS.

The feature has now been ported selectively into the current dirty working tree as a real variant-swap workflow, not a decorative button. It is available only for eligible non-combo order lines, requires a reason and `DOI-MAU`, rechecks state and stock in an atomic RPC, records inventory/history/audit evidence, and has source/UI plus synthetic PostgreSQL regression coverage.

The existing controlled-deletion draft was unsafe. It could consider orders in non-draft business states deletable, counted but did not block several evidence relations, and could cascade away evidence. It has been superseded by a fail-closed RPC. Physical deletion now requires an active admin, a fresh preview, reason, `XOA`, pending/not-ready state, and complete absence of payment, payment event, shipment, non-initial history, inventory, idempotency, voucher, and lifecycle evidence. The duplicate workflow records the explicit keep/duplicate decision but never deletes either order.

Local verification passed: 515 non-PG tests passed with 64 environment-gated PG skips; the separate mandatory PG run replayed migrations 001–034 on a disposable database and ran all 12 PG files with zero skips; type-check, new-file lint, migration validation, diff checks, production build, and loopback HTTP smoke passed.

No commit or push was made. The only remote is `origin`, the current branch is `main`, there is no verified Git test target, the root is 15 commits behind `origin/main`, and the worktree contains 191 mixed WIP status entries. Creating a commit from this state or guessing a target branch would violate the requested safety gate.

## 2. Repository baseline and final state

| Item | Baseline | Final |
|---|---|---|
| Repo root | `C:\Users\MT\Workspaces\gieomo-sales-management-system` | unchanged |
| Branch | `main` | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` | unchanged |
| Upstream | `origin/main` | unchanged |
| Divergence from local `origin/main` ref | 0 ahead / 15 behind | unchanged |
| Status entries | 182 mixed tracked/untracked entries | 191 mixed entries |
| Worktrees | 12 | 12, untouched |
| Staged files | none | none |
| Commit/push | none | none |

The remote identity was inspected and contains only the project GitHub repository. No credential-bearing URL was printed. Remote refs include `main`, integration, preview, and review branches, but none was established by the owner or repository configuration as the Git test destination for this task.

No reset, clean, stash, revert, destructive checkout, branch switch, force operation, worktree removal, or broad staging command was used. Existing WIP remains in place.

## 3. Runtime and website identity

Verified loopback chain at final smoke:

| Component | Address | PID / process |
|---|---|---|
| Next.js dev web | `127.0.0.1:3790` | 24724 / `node` |
| Local REST prefix proxy | `127.0.0.1:55434` | 30036 / `node` |
| PostgREST | `127.0.0.1:55445` | 17220 / `postgrest` |
| Restored PostgreSQL | `127.0.0.1:55442` | 12920 / `postgres` |

Read-only HTTP smoke returned 200 for `/`, `/admin/login`, and `/admin/orders`. Prior verified database identity remains `gieomo_local_acceptance_20261022`, backed by `.tmp/postgres-recon-20261022-data`.

Confidence limits:

- The web process is a dev server serving the current dirty root working tree, so it cannot truthfully be identified with HEAD alone.
- The exact PID/listener and loopback dependency chain are verified. The earlier H29 runtime audit also tied that chain to the restored local database.
- An authenticated browser readiness probe did not complete reliably in this task. No destructive or authenticated browser mutation was attempted against the restored snapshot.
- The restored pre-022 snapshot does not contain the new writer RPCs. It is suitable for read-only smoke, not acceptance of swap/delete mutations.
- No service worker implementation was found as the cause. The missing action was absent source, not a stale committed build.

## 4. Forensic result for “Thay đổi mẫu”

### 4.1 Historical evidence

- Exact-string searches, `git log -S/-G`, and inspection across 16 local/remote refs found no committed `Thay đổi mẫu` implementation.
- No commit or hunk can therefore be named as having deleted that exact feature.
- A matching uncommitted H25 change exists in `.tmp/integrated-merge-030`, whose worktree HEAD is `b75a71da18c968a0bebd63da5a84d945698d345c` on `preview/payment-replay-followup`. Its visible label was `Đổi mẫu giao`.
- The current root source did not mount a swap component and could not render the action. This is the direct root cause.

### 4.2 Meaning and implemented flow

Repository schema, product/order types, and the H25 implementation establish that “mẫu” means `product_variants.variant_id` for an order item.

`/admin/orders/[id]` → `OrderVariantSwapAction` → `POST /api/orders/swap-variant` → `swap_order_item_variant_atomic(jsonb)` → `orders`, `order_items`, `product_variants`, `inventory_adjustments`, `order_status_history`, `audit_logs`

The action:

- appears only for order status `pending`, `confirmed`, or `processing`, delivery `not_ready`, and a line with a product/variant identity;
- fails closed for combo lines because changing one component would require owner-approved combo semantics;
- loads active alternatives from the same product and checks whole-line quantity against stock;
- requires a non-empty reason and confirmation code `DOI-MAU`;
- sends an authenticated admin actor to the server;
- rechecks order/item/variant state under locks in the RPC;
- adjusts stock atomically and records history, inventory adjustment, and audit evidence;
- uses an accessible responsive dialog and updates the displayed line only after canonical success.

The server and RPC now enforce the reason. This closes a defect in the H25 draft, where the client required a reason but the server/database could accept an empty value.

## 5. Order deletion, duplicate and payment findings

### 5.1 Root causes

The pre-existing migration 032 deletion policy was too permissive and incomplete:

- it did not strictly limit physical deletion to an untouched pending draft/test order;
- payment events, shipments, business history, inventory evidence, and idempotency claims were counted or reachable but did not all block deletion;
- dependent deletes/cascades could remove evidence in order to make the parent deletion succeed;
- deletion of an idempotency claim could permit resurrection/recreation on retry.

Additional contract defects found and fixed:

- the order cancellation route called an obsolete positional RPC contract although migration 026 defines `cancel_order_atomic(jsonb)`;
- payment approval UI omitted required amount and reference fields, producing a server 400;
- payment rejection UI optimistically marked a payment row failed even though the atomic rejection contract changes the order state and preserves the payment ledger;
- there was no explicit keep-versus-duplicate review workflow.

### 5.2 Implemented policy

| Action | Implemented behavior |
|---|---|
| Delete test/draft order | Two-step preview/delete, active server-side admin, reason, `XOA`, stale-preview check, and transaction lock. Only an untouched pending/payment-pending/delivery-not-ready order with no business evidence is eligible. |
| Blocked delete | UI shows `Xem lý do không thể xóa` and localized blockers. Payment/ledger/event/shipment/history/inventory/idempotency/lifecycle evidence is preserved. |
| Duplicate review | Admin explicitly enters the order code to keep and the duplicate order ID, previews, supplies reason and `TRUNG`, and records `order.duplicate_marked`. Both orders remain. |
| Cancel order | Uses canonical migration-026 JSONB RPC. Cancellation is not deletion. |
| Reject payment | Refreshes orders and canonical reconciliation payments after the RPC; it does not fabricate a failed ledger row. |
| Approve payment | Sends amount, payment method, and real reference expected by the server contract. |
| Void/refund | Not invented. No provider integration is called, and no payment evidence is rewritten merely to permit deletion. |

The hardened 034 RPC never deletes from `payments`, `payment_events`, `order_idempotency`, inventory reservations, or history. Physical deletion occurs only after proving those evidence sets absent. A minimal audit record is written for the deletion decision.

## 6. Relevant data-flow audit

| Area | Current flow | Evidence / remaining issue |
|---|---|---|
| Admin auth | client session → protected route → `requireAdmin`/`requireAuth` | New mutations require admin on the server and RPC checks an active admin member. Existing stale-role/auth concerns outside these routes remain backlog. |
| Orders/details | admin UI → `/api/orders` → order service → PostgREST | Item mapping now carries `product_id`, `variant_id`, and `combo_id`, which the swap UI needs. Existing large WIP in these files remains mixed. |
| Cancellation | order PATCH → `cancel_order_atomic(jsonb)` | Positional/JSONB mismatch fixed. State/stock/voucher handling stays in the atomic RPC. |
| Payments/reconciliation | admin payments → protected reconciliation/payment routes → atomic RPCs | Approval payload and reject refresh fixed. Restored snapshot still has historical paid orders without payment ledger rows; no backfill was attempted. |
| Products/variants/inventory | swap UI → product sync → swap RPC → locked variants + ledger | Covered on synthetic PostgreSQL. Combo-item swap is blocked. |
| Combos | combo UI/API → combo persistence/availability RPCs | Legacy NULL variant mapping remains an owner decision; this task did not invent mappings. |
| Checkout/storefront/tracking | public UI → order/payment routes → atomic creation/payment reads | Broader audit found older-schema/new-writer incompatibility and some existing error/auth debt. No unrelated rewrite was made. |
| Uploads/notifications/integrations | API routes → storage/email/analytics integrations | Existing path/auth and swallowed-error findings remain outside this focused repair. No external provider was called in tests. |

## 7. Files changed for this task

### New feature and workflow files

- `src/components/admin/OrderVariantSwapAction.tsx` — real order-line variant swap UI.
- `src/app/api/orders/swap-variant/route.ts` — authenticated validation and RPC adapter.
- `supabase/migrations/033_order_item_variant_swap.sql` — atomic swap RPC.
- `src/components/admin/DuplicateOrderReviewPanel.tsx` — explicit duplicate review UI.
- `src/app/api/orders/duplicates/route.ts` — authenticated duplicate preview/mark adapter.
- `supabase/migrations/034_harden_order_deletion_and_mark_duplicates.sql` — fail-closed delete replacement and audit-only duplicate RPC.

### Existing/pre-existing WIP files patched selectively

- `src/app/admin/orders/[id]/page.tsx` — mounts swap, controlled delete, and duplicate panels; updates the local displayed item after a successful swap.
- `src/lib/services/orderService.ts` — maps stable product/variant/combo item identities.
- `src/app/api/orders/route.ts` — calls the canonical JSONB cancellation contract.
- `src/app/admin/payments/page.tsx` — supplies approval data and reloads canonical state after rejection.
- `src/app/api/orders/delete/route.ts` — validates mode/preview/confirmation and maps explicit outcomes.
- `src/components/admin/ControlledOrderDeletePanel.tsx` — simplified preview/blocker/delete UX.
- PostgreSQL replay/mandatory test scripts — recognize tip 034 and require the swap/delete PG suites.

These tracked source files already contained substantial WIP. Their whole-file diffs must not be attributed to this task or staged wholesale without hunk-level review.

### Regression tests

- `tests/adminOrderVariantSwapUi.test.ts`
- `tests/swapVariantPg.integration.test.ts`
- `tests/controlledOrderDeleteUi.test.ts`
- `tests/orderDeletionRoute.test.ts`
- `tests/orderDeletionPg.integration.test.ts`
- `tests/orderMutationIntegritySource.test.ts`
- updates to cancellation, migration-pipeline, replay, and payment-read coverage.

No test was deleted, disabled, or loosened to manufacture a green result. The PG swap helper was fixed to supply the newly mandatory reason after the first replay correctly exposed 11 missing-reason cases.

## 8. Test and build evidence

| Gate | Result | Data source |
|---|---|---|
| Focused deletion/swap/payment/cancel tests | 30/30 pass | in-process mocks/source contracts; no customer data |
| Full non-PG suite | 579 total: 515 pass, 0 fail, 64 skip | skips are PG/environment-gated in this run |
| Canonical migration validator | pass; 34 files, contiguous 001–034, tip 034 | migration source only |
| Disposable canonical replay | pass; migrations 001–034 | fresh synthetic PostgreSQL on loopback port 55441; automatically stopped and removed |
| Mandatory PG runner | pass; 12 files, 0 skips | same disposable database; synthetic rows and transaction rollback |
| Payment/order SQL integrity scripts | pass | same disposable database; transaction rollback |
| Supabase DB lint | unavailable on vanilla PostgreSQL because `plpgsql_check` is not installed; non-required harness warning | disposable database; replay still exited 0 |
| TypeScript | `tsc --noEmit` pass | local source |
| Scoped lint, new task files | pass | new routes/components/tests |
| Broader lint including old WIP | fail with 11 errors and 10 warnings | pre-existing `any`, unused imports, and effect-state debt in mixed WIP files; recorded, not hidden |
| `git diff --check` | pass | working tree; line-ending warnings only |
| Production build | pass, exit 0 | isolated copy without `.env*`; network allowed only to fetch Google Fonts |
| Loopback HTTP smoke | 200 for `/`, `/admin/login`, `/admin/orders` | existing read-only restored-snapshot stack |
| Authenticated browser mutation/E2E | not run | restored snapshot is read-only and lacks RPC 033/034; no safe authenticated synthetic web stack was available |

The first isolated build attempt was blocked by sandbox network access to Google Fonts. Re-running the same build with approved network access compiled, type-checked, generated 51 pages, and exited 0. Because `.env*` was deliberately excluded, static generation logged safe missing-Supabase/read-failure warnings; they did not fail the build or contact a configured Supabase project.

No write test used the restored snapshot containing real data. No Supabase remote, webhook, bank, email, or payment provider mutation was performed.

## 9. WIP and artifact classification

| Class | Treatment |
|---|---|
| Existing tracked WIP across admin, API, storefront, services, types, package files | preserved; not staged |
| Existing untracked migrations 013–032, tests, scripts, docs, skills, and worktrees | preserved; not deleted or staged |
| Task fixes/tests/migrations 033–034 | left unstaged for owner review |
| `.tmp` restored snapshot and integration worktrees | preserved; never included in a commit manifest |
| Isolated build workspace `.tmp/h29-release-build-20261023` | generated, reproducible, untracked under the existing `.tmp` status entry; contains no copied `.env*` |
| Backups/dumps/PII-bearing local data | not read into the report, not changed, never staged |
| Sensitive/generated files | excluded from any proposed commit |

## 10. Proposed staged manifest — not staged

Before any commit, the owner-approved integration branch must isolate or hunk-stage only:

1. swap component, route, migration 033, item identity mapping, and swap tests;
2. hardened delete/duplicate components and routes, migration 034, and deletion/duplicate tests;
3. the narrow cancellation/payment contract fixes and their tests;
4. migration validator/replay runner updates required by 033–034;
5. this report, if desired.

Files with old and new WIP (`orders/[id]/page.tsx`, `orders/route.ts`, `payments/page.tsx`, `orderService.ts`, and some tests/scripts) require interactive hunk review. `git add .` or whole-file staging is unsafe.

Staged manifest: none.  
Commit SHA: none.  
Git test remote/branch: not verified.  
Push: not attempted.

## 11. Unresolved technical debt and blockers

1. **Git target:** owner must name the exact non-production remote/branch and integration base. The current root is `main`, 15 commits behind its remote ref, with mixed WIP.
2. **Migration numbering/integration:** preview/review branches contain independent work. Migrations 033/034 must be reconciled against the chosen integration branch before commit; filenames cannot be assumed collision-free there.
3. **Remote schema:** migrations 022–034 are source/local evidence only. Their presence does not prove application on any environment.
4. **Restored snapshot:** the read-only pre-022 schema cannot execute current atomic write paths. Write-path owner acceptance is blocked until a separate synthetic/rehearsal stack is used.
5. **Combo mapping:** legacy combo rows lack approved variant mappings. Combo-line variant swap remains intentionally unavailable.
6. **Historical payment gap:** restored data has paid-state orders but no payment rows. No synthetic ledger/backfill was created.
7. **Payment semantics:** void and refund require a real provider/business process. This task implements neither and does not relabel rejection as either.
8. **Broader audit debt:** stale auth-role handling, some arbitrary status transitions, upload scope, unauthenticated email paths, request races, and swallowed errors remain in unrelated/mixed WIP.
9. **Lint baseline:** older mixed files still fail broad scoped lint. New task files are clean, and type-check/build pass.
10. **Browser E2E:** an authenticated end-to-end synthetic web acceptance run remains outstanding.

## 12. Supabase preparation — no deployment

Dependency order for review is the canonical chain through 034. In particular:

- 033 requires the order, item, variant, inventory adjustment, history, and audit contracts established earlier in the chain.
- 034 hardens/replaces the 032 function and depends on payment events, reservations/idempotency, shipment/history, audit, and active-member contracts.
- Preflight must verify every referenced relation/column/function, applied migration ledger, grants, and role semantics on a disposable restore first.
- A fresh backup/restore rehearsal, owner-approved combo mapping plan, payment reconciliation plan, rollback plan, and cutover checklist are required before any remote action.
- Remote migration, backfill, seed, cleanup, and data mutation remain explicitly unperformed.

## 13. Owner manual verification

After choosing a clean non-production integration branch and applying 001–034 to a synthetic database:

1. Log in as an active admin and open an eligible pending order detail.
2. On a normal product line, verify `Thay đổi mẫu` opens the dialog on desktop and narrow viewport.
3. Verify combo lines explain that individual swap is unavailable.
4. Select another active in-stock variant, enter a reason and `DOI-MAU`, submit once, then verify item snapshot, both variant stocks, inventory adjustment, order history, and audit entry.
5. Preview deletion of a completely synthetic untouched pending draft. Verify code/status/amount/blockers, enter reason and `XOA`, and confirm stale previews are rejected.
6. Verify any order with a payment/payment event, shipment, business history, inventory, idempotency, voucher, or lifecycle evidence cannot be physically deleted.
7. Mark a synthetic duplicate by explicitly entering the order to keep, reason, and `TRUNG`; verify both rows remain and an audit record is created.
8. Confirm payment approval sends real amount/reference and payment rejection reloads canonical data without changing a ledger row optimistically.
9. Run the full non-PG suite, canonical replay, mandatory PG suite, type-check, scoped lint, build, and authenticated browser smoke again on that exact candidate commit.

## 14. Owner decisions required

- Name the exact Git test remote and target branch, and confirm the intended base commit/branch.
- Decide whether to integrate the current root WIP, the `preview/payment-replay-followup` line, or another clean candidate before hunk staging.
- Approve final migration numbers/order after checking the chosen branch for collisions.
- Approve or reject combo variant mappings separately; do not infer them from stock or timestamps.
- Define the real operational process for payment void/refund and historical ledger reconciliation.
- Authorize a separate synthetic authenticated web stack for final browser mutation acceptance.

Until those decisions are supplied, local fixes are verified but the requested commit/push gate remains intentionally closed.

**BLOCKED — OWNER DECISION REQUIRED**
