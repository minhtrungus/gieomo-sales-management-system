# H29 — Local data, schema, Orders, Combo and release-readiness report

Date: 2026-10-22–23 (Asia/Saigon)  
Scope: verified loopback-only restored database; no Production/Preview/Staging access, deploy, remote migration, commit, push, merge, or business-data mutation  
Final verdict: **NOT READY**

## 1. Executive summary

The two reported UI symptoms were reproduced against the verified restored snapshot and their root causes were fixed in code:

- Admin Orders previously reported 0 orders because `getOrdersServer()` embedded the newer `order_inventory_reservations` relation in the base query. That table is absent from the restored pre-022 schema. PostgREST rejected the whole query, and the service converted the error into `[]`. The base order read is now schema-compatible, optional packing metadata is hydrated separately, and real base-query failures throw so the API returns an error instead of a successful empty list.
- All 8 active combos previously reported `0 bộ khả dụng`. The restored data contains 22 combo component rows and every one has `variant_id = NULL`. Availability is therefore unconfigured, not verified zero stock. The UI now distinguishes `available`, `out_of_stock`, `unconfigured`, and `unknown`; all 8 legacy combos display `Chưa cấu hình phân loại` instead of a false zero.
- The Admin Payments page previously derived synthetic payment records from orders and could invent a transaction code. It now reads only recorded payment rows through the protected reconciliation endpoint. The restored snapshot truthfully has 0 payment rows despite 39 orders marked paid.
- Catalog/Combo read failures now fail explicitly instead of returning HTTP 200 with empty collections.
- Local/dev no longer loads a hardcoded Google Analytics ID, preventing local acceptance traffic from reaching Google Tag Manager.

Post-fix runtime evidence against the restored snapshot:

| Read path | Result |
|---|---:|
| Orders API / Admin Orders | 73 / rendered, not empty |
| Products API | 4 |
| Product variants in database | 103 |
| Combos API / Admin Combos | 8 / rendered |
| Combo items | 22, all 22 missing `variant_id` |
| Reconciliation | 73 orders, 0 recorded payment rows |
| Admin Payments | 0 recorded transactions, no read error |
| Browser diagnostics, final run | 0 console errors, 0 same-origin failures |
| Sensitive-key scan | no `password_hash` in inspected API responses |

This is not enough for `READY FOR OWNER ACCEPTANCE` of all business flows. Numeric combo availability cannot be established until the owner approves explicit variant mappings; the historical payment ledger gap remains unresolved; and the restored pre-022 schema lacks the atomic writer RPCs required by current order/payment/inventory/combo write paths. Read-only owner review is available at `http://127.0.0.1:3790`, but write-path acceptance must remain blocked.

## 2. Repository baseline and WIP preservation

- Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
- Branch: `main`
- HEAD before/after: `1c51af625a575a41733d59b29cc9be9ae0892c60`
- Initial `git status --short`: 168 entries; heavily dirty with tracked and untracked WIP.
- Existing worktrees were enumerated and left untouched.
- No reset, clean, stash, revert, destructive checkout, commit, push, merge, or branch change was performed.
- Existing edits in the affected source files were preserved. The changes in this report are small hunks inside files that already contained substantial WIP; the large whole-file Git diff must not be attributed entirely to this task.

## 3. Backup and restored data source

Canonical existing backup reused; no second restore was necessary:

`backups/prod-20261022-20261022T080112/`

This is a local copy of a real Production snapshot, not a synthetic fixture. It contains real PII and must not be shared casually. All six artifacts were re-hashed in this run and still match the prior verified report:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `_query_ledger.sql.txt` | 240 | `8E36F643C9B918543CBB2E9C14C124EE9AED27BFF3B9A8515F055E105A70CC74` |
| `data.sql` | 160,662 | `AFA600FF00DD356BA1787EC51EB3DBB5166A7D743D7239D5C69D70D37083CD9E` |
| `role_memberships.json` | 6,252 | `84F66B8E209BD9A5DE02608F757F08A094092DAFD7C8817BA6B6B06AFF3577C8` |
| `roles.sql` | 229 | `5C0A37CD719D8CD19CD97B3F5B43BAEB2812AE48D92437308201202D0DEBD151` |
| `roles_attributes.json` | 3,718 | `10DC474D85846C8F96DDA07F63D41DC059C72356278B7E614E23BA0D22E41F61` |
| `schema.sql` | 165,914 | `D8F4A589320701B862C03E36E7C13ACB0352375EFE32E1ED929ECC2D45E03C47` |

Prior restore evidence remains valid: 26/26 public tables matched exact row counts and complete-row hashes; public metadata matched 293 columns, 286 constraints, 46 RLS policies, 70 indexes, 13 triggers, 10 functions, 1 sequence, and 639 grants. The current read-only count check still shows 73 orders, 149 order items, 45 customers, 4 products, 103 variants, 8 combos, 22 combo items, and 0 payments.

Actual runtime path, re-verified by listeners, browser/API behavior, and the database identity query:

`Next.js 127.0.0.1:3790` → `local REST proxy 127.0.0.1:55434` → `PostgREST 127.0.0.1:55445` → `gieomo_local_acceptance_20261022 @ PostgreSQL 127.0.0.1:55442`

| Component | Port | Current PID |
|---|---:|---:|
| Next.js | 3790 | 34708 |
| REST prefix proxy | 55434 | 19028 |
| PostgREST | 55445 | 32020 |
| PostgreSQL | 55442 | 14212 |

Port 55843 is not listening; the old synthetic AUTH-05 fixture is not the data source. Repository `.env.local` was not read or printed.

## 4. Data-flow trace and root causes

### 4.1 Orders

Flow:

`/admin/orders` → `getStoredOrders()/syncOrdersFromServer()` → `GET /api/orders?limit=200` → `getOrdersServer()` → local PostgREST → restored PostgreSQL

Before the fix, the base `orders` select included `order_inventory_reservations(...)`. The restored database has no such table. PostgREST therefore rejected the complete order query. Both the database error branch and outer exception branch returned `[]`; `/api/orders` then returned `{ success:true, orders:[] }` with HTTP 200. The client correctly rendered the value it received, but the value was a disguised upstream schema error.

Fix:

1. Base orders/customers/order-items are read without the optional newer relation.
2. Packing reservations are fetched separately only after base orders succeed.
3. Missing `order_inventory_reservations` (`PGRST205`/`42P01` for that exact table) is treated as an older-schema optional-feature absence and yields `packing_items: []` without losing orders.
4. Other order or packing query errors throw a generic safe error. The route returns HTTP 500 instead of a successful empty list.

The UI now renders all 73 restored orders. Customer, amount, order status, payment status, item snapshots, and identifiers are supplied by the restored rows; no fake order/customer/payment data was added.

### 4.2 Combo availability

Flow:

`/admin/combos` → combo/product sync → `GET /api/combos` + `GET /api/products?admin=true` → `getComboAvailabilityStatus()` → UI badge

Observed database facts:

- 8/8 combos are `active`.
- 22/22 combo items have `variant_id = NULL`.
- 103 variants exist; 96 have stock 0 and 7 have positive stock, total stock 152.
- Because no component identifies its required variant, those stock rows cannot be assigned to a combo without inventing a business mapping.

Verified formula for a fully configured combo is:

`min(floor(variant_stock_i / required_quantity_i))`

The current schema has no separate reservation/available-stock value for these legacy rows. Therefore `variant.stock` is the only verified input after an explicit variant mapping exists. A missing mapping or invalid/missing stock is not numerically computable.

Fix:

- `variant_id = NULL` → `unconfigured`, label `Chưa cấu hình phân loại`.
- missing/non-numeric stock → `unknown`, label `Không xác định tồn kho`.
- a real numeric zero → `out_of_stock`, label `0 bộ khả dụng`.
- configured positive stock → the formula above.
- Combo/product API read failures now return HTTP 500 rather than success-like empty arrays.

No combo component, price, discount, sale status, stock, or quantity was changed.

### 4.3 Payments

The restored `payments` table exists and has 0 rows. The `orders` table has 39 rows with `payment_status='paid'`. This is a historical ledger gap, not a restore failure.

The old Admin Payments read helper could synthesize payment rows from orders and invent `MB-...` transaction codes. The page now reads actual payment rows from the authenticated reconciliation endpoint only. Runtime reconciliation returns 73 orders and 0 payment rows; Admin Payments shows 0 recorded transactions. No bank reference, payment payload, or fake backfill was created.

## 5. Schema/code compatibility inventory

| Table/relation or flow | Restored schema | Current code assumption | Mismatch / risk | Action / evidence |
|---|---|---|---|---|
| `members` / admin auth | table present; PBKDF2-shaped local test account already provisioned | session-backed login, role checks, server logout | no read-path mismatch observed | login/session/logout and AUTH-05 browser smoke pass |
| `products` / `product_variants` | 4 products, 103 variants; required selected columns present | catalog and stock by explicit variant | errors were previously able to collapse to `[]` in fallback | errors now throw; runtime returns 4/103 |
| `combos` / `combo_items` | 8/22; `variant_id` nullable and null for all 22 | safe availability requires explicit variant | numeric availability is unknowable; writer requires newer atomic RPC | UI marks unconfigured; owner mapping required |
| `orders` / `order_items` / `customers` | 73/149/45 | current base mapper columns exist | optional packing table absent broke whole query | optional hydration fix; 73 orders render |
| `order_inventory_reservations` | absent | newer packing read expects it | read failure and false empty list before fix | compatibility fallback only for exact missing-table error |
| `payments` | present, 0 rows | reconciliation expects real ledger rows | 39 paid-status orders lack ledger evidence | no synthetic reconstruction; owner/bank-evidence reconciliation required |
| `payment_events` | absent | newer payment pipeline/migrations use it | write/cutover blocker | do not test payment writes on this DB |
| `order_idempotency` | present in v015 shape | canonical 022–030 uses newer atomic contracts | writer/schema cutover mismatch | production/local write acceptance blocked |
| atomic writer RPCs | `cancel_order_atomic` present; `create_order_atomic_v2`, `apply_order_payment_atomic`, `reject_order_payment_atomic`, `adjust_variant_stock_atomic`, `save_combo_atomic` absent | current order/payment/inventory/combo writes require these functions | core mutation flows cannot pass against restored pre-022 schema | requires separately approved isolated migration/cutover rehearsal |
| Customers UI | no separate customer API; derives authorized customer view from orders/cache | orders must load correctly | was empty because orders were falsely empty | restored via Orders fix; no extra PII endpoint added |
| Sale/order shared store | shares orders/products data access | depends on the same read services | benefits from read compatibility; mutation RPC gap remains | unit/source suite passes; write acceptance blocked |
| Tracking / Thank-you | order lookup and snapshot display | relies on order identity and stored snapshots | no new mismatch found | related tests pass; no order was created in this run |

The restored snapshot is the known pre-022/023 Production shape. Repository migrations 022–030 and their migration-ledger/cutover work were not applied here or remotely.

## 6. Files intentionally changed or added

Source hunks:

- `src/lib/services/orderService.ts` — separate optional packing hydration; stop converting database errors to empty orders.
- `src/lib/comboInventory.ts` — distinguish available/out-of-stock/unconfigured/unknown and provide truthful labels.
- `src/app/admin/combos/page.tsx` — render availability state instead of forcing all states through numeric zero.
- `src/lib/services/productService.ts` — make catalog fallback failures explicit.
- `src/app/api/combos/route.ts` — return HTTP 500 for read failures instead of HTTP 200 empty combos.
- `src/app/admin/payments/page.tsx` — read only real recorded payments from reconciliation; remove synthetic order-derived transactions from this page.
- `src/app/layout.tsx` — disable analytics in local/dev and remove the hardcoded fallback GA ID.

Regression evidence:

- `tests/orderItemMapping.test.ts` — old-schema missing-reservation and base-query-failure cases.
- `tests/businessFlowRequirements.test.ts` — missing variant, missing stock, and real zero-stock distinction.
- `tests/adminComboAvailabilityDisplay.test.ts` — admin renders the stateful availability contract.
- `tests/catalogReadFailureContract.test.ts` — product/combo read failures remain explicit.
- `tests/adminPaymentReadPath.test.ts` — Admin Payments uses recorded ledger rows and does not synthesize transactions.
- `tests/localAnalyticsIsolation.test.ts` — local/dev analytics isolation.
- `.tmp/h29-orders-combos-readiness-probe.mjs` — redacted local browser/API probe; outputs only status/count/classification data.
- This report.

Several listed source/test files pre-dated this task as modified or untracked WIP. Nothing outside the scoped hunks was reset or overwritten.

## 7. Verification evidence

### 7.1 Regression-first evidence

Before source changes, the new focused suite failed 5 cases:

- missing reservation table lost all orders;
- base order read error resolved successfully as `[]`;
- Combo page did not use availability states;
- missing stock was classified as out of stock;
- no truthful Combo label helper existed.

After the fixes, the focused suite passed 17/17. Later catalog/payment/local-isolation regressions also passed.

### 7.2 Current automated checks

| Check | Result | Evidence class |
|---|---|---|
| All non-PG unit/API/source tests | PASS — 492 tests, 0 fail, 0 skipped | synthetic/in-memory/source contracts |
| Focused Orders/Combo/Catalog tests | PASS — 55/55 | synthetic regression contracts |
| Payment/reconciliation subset | PASS — 25/25 | synthetic/in-memory contracts |
| Type-check | PASS — `tsc --noEmit`, exit 0 | current working tree |
| New regression-test lint | PASS — exit 0 | four new focused test files |
| Whole-file lint for all task-touched source/tests | FAIL — 43 errors, 3 warnings | existing broad debt in large touched files, principally `no-explicit-any` and an existing effect pattern; not a clean lint gate |
| Production build in isolated copy | PASS — compile, TypeScript, 48/48 pages, exit 0 | current source; see limitation below |
| Prior mandatory PG suites | Historical PASS — 54/54, no skips | separate isolated canonical replay, not rerun against the restored PII snapshot |

Build limitation: `.tmp/h29-orders-combos-build-workspace` excluded `.env*`, backup data, `.git`, root `.next`, and `.tmp`. The build completed, but static `privacy`/`sitemap` generation logged handled missing-Supabase-configuration errors because secrets were intentionally not copied. This is not reported as a completely clean configured production build. The live local runtime with its ACL-restricted loopback configuration passes the actual catalog APIs.

No PG mutation suite was pointed at `gieomo_local_acceptance_20261022`; doing so would alter the restored PII snapshot. The earlier isolated canonical replay evidence is retained but is not substituted for current-schema write compatibility.

### 7.3 Verified against the restored backup

Authenticated browser/API probe, final run:

- login HTTP 200;
- Orders HTTP 200, success, 73 rows; Admin Orders is not an empty state;
- Products HTTP 200, success, 4 rows;
- Combos HTTP 200, success, 8 rows;
- all 8 displayed combos use the unconfigured/unknown label; zero false `0 bộ khả dụng` labels;
- reconciliation HTTP 200, 73 orders, 0 recorded payment rows;
- Admin Payments shows 0 recorded transactions and no read error;
- no `password_hash` in inspected API responses;
- 0 console errors and 0 failed same-origin requests after local analytics isolation.

Auth/security smoke:

- unauthenticated session contract: HTTP 200, `authenticated=false`, no user;
- unauthenticated Orders, reconciliation, and presence: HTTP 401;
- fresh `/admin/members` redirects to `/admin/login`, no roster before auth, 2 bounded session requests;
- local test-account login succeeds with admin role;
- server logout HTTP 200 revokes the session;
- direct protected-page revisit redirects to login;
- no `password_hash` detected.

## 8. Side-effect and data-safety record

- No order creation, cancellation, status transition, payment confirmation/rejection, stock adjustment, combo write, migration, seed, truncate, reset, or backfill was executed.
- No notification, email, SMS, external webhook, payment gateway, or analytics event was intentionally sent. Local/dev analytics is now disabled.
- The only authenticated operations were read-only API/browser checks plus login/session/logout using the already-provisioned local-only account.
- Database checks used `BEGIN READ ONLY` / `ROLLBACK` and aggregate/schema metadata only; no PII values were printed.
- No `.env.local`, credential, password/hash, token, cookie, connection string, or payment payload was printed.
- No Production/Preview/Staging endpoint was contacted in this task.

## 9. Release-readiness gates

| Gate | Verdict | Reason |
|---|---|---|
| Verified local backup and restore | PASS | checksums and 26-table parity retained/rechecked |
| Correct local data source | PASS | loopback chain and database identity verified; fixture 55843 absent |
| Orders/customer read path | PASS | 73 restored orders render; errors no longer become empty success |
| Product/catalog read path | PASS | restored API returns 4 products/103 variants; errors explicit |
| Combo truthfulness | PASS | false zero removed; unconfigured state correctly shown |
| Numeric combo availability | **BLOCKED** | 22/22 legacy components lack explicit `variant_id` |
| Payment read truthfulness | PASS | actual ledger read returns 0; no synthetic payment rows |
| Historical payment reconciliation | **FAIL/BLOCKED** | 39 paid-status orders, 0 payment ledger rows; requires bank evidence and owner approval |
| Auth/login/logout/AUTH-05 | PASS | browser and automated evidence green |
| Core mutation compatibility | **FAIL/BLOCKED** | required current writer RPCs absent from pre-022 schema |
| Current non-PG tests/type-check | PASS | green as listed above |
| Whole-file scoped lint | FAIL | 43 errors and 3 warnings remain in pre-existing surrounding code; new regression-test files lint cleanly |
| Clean configured production build | PARTIAL | exit 0 and 48/48 pages, but isolated secretless build logged handled static-data configuration errors |
| Production schema/migration ledger/cutover | **FAIL/BLOCKED** | known migrations 022–030 and empty platform ledger require separate approved cutover |
| Owner-approved deployment window / rollback plan | NOT OBTAINED | outside task; no deploy authorized |

Therefore the mandatory aggregate verdict is **NOT READY**. This does not regress the narrower prior `AUTH-05_FIXED` or local read-only acceptance findings.

## 10. Owner actions and safe manual testing

Safe now at `http://127.0.0.1:3790`:

1. Verify Admin Orders shows 73 snapshot orders; exercise read-only search/status/source/member filters and open order details without changing status.
2. Verify Admin Combos shows 8 combos as `Chưa cấu hình phân loại`, not `0 bộ khả dụng`.
3. Verify Admin Payments truthfully shows 0 recorded transactions and Admin Reconciliation exposes the payment mismatch state.
4. Repeat login, logout, protected-route revisit, and AUTH-05 redirect.
5. Treat all displayed customer/order information as real PII from the snapshot.

Do not accept or exercise yet:

- create/cancel/update orders;
- confirm/reject payments;
- inventory adjustments;
- combo edits/saves/deletes;
- upload/realtime/external notification flows;
- any Production migration or cutover.

Required owner decisions before a later GO review:

1. Approve explicit `combo_items.variant_id` mappings. Do not infer them from names or first variants.
2. Reconcile the 39 paid-status orders against bank evidence and approve an idempotent ledger backfill design.
3. Approve a separate isolated migration rehearsal and synchronized code/schema cutover for migrations 022–030, including migration-ledger bootstrap, rollback steps, fresh backup, and live-delta check.
4. Provide a deployment window only after those gates pass.

## 11. Final Git and process state

- Branch/HEAD unchanged: `main` @ `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Initial status count: 168 entries. Final status count: 172 entries; new regression/report files increased the count, while all prior WIP remains present.
- No WIP was reset, cleaned, stashed, reverted, committed, staged, pushed, or merged.
- On the 2026-10-23 handoff check the prior processes were no longer listening. The same verified local stack was safely restarted without killing any process; loopback services now run on ports 3790/55434/55445/55442 with the PIDs listed in §3.
- Safe stop script updated for the owner: `.tmp/h29-stop-local-acceptance.ps1`. It validates the expected listener PID/name before stopping Next.js, proxy, and PostgREST, and intentionally leaves PostgreSQL running. Stop PostgreSQL separately with `pg_ctl stop -D .tmp/postgres-recon-20261022-data -m fast -w`; do not use broad `taskkill /T /F` commands.

## 12. Final decision

**NOT READY**

The reported Orders and Combo display defects are fixed and verified against the real restored snapshot. Payment display is now truthful and local analytics is isolated. The remaining blockers are data/business and schema-cutover blockers that cannot be safely guessed away: missing combo variant mappings, an empty payment ledger for paid-status orders, absent current atomic writer RPCs, and unresolved Production migration-ledger/cutover approval. No Production action was taken.
