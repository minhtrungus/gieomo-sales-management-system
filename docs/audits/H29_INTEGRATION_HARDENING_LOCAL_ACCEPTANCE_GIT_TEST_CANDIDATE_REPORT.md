# H29 — Integration hardening, local acceptance and Git test candidate

Date: 2026-10-23 (Asia/Saigon)  
Scope: local repository, loopback-only disposable PostgreSQL, local build and read-only Git inspection  
Final verdict: **NOT READY — TECHNICAL GATES FAIL**

## 1. Executive result

The current dirty root contains working implementations for optional-variant Combo persistence and availability, wildcard Combo checkout allocation, order-line variant swap, fail-closed physical deletion, duplicate review, canonical cancellation, and payment approval/rejection refresh. The canonical migration chain now contains 35 contiguous files and replays cleanly on a new loopback-only PostgreSQL 18.6 cluster.

The final database run passed all 13 mandatory PG files: 80 tests passed, 0 failed, 0 skipped. It includes real PostgreSQL concurrency for stock, voucher, payments, wildcard Combo checkout, order deletion and variant swap. The environment-free test pass contains 594 tests: 520 passed, 0 failed and 74 were correctly reported as PG/environment/superseded skips. TypeScript, scoped lint, migration validation, `git diff --check`, secret-pattern scan and an isolated secretless production build passed.

This is not yet a Git test candidate because mandatory authenticated browser mutation E2E was not completed on a synthetic PostgREST-backed application stack. Source tests, HTTP tests and PostgreSQL tests do not substitute for browser evidence. The current root is also a 194-entry mixed WIP tree on `main`, 15 commits behind the inspected local `origin/main` ref, and the owner has not approved an integration base, manifest or target branch. No stage, commit or push was performed.

## 2. Repository and Git baseline

| Item | Verified state |
|---|---|
| Repository | `C:\Users\MT\Workspaces\gieomo-sales-management-system` |
| Branch / HEAD | `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Upstream | `origin/main` |
| HEAD vs inspected local `origin/main` | 0 ahead / 15 behind |
| Remote identity | `github.com/minhtrungus/gieomo-sales-management-system` (credential-bearing URL not printed) |
| Worktrees | 12; none changed or removed |
| Status | 194 tracked/untracked entries after this audit; none staged |
| Commit / push | none / none |

The root HEAD is an ancestor of every inspected candidate ref. Relative to the inspected local `origin/main`, `preview/payment-replay-followup` is 1 behind / 16 ahead, `review/safe-hardening-030` is 1 behind / 11 ahead, and `preview/upload-admin-only` is 1 behind / 19 ahead. `preview/upload-admin-only` already uses migration numbers 031 and 032 for different changes, so the root's 031–035 series collides there.

Safest integration proposal: create a separate clean worktree from an owner-approved refreshed base, preferably the reviewed `origin/main` line, then selectively apply the required feature commits/hunks and renumber migrations after comparing the chosen branch. Do not switch or merge the current dirty root. `preview/payment-replay-followup` is useful evidence because it contains the earlier H25 line and ends at migration 030, but it is not automatically the target branch.

## 3. Root causes and implemented behavior

### Combo

The schema now distinguishes intentional wildcard components from explicit variants:

- explicit `combo_items.variant_id`: only that active variant supplies stock;
- `variant_id IS NULL`: all valid active variants of the same product form a stock pool;
- invalid/missing catalog data produces unknown/fail-closed behavior, not a false `0 bộ khả dụng`;
- duplicate component demand and explicit-plus-wildcard demand are aggregated without double-consuming stock;
- migration 031 persists the optional mapping atomically;
- migration 035 allocates wildcard demand in stable `variant_id` order, locks candidates, deducts atomically, returns exact stock lines and persists exact per-variant reservation provenance for cancellation.

Legacy NULL rows still require owner classification before any production migration/backfill. The code implements the approved NULL meaning for new/current rows; it does not claim that every historical NULL row was intentionally authored with that meaning.

### Order-line variant swap

`/admin/orders/[id]` renders `Thay đổi mẫu` only for eligible non-combo lines. The client requires a reason and `DOI-MAU`; the API authenticates an admin and derives the actor from the session; migration 033 rechecks order, delivery, item, product and stock state under locks. It moves stock atomically and writes reservation, inventory, history and audit evidence. Combo lines remain fail-closed.

### Controlled deletion and duplicates

Migration 034 allows physical deletion only for an untouched pending/payment-pending/not-ready order with no payment row, payment event, shipment, non-initial history, inventory reservation/effect marker, idempotency claim, voucher or lifecycle timestamps. Preview, reason, `XOA`, active admin, row lock and `updated_at` stale check are mandatory. Evidence is never deleted to make an order eligible.

Duplicate review separately requires the order to keep, the suspected duplicate, reason, preview, `TRUNG` and a fresh version. It writes one audit decision and leaves both orders intact.

This audit expanded the real PG deletion suite to cover every blocker class, stale preview, duplicate replay/non-destruction and two concurrent delete requests. It also corrected a nondeterministic wildcard test that had incorrectly assumed INSERT order equals UUID allocation order; the production function already used deterministic UUID order.

### Payments and cancellation

The order route calls the canonical `cancel_order_atomic(jsonb)` contract. Payment approval sends amount, method and reference; rejection reloads canonical orders/payment data and does not fabricate a failed payment ledger row. Paid orders without a payment row remain reconciliation gaps. No payment, transaction code, refund, void or backfill evidence was invented.

## 4. Data-flow map

| Flow | Current path | Auth / side effects / evidence |
|---|---|---|
| Login/session/logout/role | admin UI → `/api/auth/*` → server session helpers → `members` | Login reads member credentials server-side; protected writers call `requireAdmin`/`requireAuth`; role-matrix debt remains for some older routes. |
| Products/variants/stock | admin/storefront → product services/routes → `products`, `product_variants` | Server reads; stock writers use atomic RPCs and non-negative DB constraints; regression and PG concurrency coverage present. |
| Combos | admin Combo form → `/api/combos` → `save_combo_atomic` → `combos`, `combo_items` | Admin-only persistence; NULL/explicit semantics shared with availability and checkout; 030/031/035 PG coverage. |
| Cart/checkout | storefront/cart → `/api/orders` → order input/service → `create_order_atomic` | Server pricing, idempotency and stock/voucher locks; migration 035 expands wildcard components and stores reservation provenance. |
| Create/read/update/cancel | admin/sale/public UI → `/api/orders` → order service/RPCs → orders domain | Creation and cancellation atomic; arbitrary payment PATCH closed; read errors fail rather than becoming empty success in repaired paths. |
| Change variant | order detail → `/api/orders/swap-variant` → `swap_order_item_variant_atomic` | Active admin, reason, state/stock locks, exact reservation update, history/audit. |
| Delete/duplicates | order detail panels → delete/duplicate routes → migration 034 RPCs | Active admin, preview/version/confirmation; deletion fail-closed; duplicate audit-only. |
| Payment/reconciliation | payments UI/webhook → payment routes → atomic payment RPCs → `payment_events`, `payments`, order/history/audit | Amount/state rechecked server-side; ledger evidence append-oriented; historical paid-without-ledger rows remain unresolved. |
| Members/customers | admin/public routes → service/PostgREST → `members`, `customers` | Sensitive reads require server filtering; historical auth/role debt remains outside this focused batch. |
| Tracking/Thank-You Card | public pages → order/proof reads → orders/items | Customer capability/phone checks; internal notes, audit and other-customer data must not be exposed; source tests pass, final browser coverage missing. |
| Delivery/shipment | admin order/shipping paths → order/shipment tables | Separate delivery state; deletion blocks shipment/delivery evidence. |
| Vouchers | checkout/admin → voucher validation + atomic order RPC → `vouchers` | Server recomputation and concurrency tests; deletion blocks voucher lifecycle evidence. |
| Notifications/uploads/integrations | API routes → email/storage/provider adapters | Existing authorization/error-handling debt remains; no external provider was called in this audit. |

## 5. Performance evidence

The current request-deduplication source contract passes. The latest authenticated Chromium measurement in the existing H29 performance audit used one warm-up and five transitions each way in Next dev mode:

| Transition | Requests before | Requests after | Settled median before | Settled median after |
|---|---:|---:|---:|---:|
| Members → Orders | 4 | 2 | 1561.7 ms | 1560.3 ms |
| Orders → Members | 6 | 3 | 1063.9 ms | 1061.9 ms |

The change removes 50% duplicate Orders/Members/Presence traffic but does not materially change render-settle latency. That measurement was not rerun after the test-only changes in this audit, so it remains prior runtime evidence rather than a new final-candidate measurement. No cache that could leak or stale admin session data was introduced.

## 6. Final verification evidence

| Gate | Result |
|---|---|
| Migration filename/order/dependency | PASS — 35 contiguous files, tip 035 |
| Fresh canonical replay | PASS — migrations 001–035 on disposable PostgreSQL 18.6, loopback port 55441 |
| Mandatory PG runner | PASS — 13 files, 80/80 pass, 0 fail, 0 skip |
| SQL payment/order integrity scripts | PASS |
| Full environment-free suite | PASS — 594 total, 520 pass, 0 fail, 74 skip |
| Skip classification | PG/environment/superseded cases; the mandatory PG run separately executed the current required PG files with zero skips |
| TypeScript | PASS — `tsc --noEmit --incremental false` |
| Scoped lint | PASS for new H29 routes/components/helpers and final changed PG tests |
| `git diff --check` | PASS; line-ending warnings only |
| Secret-pattern scan of diff | PASS — 0 matches; no env/credential values printed |
| Production build | PASS — isolated copy, no `.env*`, 51/51 pages; Google Fonts fetched with approved network access |
| Supabase DB lint | BLOCKED — vanilla PostgreSQL lacks `plpgsql_check`; replay treats this as a non-required warning |
| Authenticated browser mutation E2E | **NOT RUN / REQUIRED** — no maintained root harness provisioning Next + PostgREST + synthetic DB for the final candidate |
| Final performance rerun | NOT RUN after test-only changes; prior measurement retained above |

The first direct build was stopped when Next announced `.env.local`. The passing build used `.tmp/h29-integration-build-20261023`, explicitly excluding `.env*`, `.git`, `.tmp` and prior output. Disposable PG clusters were stopped and removed by the checked harness. No restored snapshot or remote database was mutated.

## 7. Proposed review manifest — not staged

The owner should review and hunk-stage only the coherent groups below on the chosen clean base:

1. Combo semantics and checkout: `src/app/admin/combos/page.tsx`, `src/app/api/combos/route.ts`, `src/lib/comboInventory.ts`, relevant order-create mapping/types, migrations 030/031/035, and Combo/source/PG tests.
2. Variant swap: order detail mounting/mapping, swap component/route, migration 033, and swap UI/PG tests.
3. Controlled deletion and duplicates: both panels/routes, migration 034 (superseding 032 behavior), and deletion/duplicate tests.
4. Narrow cancellation/payment contract repairs and their regression tests.
5. Migration validator/replay/mandatory-PG runner updates required by the final migration series.
6. This report, if wanted.

Mixed tracked files such as order detail, orders route, payments page, Combo page/API, checkout, order store/service and shared types contain older WIP and require hunk-level attribution. Never use `git add .`. Exclude `.tmp`, `.next`, local database data, backups, dumps, environment files, generated output and any PII-bearing artifact.

## 8. Remaining blockers and owner decisions

1. Build and run an authenticated browser E2E harness against a newly provisioned synthetic PostgreSQL + PostgREST stack, covering Combo create/edit/checkout, swap on desktop/narrow viewport, delete preview/delete, duplicate marking, payment approval/rejection and canonical database assertions.
2. Name the exact Git test branch and approve the integration base and hunk manifest. No target can be inferred from the current `main` checkout.
3. Reconcile migration numbers against the selected branch. `preview/upload-admin-only` already has unrelated 031/032 files.
4. Classify historical NULL Combo mappings before any backfill or remote cutover.
5. Define real payment void/refund and historical ledger-reconciliation operations; do not synthesize them from order state.
6. Rehearse the selected exact commit on a disposable restore and repeat every gate, including browser E2E and final performance measurements.
7. Resolve or formally accept older mixed-file lint/auth/upload/notification debt before a wider release claim.

## 9. Actions explicitly not performed

- No `.env`, token, cookie, credential, connection string or PII value was printed.
- No Supabase remote read/write, migration, seed, backfill, cleanup or deployment occurred.
- No production/restored-snapshot mutation occurred.
- No branch switch, merge, cherry-pick, reset, clean, stash, revert, force operation or worktree removal occurred.
- No file was staged; no commit or push occurred.
- No payment provider, bank, email or storage provider was called.

**NOT READY — TECHNICAL GATES FAIL**
