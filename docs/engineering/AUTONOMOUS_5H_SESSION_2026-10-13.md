# Autonomous 5-Hour Session — 2026-10-13

> Session tiếp theo sau Session 5 (SKU root cause investigation). Phiên này **triển khai phương án A** (loại bỏ tham chiếu `products.sku` không tồn tại) và sửa defect thứ hai `jsonb_object_length` bị che khuất.
> Production verdict: **NO-GO**.

## 1. Initial repository checkpoint

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Staged | 0 |
| Unstaged | 48 |
| Untracked | 83 |
| Porcelain total | 131 |
| `git diff --check` | exit 0 |

## 2. Files/reports inspected

- `docs/engineering/ORDER_ATOMIC_SKU_SCHEMA_INCOMPATIBILITY.md` (Session 5)
- `docs/engineering/R1_PAYMENT_INTEGRITY_REMEDIATION.md`
- `docs/engineering/RLS_P0A3_REMEDIATION.md`
- `supabase/migrations/016_create_order_atomic.sql`
- `src/lib/services/orderService.ts`
- `tests/atomicOrderPg.integration.test.ts`
- `tests/migration016Source.test.ts`
- `scripts/postgres/bootstrap_supabase_test_roles.sql`

## 3. Baseline test results

| Command | Exit | Result |
|---|---|---|
| `node --test "tests/**/*.test.ts"` | 0 | 548 tests, 508 pass / 0 fail / 40 skip |
| `npx.cmd tsc --noEmit` | 0 | clean |
| `npx.cmd eslint` (full repo) | 1 | 706 problems (503 errors, 203 warnings) — pre-existing baseline |

## 4. Defects reproduced and fixed

### Defect 1 — `products.sku` does not exist (SQLSTATE 42703)

**Root cause:** `016_create_order_atomic.sql:486` SELECT `pr.sku` — cột không tồn tại trong schema 001. Cùng gốc với `orderService.ts:803` legacy path.

**Reproduced:** `SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status FROM public.products AS pr LIMIT 1;` → `42703: column pr.sku does not exist`, psql exit 1.

**Fix (Option A — Session 5 recommendation):**
- `016:486` — bỏ `pr.sku` khỏi SELECT (chỉ cần `name/price/status`)
- `016:596` — `'sku_snapshot', null` thay vì `v_obj->>'sku'` (dòng product-only → NULL, schema 001 nullable)
- `orderService.ts:803` — bỏ `sku` khỏi `.select(...)`
- `orderService.ts:821` — `sku_snapshot: null` thay vì `product.sku || null`

**Regression test:** `tests/migration016Source.test.ts` — 2 test mới:
- `SKU — 016 chỉ dùng product_variants.sku, không tham chiếu products.sku`
- `SKU — orderService legacy path không select products.sku`

**Runtime evidence:** `atomicOrderPg.integration.test.ts` trên `gieomo_session6_rehearsal` → **7/7 PASS** (trước fix: 1/7).

### Defect 2 — `jsonb_object_length` không tồn tại trong PostgreSQL 18 (SQLSTATE 42883)

**Root cause:** `016:440` và `016:516` dùng `jsonb_object_length(jsonb)` — hàm không tồn tại trong PG 18.6. Defect này bị che khuất bởi Defect 1 (lỗi `pr.sku` ở line 260 ngăn hàm reaching line 291).

**Reproduced:** Sau khi fix Defect 1, `create_order_atomic` fail với `42883: function jsonb_object_length(jsonb) does not exist`.

**Fix:** Thay `jsonb_object_length(x)` bằng `(SELECT count(*) FROM jsonb_object_keys(x))` — cùng semantics, hoạt động trên mọi PG version.

**Regression test:** `tests/migration016Source.test.ts` — 1 test mới:
- `jsonb_object_length — 016 không dùng hàm không tồn tại trong PG 18`

### Defect 3 — Test harness issues (pre-existing, masked by Defect 1)

**3a.** `atomicOrderPg:155` assert `fp[0].kind === "product"` nhưng fixture tạo variant order → assertion sai. Fix: đổi thành `"variant"` và `variantId`.

**3b.** `atomicOrderPg` concurrency test: cả 2 client ROLLBACK → cả 2 INSERT thành công (không thấy claim của nhau) → cả 2 trả `"created"`. Fix: clientA COMMIT (claim visible), clientB ROLLBACK (cleanup).

**3c.** `atomicOrderPg` P0-2 test: dùng SAVEPOINT nhưng `withClient` không BEGIN. Fix: thêm `BEGIN` trước SAVEPOINT.

## 5. Files changed

| File | Change |
|---|---|
| `supabase/migrations/016_create_order_atomic.sql` | Bỏ `pr.sku` (line 486); `'sku_snapshot', null` (line 596); `jsonb_object_length` → `jsonb_object_keys` + `count(*)` (lines 440, 516) |
| `src/lib/services/orderService.ts` | Bỏ `sku` khỏi select (line 803); `sku_snapshot: null` (line 821) |
| `tests/atomicOrderPg.integration.test.ts` | Fix fingerprint assertion (line 155-156); fix concurrency test (clientA COMMIT); fix P0-2 test (thêm BEGIN) |
| `tests/migration016Source.test.ts` | Thêm 3 regression tests: SKU contract, jsonb_object_length, orderService SKU contract |

## 6. Tests run with commands, exit codes, and outcomes

| Command | Exit | Result |
|---|---|---|
| `node --test tests/migration016Source.test.ts` | 0 | **12/12 PASS** (trước: 9/9) |
| `node --test tests/atomicOrderPg.integration.test.ts` (rehearsal) | 0 | **7/7 PASS** (trước: 1/7) |
| `node --test tests/paymentIdempotencyPg.integration.test.ts` (rehearsal) | 0 | **4/4 PASS** |
| `node --test "tests/**/*.test.ts"` | 0 | **550 tests, 510 pass / 0 fail / 40 skip** (trước: 548/508/0/40) |
| `npx.cmd tsc --noEmit` | 0 | clean |
| `npx.cmd eslint` (full repo) | 1 | 706 problems (503 errors, 203 warnings) — pre-existing baseline, không mới |
| `npx.cmd next build` | 0 | clean |
| `git diff --check` | 0 | clean |

## 7. Database rehearsal evidence

- Cluster: `127.0.0.1:55439`, `session4_admin`, data dir `.tmp/postgres-session4-data`, PG 18.6
- Database mới: `gieomo_session6_rehearsal` (tạo mới trong cùng cluster, không đụng evidence DBs)
- Bootstrap: `scripts/postgres/bootstrap_supabase_test_roles.sql`
- Migration sequence: `001 → 002 → 011 → 013 → 014 → 015 → 016 → 018` — tất cả exit 0
- `create_order_atomic` function created successfully
- Schema verified: `products.sku` count = 0, `product_variants.sku` count = 1, `order_items.sku_snapshot` nullable = YES

## 8. Unresolved business decisions

1. **Schema production:** `products` có `sku` không? (operator xác minh — điều kiện tiên quyết để confirm Option A là đúng cho production)
2. **`sku_snapshot = NULL` cho dòng product-only** — đã chấp nhận kỹ thuật (mọi consumer null-safe), nhưng cần business confirm cho admin display/đối soát/kế toán
3. **Có tồn tại "SKU cấp sản phẩm"** như dữ liệu nghiệp vụ riêng? (Nếu có → Option B, cần nguồn điền)
4. **Cách sửa áp dụng production:** migration mới (023) hay hiệu chỉnh 016? (016 chưa commit/apply production)

## 9. Known regressions or risks

- Không có regression mới: full suite 510 pass / 0 fail / 40 skip
- `orderService.ts` có 6 pre-existing `any` lint errors (lines 766, 778, 786, 1317, 2100, 2147) — không phải do session này
- Migration 016 là untracked file (chưa commit) — sửa trực tiếp an toàn

## 10. Remaining blockers

- P0-A3: business limits (per-line quantity, line count, aggregate) chưa approve
- R1: split payment / underpayment / overpayment / admin-vs-webhook policy chưa approve
- RLS activation: draft 021 chưa được approve để activate trên production

## 11. Final Git status

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Staged | 0 |
| Porcelain | 131 (48 unstaged / 83 untracked) |
| `git diff --check` | exit 0 |
| Commit | NOT PERFORMED |
| Push | NOT PERFORMED |
| Deploy | NOT PERFORMED |

Changed paths (unstaged):
- `supabase/migrations/016_create_order_atomic.sql`
- `src/lib/services/orderService.ts`
- `tests/atomicOrderPg.integration.test.ts`
- `tests/migration016Source.test.ts`

## 12. Production verdict

**NO-GO.**

- SKU/schema defect đã fix và verified trên local rehearsal (7/7 atomicOrderPg PASS)
- Chưa có approval để apply migration lên production
- R1/RLS/P0-A3 vẫn BLOCKED trên business decisions

## 13. Exact next actions for the next session

1. **Operator xác minh production schema:** `SELECT count(*) FROM information_schema.columns WHERE table_name='products' AND column_name='sku';` — nếu count > 0 thì production có cột này và cần xem lại Option A
2. **Business approve:** `sku_snapshot = NULL` cho dòng product-only
3. **Sau khi approve:** tạo migration mới (023) `CREATE OR REPLACE FUNCTION create_order_atomic` với fixes, hoặc amend 016 (vì chưa commit)
4. **R1 next:** approve split payment policy → implement atomic apply RPC (draft 022 đã có ledger)
5. **P0-A3 next:** approve quantity/line/aggregate limits → implement v2 RPC
