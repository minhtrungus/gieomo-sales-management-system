# Gieo Mơ Production Read-Only Forensic Audit

## 1. Executive Summary

Thời điểm audit: **2026-10-15 18:13 ICT (+07:00)**.

Audit này không thực hiện bất kỳ thao tác ghi nào lên Production, không sửa code/migration/test hiện có, không thay đổi trạng thái Git và không commit/push/deploy. File này là artifact mới duy nhất của audit.

Hai hiện tượng Production do người dùng cung cấp có cơ chế giải thích rất mạnh trong lịch sử source:

1. **114/114 `order_items` có cả `product_id`, `variant_id`, `combo_id` bằng NULL.** Writer đã commit tại local HEAD `1c51af6` xác thực được các ID nhưng khi dựng payload insert lại chỉ ghi snapshot, quantity và giá, bỏ cả ba ID (`HEAD:src/lib/services/orderService.ts:782-790`). Mẫu output này khớp chính xác với dữ liệu Production: toàn bộ ID rỗng nhưng 111 SKU và 114 variant-name snapshot còn tồn tại. Root cause được xếp **LIKELY**, không phải CONFIRMED, vì chưa có bằng chứng deployment commit và chưa đọc được lịch sử audit/WAL Production.
2. **11 orders `paid` nhưng bảng `payments` có 0 dòng.** Hai writer đã commit tại HEAD/origin/main cập nhật `orders.payment_status` trước, sau đó insert `payments` bằng hai cột không tồn tại trong schema 001 (`status`, `confirmed_at`) và bỏ qua kết quả lỗi insert. Đây là cơ chế trực tiếp tạo trạng thái observed. Root cause được xếp **LIKELY**, vì deployment commit vẫn UNKNOWN.

Migration ledger Production rỗng trong khi schema chứa dấu vết của các thay đổi sau 001 (`orders.idempotency_key`, `stock_restored_at`, `voucher_released_at`). Điều này **CONFIRMED** rằng ledger không cung cấp provenance đáng tin cậy; chưa đủ để kết luận schema được tạo thủ công, ledger bị xóa hay migration nào đã chạy.

Workspace hiện có các sửa đổi chưa commit để ghi đủ ID, dùng atomic RPC và ghi payment insert-first đúng schema. 122 unit/mock/source tests liên quan đã pass, nhưng đây chỉ là **TESTED LOCALLY**; không có PG integration trên database cô lập và không có bằng chứng Production đã deploy/apply các thay đổi đó.

### Findings table

| ID | Finding | Evidence | Confidence | Severity | Business impact | Next safe action |
|---|---|---|---|---|---|---|
| F-01 | Writer đã commit bỏ `product_id`/`variant_id`/`combo_id` khỏi insert `order_items` | HEAD `orderService.ts:782-790`; Production 114/114 cả ba ID NULL nhưng snapshots còn | LIKELY | P1 | Không thể liên kết catalog chính xác; cancel/restock/reconciliation có thể không phân giải được dòng hàng | Xác minh deployment commit và aggregate `created_at`/audit action, không đọc PII |
| F-02 | Admin confirm và SePay đã commit có thể tạo paid order mà không tạo payment row | HEAD payment route `:76-104`; SePay `:141-162`; schema `001:269-278` | LIKELY | P1 | Mất payment ledger/audit trail dù order báo paid | Đối chiếu 11 orders bằng status-history/audit action counts, proof-presence và SePay dashboard theo quy trình phê duyệt |
| F-03 | Migration ledger Production rỗng nhưng schema/data hiện hữu và có cột hậu-001 | Bằng chứng người dùng: ledger `[]`; orders có cột từ local 015/017 | CONFIRMED | P2 | Không thể chứng minh applied migration set hoặc tái tạo Production đáng tin cậy | Lấy catalog fingerprint read-only và deployment/change-log ngoài DB |
| F-04 | Local `main` cách `origin/main` 15 commits; workspace có 49 tracked changes và 88 untracked entries | Git read-only snapshot | CONFIRMED | P2 | Không có một source tree duy nhất có thể coi là Production artifact | Xác minh commit SHA của deployment từ hosting/release metadata |
| F-05 | FK `order_items` dùng `ON DELETE SET NULL`; xóa catalog có thể xóa link nhưng giữ snapshot | Production constraints do người dùng cung cấp; `001:250-255`; product delete paths | CONFIRMED (capability), POSSIBLE (historical cause) | P2 | Xóa product/variant/combo có thể làm ledger lịch sử mất liên kết | Aggregate audit actions cho delete catalog theo thời gian, không đọc payload |
| F-06 | Không có DB constraint trong schema 001 bắt buộc paid order phải có payment row | `001:206-280`; writers chạy nhiều PostgREST transaction | CONFIRMED (source/schema), Production apply UNKNOWN | P1 | Hai bảng có thể lệch và không tự phục hồi | Catalog-check constraint/function/index thực tế; không sửa dữ liệu |
| F-07 | Migration 013 trong workspace cho anon insert vào orders/order_items/payments; origin/main 022 mới revoke | `013:17-70`; `origin/main:022:11-21` | CONFIRMED in source, NOT CHECKED in Production | P2 | Nếu 013 có hiệu lực mà 022 chưa có, runtime role có write surface rộng | Query `pg_policy` + `has_table_privilege` read-only khi có auth |
| F-08 | Có script reset local xóa payments/orders/catalog, nhưng admin clear-data route hiện trả 403 | `supabase/reset_test_data.sql:8-32`; `src/app/api/admin/clear-data/route.ts:6-13` | CONFIRMED in source, UNKNOWN execution | P3 | Script chạy nhầm có thể xóa business data; không giải thích riêng 11 paid orders nếu các order đó vẫn còn | Tìm change/audit log vận hành; không chạy script |
| F-09 | Workspace chứa bản sửa nhưng chưa commit và chưa có bằng chứng apply/deploy | current files; migrations 013-020 untracked; payment service untracked | CONFIRMED | P2 | Có nguy cơ nhầm “fixed in code” với “fixed in Production” | Review, isolate, test DB, release gate ở một nhiệm vụ riêng sau phê duyệt |
| F-10 | Test local liên quan pass nhưng chưa có bằng chứng PostgreSQL/concurrency thực | 122 pass, 0 fail, 0 skip; `ATOMIC_PG_URL` missing | CONFIRMED | P2 | Mock tests không chứng minh transaction/RLS/concurrency thật | Chạy PG suite chỉ trên target disposable được operator xác nhận |

## 2. Audit Scope & Safety Boundaries

Đã làm:

- Đọc Git status/history/remote-tracking refs, source, migrations, tests và tài liệu.
- Đối chiếu source với aggregate/catalog evidence Production do người dùng cung cấp.
- Chạy unit/mock/source tests local không kết nối Production.
- Thử khởi tạo một lệnh `supabase db query --linked` chỉ gồm `SELECT`; CLI dừng trước khi gửi query vì thiếu access token.
- Thử HTTP GET read-only tới `https://gieomo.store`; công cụ không trả nội dung có thể dùng để nhận diện build.

Không làm:

- Không INSERT/UPDATE/DELETE/DDL/RPC trên Production.
- Không chạy migration, repair, push, reset hoặc seed.
- Không gửi webhook hay tạo order test.
- Không đọc secrets, `.env`, PII, transaction code hoặc payload audit.
- Không fetch/pull/reset/clean/checkout/stash/rebase/switch Git.
- Không sửa file hiện hữu, không stage/commit/push/deploy.

## 3. Environment, Timestamp & Commit State

| Field | Value |
|---|---|
| Audit timestamp | 2026-10-15T18:13:00+07:00 |
| Workspace | `C:\Users\MT\Workspaces\gieomo-sales-management-system` |
| Branch | `main` |
| Local HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| `origin/main` | `0b7825ecc5c524f822d2ef5602b4fb7a48182f70` |
| Ahead/behind | local `main` is 15 commits behind `origin/main`, 0 ahead |
| Merge base | local HEAD `1c51af6` |
| Integrated branch | `origin/integrated/r1-recon-p0a3-security` at `2cc891e` |
| Supabase CLI | 2.98.2 |
| Production project ref | `snmmiwpvlpknkinhfqsv` (provided) |
| CLI auth in this process | `SUPABASE_ACCESS_TOKEN` not configured |
| Isolated PG test target | `ATOMIC_PG_URL` not configured |
| Local Supabase | unavailable; Docker engine not running/accessible |

Initial workspace status contained **49 tracked modified/deleted entries** and **88 untracked entries**. Relevant tracked modifications include the order API/service, admin/POS/sale/checkout flows, payment route, SePay webhook and product deletion service. Relevant untracked files include migrations 013-020, proposals 021-022, payment/idempotency services and many tests. These are user/OpenCode work and were not changed.

The report target did not exist before creation (`REPORT_EXISTS_BEFORE_WRITE=no`).

## 4. Evidence Inventory

| Source | What was available | Limit |
|---|---|---|
| User-provided Production aggregates | row counts, payment grouping, snapshot completeness, referential checks | Observation time not supplied; not a transaction-consistent snapshot |
| User-provided Production catalog | order/order_item/payment columns, FKs, order_items trigger absence, ledger schema/content | Policies, grants, indexes, functions and audit schema not provided |
| Local HEAD | committed code through `1c51af6` | Not proof of deployed code |
| `origin/main` | 15 later commits; migrations through 026 | Remote-tracking ref may be stale; not proof of deployment/apply |
| Integrated branch | migration 027 and tests | Separate branch; not canonical/deployed by evidence |
| Dirty workspace | extensive prospective fixes and tests | Uncommitted; not deploy evidence |
| Git history/blame | writer behavior dates/commits | Does not prove execution against Production |
| Local tests | 122 pass | Unit/mock/source tests only; no real PG |
| Live DB attempt | CLI stopped for missing token | No fresh Production query executed |

## 5. Production Data Integrity Findings

User-provided direct observations:

- `orders=55`, `order_items=114`, `customers=36`, `payments=0`, `products=4`, `product_variants=103`.
- No order without items; no blank item name snapshot; no order with missing customer reference.
- All 114 items have all three catalog IDs NULL.
- 111/114 have nonblank SKU snapshot; 114/114 have nonblank variant-name snapshot.
- 11 banking orders are `paid`; 44 banking orders are `pending`; no payment rows exist.
- No user trigger exists on `public.order_items`.

These facts do not by themselves prove corruption or fake payments. Snapshots preserve historical display information, but missing IDs remove authoritative catalog identity and can impair stock restoration/cancellation logic. Likewise, `orders.payment_status='paid'` can be historically correct even when the payment ledger write failed.

No fresh counts were obtained during this audit because the CLI authentication check failed before query execution.

## 6. Investigation of 114 Order Items Without IDs

### Candidate hypotheses

| Hypothesis | Evidence | Classification |
|---|---|---|
| The order writer never inserted IDs | HEAD writer builds verified items with IDs, then omits all three fields in insert (`HEAD:orderService.ts:782-790`) | LIKELY root cause |
| IDs existed then catalog rows were deleted | All three FKs use `ON DELETE SET NULL`; product/combo deletion paths exist | POSSIBLE |
| A migration/script nulled IDs | No such UPDATE found in repository; reset script deletes rows rather than nulling IDs | UNKNOWN/POSSIBLE outside repo |
| Snapshot-only import created rows | No order import/legacy loader writing `order_items` was found; seed script handles catalog only | POSSIBLE but unsupported |
| Another writer path omitted IDs | All UI paths converge on `/api/orders`; historical `createOrderServer` is the identified snapshot-only writer | LIKELY same mechanism |

### Direct source mechanism

At local HEAD, `verifiedOrderItems` carries catalog IDs, but the final `orderItemsToInsert` contains only:

- `order_id`
- three snapshot fields
- quantity and monetary fields

It omits `product_id`, `variant_id`, and `combo_id`. PostgreSQL accepts this because all three columns are nullable. The resulting row shape is exactly the supplied Production pattern.

Git blame attributes this insert mapping to commit `518c39a` dated 2026-10-07. Earlier code removed in that same commit was also snapshot-only. Therefore the omission existed across more than one historical implementation.

### Delete-to-NULL mechanism

Schema 001 and supplied Production catalog agree:

- product FK: `ON DELETE SET NULL`
- variant FK: `ON DELETE SET NULL`
- combo FK: `ON DELETE SET NULL`

Current workspace also contains service-role catalog deletion paths (`src/lib/services/productService.ts:587-667`, `src/app/api/combos/route.ts:483-493`). Such deletions can null one or more historical references. However, there is no audit/WAL evidence that deletions caused these 114 rows, and the universal 114/114 pattern is more consistent with the snapshot-only writer.

### Current workspace behavior (not Production evidence)

The modified workspace now maps all IDs into the legacy insert (`src/lib/services/orderService.ts:1201-1216`) and passes all IDs to the atomic RPC (`:1494-1502`). Migration 016 inserts all IDs and snapshots (`supabase/migrations/016_create_order_atomic.sql:768-779`). Current checkout, admin create, POS and sale create all generate/persist an idempotency key and POST to `/api/orders`:

- checkout: `src/app/checkout/page.tsx:375-428`
- shared server-first helper: `src/lib/data/orderStore.ts:151-269`
- admin: `src/app/admin/orders/create/page.tsx:170-233`
- POS: `src/app/admin/orders/pos/page.tsx:242-300`
- sale portal: `src/app/sale/create-order/page.tsx:230-298`

This is **FIXED/TESTED IN DIRTY WORKSPACE ONLY**. It does not prove Production behavior.

## 7. Investigation of 11 Paid Orders With Empty Payments Table

### How the mismatch can be produced

Committed admin confirmation at HEAD performs:

1. update `orders.payment_status='paid'`;
2. only after success, insert a payment;
3. insert uses `status: 'paid'` and `confirmed_at`;
4. insert result is not checked.

Committed SePay flow uses the same ordering and invalid columns. Schema 001 defines `payment_status`, and defines neither `status` nor `confirmed_at` on `payments` (`supabase/migrations/001_initial_schema.sql:268-279`). Thus PostgREST can reject the payment insert after the order update has already committed, while the route continues as if successful.

This is a source-confirmed bug mechanism, not designed legacy behavior. Whether it caused each of the 11 rows remains LIKELY until deployment/audit evidence is obtained.

### Answers to required questions

1. **Which paths can set paid without a payment row?** The committed admin payment route and committed SePay webhook described above. A general order PATCH bypass exists in older history but the current dirty workspace rejects payment fields at `src/app/api/orders/route.ts:120-132`; Production deployment is unknown.
2. **Designed legacy behavior or bug?** The `payments` schema and comments in the new untracked `paymentRecordService.ts:17-18` explicitly identify the old `status`/`confirmed_at` insert as wrong. This is a bug mechanism.
3. **Could payment rows once have existed and been deleted?** Possible, but unsupported. No application payment-delete path was found. `supabase/reset_test_data.sql:8-16` can delete all payments, and FK cascade deletes payments when an order is deleted; neither explains deleting payment rows for the same 11 surviving orders without additional events. Manual/remote actions remain UNKNOWN.
4. **Is synchronization enforced?** No invariant in schema 001 requires a paid order to have a paid payment row. The old writers are separate PostgREST transactions.
5. **What can verify the 11 orders safely?** Aggregate-only counts of `order_status_history` and `audit_logs` actions/time buckets; proof-present booleans; deployment logs; SePay provider records reconciled by authorized staff; payment-event counts if migration 023 exists. Do not export codes, notes, customer fields or bank payloads.
6. **Can verification avoid sensitive data?** Yes. Counts, booleans, min/max timestamps and stable one-way internal correlation performed inside SQL are sufficient for initial classification.

### Current workspace behavior (not Production evidence)

The untracked payment service inserts `payment_status='paid'` first and checks errors (`src/lib/services/paymentRecordService.ts:56-95`). Modified admin and SePay routes call it before updating the order (`payment/route.ts:196-231`; `sepay/route.ts:224-271`). Migration 018 adds a partial unique transaction index. None is proven deployed/applied.

The current workspace still has known design gaps: admin and webhook use different transaction codes, so migration 018 alone does not enforce one paid payment per order; webhook also early-returns when an order is already paid (`sepay/route.ts:166-176`), leaving a genuine later transfer unrecorded. `origin/main` migration 023 proposes a stronger one-paid-row invariant and event ledger, but its Production state is UNKNOWN.

## 8. Migration Ledger & Schema Drift

### Observed state

- Production migration ledger exists but contains zero rows.
- Production schema/data plainly exist.
- Production `orders` includes `idempotency_key`, associated locally with migration 015.
- Production includes `stock_restored_at` and `voucher_released_at`, associated locally with migration 017.
- Production `order_items` FKs match the original 001 `ON DELETE SET NULL` definitions.

This proves a **provenance gap**, not a specific drift origin.

### Repository chains

- Local HEAD tracks migrations 001-012 only.
- Dirty workspace adds untracked 013-020 plus draft proposals 021-022.
- `origin/main` is 15 commits ahead and contains committed migrations 013-026.
- `origin/integrated/r1-recon-p0a3-security` additionally contains migration 027.

The same version numbers can represent different maturity/canonical states across workspace and refs. No local file or branch is assumed applied.

### Plausible explanations for empty ledger

- migrations were run manually in SQL Editor and did not populate the CLI ledger;
- schema was built/imported outside the local migration workflow;
- ledger rows were removed/reset;
- project linking or historical deployment method changed;
- the supplied schema is a composite of selectively applied scripts.

All remain POSSIBLE/UNKNOWN without external deployment/change history or fresh catalog fingerprints.

No `migration repair`, `db push`, migration apply or destructive diff was run.

## 9. Order Creation Paths and Idempotency

### Historical committed path relevant to Production pattern

All public/admin/POS/sale flows POST to the order API or use the shared store. At HEAD, `createOrderServer` validated catalog entities and created snapshots but inserted no catalog IDs. The process was multi-step rather than one database transaction, so an order row could survive item/history failures.

### Dirty workspace path

All four UI entry points now carry IDs to `/api/orders`. `beginCreateOrderAttempt` stores an idempotency key and payload digest in session storage (`src/lib/checkout/createOrderAttempt.ts:10-59`). `/api/orders` forwards the key (`src/app/api/orders/route.ts:38-46`). Default writer mode is RPC; migration 016 performs validation, stock/voucher/order/items/ledger work inside PostgreSQL.

Variant identity is re-resolved server-side; the writer uses the variant's authoritative `product_id`, not a client-declared relation (`orderService.ts:758-788`; migration 016 variant-resolution section). Combo and simple-product branches also resolve authoritative rows.

Limitations:

- deployment/apply state unknown;
- customer upsert remains outside the local migration-016 transaction (`orderService.ts:1452-1459`);
- local tests are fake/mock/source tests;
- no non-skipped real PostgreSQL concurrency evidence was produced;
- comments/tests show legacy/keyless behavior still exists as an escape/fallback path in workspace source, though current callers generate a key.

## 10. Payment/SePay Flow Analysis

Historical committed code has update-first, invalid payment insert and ignored insert errors. Dirty workspace changes to insert-first and fail-closed application handling, but still spans multiple PostgREST transactions.

Current dirty-workspace controls include:

- deterministic transaction codes;
- app pre-check plus proposed unique index 018;
- compare-and-set order status update;
- rejection of general PATCH payment bypass;
- no resurrection of cancelled orders;
- local double-submit guard.

Remaining source risks, not verified in Production:

- webhook authentication uses a static API key rather than a signed event protocol;
- already-paid early return can leave additional transfers unrecorded;
- unknown order code returns an unmatched outcome without a DB payment row;
- 013 permits anon payment insert until later migrations revoke it;
- multiple transactions mean payment/history/order updates are not one atomic unit;
- migration 018 permits two paid rows with different transaction codes for one order.

## 11. Security/Permissions Findings

Production permission state is **NOT CHECKED** because live catalog access was unavailable.

Source-only observations:

- migration 011 removes anon SELECT from sensitive order/payment tables;
- untracked migration 013 recreates unrestricted anon INSERT policies for customers, orders, order_items, payments and order history (`WITH CHECK (true)`);
- `origin/main` migration 022 revokes runtime DML and drops those public insert policies;
- `origin/main` migration 023 additionally revokes anon payment insert and introduces payment integrity objects;
- integrated-branch migration 027 revokes runtime SELECT and legacy RPC bypasses.

Because the Production ledger is empty and policies/grants were not queried, no claim is made that Production is vulnerable or remediated.

## 12. Confirmed vs Likely vs Possible vs Unknown

### CONFIRMED

- Supplied Production aggregates and constraints have the values listed in sections 5-7.
- HEAD writer omits catalog IDs from `order_items` insert.
- HEAD/origin main payment writers use invalid payment columns after updating orders.
- Schema 001 has `payment_status`, not `status`, and no `confirmed_at` on payments.
- Ledger is empty while later-looking schema columns exist.
- Local branch/workspace contains divergent and uncommitted migration/code states.
- 122 selected local tests passed.

### LIKELY

- Snapshot-only committed writer produced most or all of the 114 ID-less rows.
- Invalid, ignored payment inserts produced some or all of the 11 paid/no-payment mismatches.

### POSSIBLE

- Product/variant/combo deletion nulled some historical IDs.
- A reset/manual action removed payments.
- Schema was applied manually or imported outside Supabase CLI migration tracking.
- Alternate historical code/import path affected a subset of rows.

### UNKNOWN / NOT CHECKED

- Exact Production deployment commit.
- Exact creation dates/distribution of the 114 rows.
- Audit-log/status-history evidence for each paid order.
- Production policies, grants, functions, indexes and triggers beyond supplied evidence.
- Whether migrations 013-027 are applied.
- Whether payment proof or provider evidence validates the 11 paid orders.
- Historical WAL/database audit trail.

## 13. Business Impact and Severity

### P1

- Order item catalog identity is absent for every supplied row. Historical display remains possible, but deterministic stock restoration, cancellation and SKU/catalog reconciliation are degraded.
- Payment truth is split: `orders` claims 11 paid states while the append-only payment ledger has no rows. This is an auditability and reconciliation defect, not evidence that the payments are false.

### P2

- Empty migration ledger and divergent chains prevent reliable environment reconstruction.
- Deployment artifact is unknown.
- Production permission state cannot be established.
- Fixes exist only in uncommitted/remote source with no isolated-PG or Production evidence.

### P3

- Local reset script remains present and operationally dangerous if misused, although no evidence shows it ran against Production.

No P0 was assigned because no active unauthorized access, proven data loss, or false payment was established.

## 14. Safe Next Steps

In a separately approved read-only session:

1. Restore Supabase CLI authentication without sharing tokens in chat/output.
2. Run the aggregate/catalog queries in the appendix only.
3. Capture Production policy/grant/function/index fingerprints.
4. Query audit/status history only by action/entity/count/time bucket; never select JSON payloads or PII.
5. Obtain deployment commit SHA from the hosting/release system.
6. Compare that SHA's order/payment writers with the observed data windows.
7. Have an authorized finance operator reconcile the 11 orders against SePay/provider evidence without exporting bank details.
8. Decide canonical migration chain before any repair/apply work.
9. If remediation is later approved, first prove it on an operator-identified disposable PG target; do not use Production for tests.

No corrective SQL is proposed in this audit.

## 15. Actions Explicitly NOT Performed

- No Production write of any kind.
- No database function/RPC execution.
- No migration apply/repair/push/reset.
- No order, webhook, payment or test-data creation.
- No HTTP POST/PUT/PATCH/DELETE to Production.
- No secret/PII/payment-code extraction.
- No code, migration, configuration or test modification.
- No Git stage/commit/push/merge/rebase/switch/reset/clean/stash/pull/fetch.
- No dependency installation.
- No PG integration test, because no operator-identified disposable target was configured.

## 16. Appendix: Sanitized SQL Checks and File/Line References

### Live query attempt

At **2026-10-15 18:10:55 ICT**, the following categories of `SELECT` were supplied to `supabase db query --linked --agent=no --output json`:

- connection identity/time;
- order payment-status counts;
- order-item ID/snapshot completeness counts;
- payment orphan/missing/multiple counts.

The CLI returned before query execution:

> Access token not provided. Supply an access token by running supabase login or setting the SUPABASE_ACCESS_TOKEN environment variable.

Therefore these queries are recorded as **attempted, not executed**.

### Safe aggregate SQL for a future authorized session

```sql
SELECT current_database(), current_user, current_timestamp;

SELECT payment_status::text, payment_method::text, count(*) AS order_count
FROM public.orders
GROUP BY payment_status, payment_method
ORDER BY payment_status::text, payment_method::text;

SELECT
  count(*) AS total_items,
  count(*) FILTER (WHERE product_id IS NULL AND variant_id IS NULL AND combo_id IS NULL) AS all_ids_null,
  count(*) FILTER (WHERE product_id IS NOT NULL) AS product_id_present,
  count(*) FILTER (WHERE variant_id IS NOT NULL) AS variant_id_present,
  count(*) FILTER (WHERE combo_id IS NOT NULL) AS combo_id_present,
  count(*) FILTER (WHERE sku_snapshot IS NULL OR btrim(sku_snapshot) = '') AS sku_missing,
  count(*) FILTER (WHERE variant_name_snapshot IS NULL OR btrim(variant_name_snapshot) = '') AS variant_snapshot_missing
FROM public.order_items;

SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS row_count,
  count(*) FILTER (WHERE sku_snapshot IS NULL OR btrim(sku_snapshot) = '') AS missing_sku,
  count(DISTINCT item_name_snapshot) AS distinct_snapshot_names
FROM public.order_items
GROUP BY 1
ORDER BY 1;

SELECT count(*) AS paid_orders_without_payment
FROM public.orders o
WHERE o.payment_status::text = 'paid'
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id = o.order_id);

SELECT count(*) AS orders_with_multiple_payments
FROM (
  SELECT order_id FROM public.payments GROUP BY order_id HAVING count(*) > 1
) x;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
ORDER BY ordinal_position;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('customers','orders','order_items','payments','products','product_variants','combos')
ORDER BY tablename, policyname;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;
```

Do not extend the audit-log query to JSON payload columns. If action evidence is needed, use only action/entity/count/min/max timestamp aggregates after confirming actual column names.

### Primary references

- `supabase/migrations/001_initial_schema.sql:250-280` — nullable catalog FKs and payment schema.
- `HEAD:src/lib/services/orderService.ts:782-790` — historical snapshot-only item insert.
- `src/lib/services/orderService.ts:1201-1216` — dirty-workspace item insert including IDs.
- `src/lib/services/orderService.ts:1494-1502` — dirty-workspace atomic RPC payload.
- `supabase/migrations/016_create_order_atomic.sql:768-779` — atomic item insert including IDs.
- `HEAD:src/app/api/orders/payment/route.ts:76-104` — historical order-first/invalid payment insert.
- `HEAD:src/app/api/webhook/sepay/route.ts:141-162` — historical SePay order-first/invalid payment insert.
- `src/lib/services/paymentRecordService.ts:56-95` — dirty-workspace payment insert/dedupe behavior.
- `src/app/api/orders/payment/route.ts:196-231` — dirty-workspace insert-first admin flow.
- `src/app/api/webhook/sepay/route.ts:166-176,224-271` — dirty-workspace early return and insert-first flow.
- `supabase/migrations/013_fix_rls_orders_customers_payment.rls.sql:17-70` — broad runtime INSERT policies.
- `origin/main:supabase/migrations/022_revoke_runtime_order_dml.sql:11-21` — later revoke/drop policies.
- `origin/main:supabase/migrations/023_payment_integrity.sql:77-151` — later payment indexes and anon revoke.
- `origin/integrated/r1-recon-p0a3-security:supabase/migrations/027_close_runtime_read_and_rpc_bypasses.sql:11-43` — separate-branch read/RPC hardening.
- `supabase/reset_test_data.sql:8-32` — destructive local reset script (not executed).

### Local verification command

```powershell
node --test tests/orderItemMapping.test.ts tests/atomicOrderRpc.test.ts tests/orderServiceIdempotency.test.ts tests/paymentRecordService.test.ts tests/paymentConfirmServerFirst.test.ts tests/patchPaymentBypassClosed.test.ts tests/paymentBypassFollowup.test.ts tests/resurrectionGuard.test.ts tests/reconciliationPayments.test.ts tests/migration016Source.test.ts tests/migration020Source.test.ts
```

Result: **122 pass, 0 fail, 0 skipped**, duration about 1.21 seconds. These are local unit/mock/source tests and are not database or Production verification.
