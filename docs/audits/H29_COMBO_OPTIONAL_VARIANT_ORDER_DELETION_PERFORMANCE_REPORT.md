# H29 — Combo optional variant, controlled order deletion and admin performance

Date: 2026-10-23 (Asia/Saigon)  
Scope: local source, browser reads and disposable PostgreSQL only; no snapshot mutation, remote access, deploy, commit or push  
Verdict: **PARTIAL — READY FOR OWNER REVIEW, NOT READY FOR CUTOVER**

## 1. Result summary

- The official Combo meaning is now represented in the read/UI/persistence layers: `combo_items.variant_id IS NULL` means “all active variants of this product”, not “unconfigured”. Availability aggregates eligible stock, excludes archived variants, combines duplicate product requirements, and prevents explicit-plus-wildcard requirements from consuming the same stock twice.
- Admin Combo no longer requires a variant. Migration 031 persists `NULL` atomically and validates that the product has at least one active variant.
- A controlled physical order-deletion workflow was added: admin-only preview, reason, `XOA`, optimistic version check, row lock, atomic inventory/voucher reversal, child cascade and a PII-minimal audit record. Per owner decision, eligibility now has only two business gates: unpaid and delivery not started.
- Duplicate client syncs during Orders/Members navigation were removed with per-resource in-flight promises. Requests fell exactly by half in the measured Next dev runtime.
- The current atomic checkout function in migration 025 still rejects Combo components with `variant_id IS NULL`. Therefore optional-variant Combo is **not end-to-end complete** for checkout and must not be cut over until an atomic wildcard stock-allocation design and concurrency tests are approved.

## 2. Combo contract and evidence

For each component:

- explicit `variant_id`: use that active variant only;
- `variant_id = NULL`: use the aggregate stock pool of all active variants for the component product;
- duplicate rows for one product are combined;
- invalid quantity/product, no active variants, invalid selected variant or invalid stock yields `unknown` rather than a false zero;
- a true computed zero remains `out_of_stock`.

The restored snapshot has 8 active combos and 22 components, all with `variant_id = NULL`. It also has three products repeated inside at least one Combo, no invalid component quantity, no orphan component product and no component product lacking active variants. A read-only browser smoke after the change showed 8 combos and four numeric zero-availability labels; these are now computed zeros from active-variant stock, not the old blanket “unconfigured” fallback.

Implemented files:

- `src/lib/comboInventory.ts`
- `src/app/api/combos/route.ts`
- `src/app/admin/combos/page.tsx`
- `supabase/migrations/031_optional_combo_variant_persistence.sql`
- Combo source/unit/PG regressions in `tests/businessFlowRequirements.test.ts`, `tests/comboRoute.test.ts`, `tests/migration031Source.test.ts` and `tests/comboPersistencePg.integration.test.ts`.

Remaining blocker: `025_atomic_idempotent_order_creation.sql` raises `D3:COMBO_COMPONENTS_UNMAPPED` for this valid NULL representation. A later migration must define deterministic allocation order, row-lock order, split quantities across variants, reservation rows and cancellation restoration. Until then, storefront/checkout sale of these Combos is not approved.

## 3. Controlled order deletion

An order is eligible when both conditions remain true at deletion time:

- payment status is `pending` or `failed`, and no recorded payment row is `paid`;
- delivery status is `not_ready`.

Order status, prior history, unpaid payment attempts and relation counts do not block deletion. The form no longer asks for a test/duplicate category or keeper order.

The workflow is deliberately separate from payment controls. Preview is read-only and exposes only status/count metadata. Delete requires a non-empty reason, a single order, `XOA`, the preview `updated_at`, and repeats both gates under `FOR UPDATE`. If stock reservations exist, it locks variants deterministically, restores stock and removes reservations; it also releases a recorded voucher use when applicable. It then removes idempotency claims, relies on declared child cascades, preserves the customer row and payment-event evidence, and writes `order.physical_delete` to `audit_logs` in the same transaction. Runtime roles cannot execute the RPC; the API requires an authenticated admin and calls it through the service role.

Implemented files:

- `src/app/api/orders/delete/route.ts`
- `src/components/admin/ControlledOrderDeletePanel.tsx`
- `src/app/admin/orders/[id]/page.tsx`
- `supabase/migrations/032_controlled_order_deletion.sql`
- route/UI/source/PG tests in `tests/orderDeletionRoute.test.ts`, `tests/controlledOrderDeleteUi.test.ts`, `tests/migration032Source.test.ts`, and `tests/orderDeletionPg.integration.test.ts`.

No order was previewed or deleted in the restored PII snapshot. Migration 032 is not installed there, so this UI must not be owner-tested against that stack until an approved isolated/cutover environment contains migration 032.

## 4. Performance measurement

Method: one warm-up then five transitions each way in authenticated Chromium, Next dev mode, measuring route change, main visibility, relevant-API quiet time, and request count.

| Transition | Metric | Before | After |
|---|---:|---:|---:|
| Members → Orders | requests | 4 | **2** |
| Members → Orders | URL median | 134.6 ms | 135.6 ms |
| Members → Orders | main median | 800.0 ms | 802.6 ms |
| Members → Orders | settled median | 1561.7 ms | 1560.3 ms |
| Orders → Members | requests | 6 | **3** |
| Orders → Members | URL median | 139.3 ms | 146.5 ms |
| Orders → Members | main median | 303.6 ms | 293.7 ms |
| Orders → Members | settled median | 1063.9 ms | 1061.9 ms |

Conclusion: the fix removes 50% duplicate Orders/Members/Presence traffic caused by concurrent Strict Mode effects. It does not materially improve render latency; further latency work needs profiling of page rendering and client settling, not more request dedupe claims.

## 5. Verification

| Check | Result |
|---|---|
| Focused regression suite | PASS — 52/52 |
| All non-PG tests | PASS — 507/507, 0 skipped |
| Migration chain | PASS — 32 contiguous migrations, tip 032 |
| Disposable PostgreSQL replay | PASS — migrations 001–032 |
| Mandatory PostgreSQL suite | PASS — 57/57, 0 skipped, 11 files |
| Type-check | PASS — `tsc --noEmit` |
| New/isolated-file lint | PASS |
| Broad touched-file lint | FAIL — 45 errors, 28 warnings in pre-existing large files/effects; not represented as clean |
| `git diff --check` | PASS; line-ending warnings only |
| Isolated production build | PASS — compile, TypeScript, 49/49 pages; secretless static generation logged handled config failures |
| Read-only restored-snapshot browser smoke | PASS — 73 orders, 4 products, 8 combos, 0 payment rows, 0 console errors, 0 same-origin failures, no `password_hash` |

Supabase DB lint could not load `plpgsql_check` on vanilla PostgreSQL; the replay script correctly reports this as infrastructure-blocked, not a clean Supabase lint pass.

## 6. Owner decisions required

1. Approve the wildcard stock-allocation policy and a follow-up atomic checkout migration; do not deploy migration 031 alone as proof that Combo checkout is complete.
2. Confirm the simplified unpaid/not-started eligibility and that the PII-minimal audit is the required retention record.
3. Decide whether deletion reason text needs structured codes or retention/redaction rules before Production.
4. Keep the existing payment-ledger reconciliation and migrations 022–032 cutover as separate explicit approvals.

Final conclusion: the scoped code is suitable for owner review and isolated testing. It is **not ready for Production cutover** because wildcard Combo checkout remains unresolved and the current restored runtime schema does not contain migrations 022–032.
