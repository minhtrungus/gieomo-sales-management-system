# Session 7 — Independent Regression & Security Batch (2026-10-13)

> Tiếp theo Session 6. Phiên này revalidate Session 6, chọn 1 defect độc lập (không phụ thuộc SKU/payment policy), fix + regression test + security spot-check.
> Production verdict: **NO-GO**.

## 1. Initial repository checkpoint

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Staged | 0 |
| Porcelain | 131 (48 unstaged / 83 untracked) |
| `git diff --check` | exit 0 |
| Baseline tests | 551 tests, 511 pass / 0 fail / 40 skip, exit 0 |
| `tsc --noEmit` | exit 0 |

## 2. Session 6 revalidation

Đã xác minh lại toàn bộ Session 6 changes:

| Check | Result |
|---|---|
| `016:486` bỏ `pr.sku` | ✅ `SELECT pr.product_id, pr.name, pr.price, pr.status` |
| `016:596` `'sku_snapshot', null` | ✅ dòng product-only để NULL |
| `016:507` variant vẫn đọc `v.sku` | ✅ `SELECT v.variant_id, v.product_id, v.name, v.sku, v.price, v.stock` |
| `016:440/516` `jsonb_object_keys` + `count(*)` | ✅ thay thế `jsonb_object_length` (PG 18 compatible) |
| `orderService.ts:803` bỏ `sku` khỏi select | ✅ `.select("product_id, name, price, status")` |
| `orderService.ts:821` `sku_snapshot: null` | ✅ |
| Concurrency test dùng COMMIT/ROLLBACK riêng | ✅ clientA COMMIT, clientB ROLLBACK |
| `atomicOrderPg` trên `gieomo_session6_rehearsal` | **7/7 PASS**, exit 0 |
| `migration016Source.test.ts` | **12/12 PASS**, exit 0 |
| Full suite | **551/511/0/40**, exit 0 |

`jsonb_object_keys` semantics: `jsonb_object_keys('{}'::jsonb)` → 0 rows → `count(*)` = 0. `v_combo_rows` và `v_variant_rows` khởi tạo `'{}'::jsonb` → không null. An toàn.

## 3. Defect đã chọn: `Number(flatShippingFee) || 25000` nuốt phí ship = 0

### Phân tích lựa chọn

Từ research findings, các defect được đánh giá:

| Defect | Impact | Reproducible | Independent | Chọn? |
|---|---|---|---|---|
| A1: `\|\| 25000` nuốt phí ship 0 | Money-affecting, admin cấu hình free ship bị charge 25000đ | Trivial | ✅ | **YES** |
| A3: Checkout submit voucher code thay vì validated voucher | Order failure | Trivial | ✅ | Không (UI flow phức tạp hơn) |
| A2: Client defaults ≠ DB seeds | Transient, chỉ khi `/api/settings` fail | Cần mock | ✅ | Không (transient) |
| Voucher POST duplicate code overwrite | Data integrity | Trivial | ✅ | Không (cần business approve) |
| Featured combo `featured` field unused | Low impact (admin-only) | Trivial | ✅ | Không (low impact) |

**Chọn A1**: money-affecting, trivially reproducible, minimal fix, không phụ thuộc SKU/payment policy.

### Root cause

`orderService.ts:907` (legacy) và `:1446` (RPC): `Number(settings.flatShippingFee) || 25000`. Operator `||` coi `0` là falsy → fallback `25000`.

### Flow trace

1. Admin设置 `flat_shipping_fee = 0` trong settings UI (`admin/settings/page.tsx:167`: `Number(flatShippingFee) >= 0 ? ... : 15000` — cho phép 0)
2. `configService.ts:85`: `"0"` là truthy string → `Number("0")` = `0` → settings.flatShippingFee = `0`
3. Checkout hiển thị `0đ` (`checkout/page.tsx:192`: `baseShippingFee: siteSettings.flatShippingFee` → `computePricing` tính `shippingFee: 0`)
4. Server tạo đơn: `Number(0) || 25000` = `25000` → charge 25000đ
5. Customer thấy 0đ nhưng bị charge 25000đ

### Reproduction

```bash
node -e "console.log(Number(0) || 25000)"  # → 25000 (bug)
node -e "console.log(0 ?? 25000)"           # → 0 (fix)
```

## 4. Fix

`src/lib/services/orderService.ts:908` và `:1448`:

```typescript
// Trước (bug):
const baseShippingFee = Number(settings.flatShippingFee) || 25000;

// Sau (fix):
const baseShippingFee = Number(settings.flatShippingFee ?? 25000);
```

`??` (nullish coalescing) chỉ fallback khi `null`/`undefined`, giữ nguyên `0`.

## 5. Regression test

`tests/shippingFeeZero.test.ts` — 4 tests:

| Test | Purpose |
|---|---|
| Behavioral demo | `Number(0) \|\| 25000` = `25000`, `0 ?? 25000` = `0` |
| Source contract | `orderService.ts` không dùng `\|\| 25000`, phải dùng `??` hoặc `!= null` |
| Both paths | Cả legacy và RPC path đều fix |
| configService | String `"0"` parse thành `0` (không fallback default) |

**Trước fix**: 2/4 FAIL (source contract + both paths).
**Sau fix**: 4/4 PASS.

## 6. Security spot-check

| Check | Result |
|---|---|
| Auth bypass introduced? | Không — fix chỉ thay `||` → `??`, không đụng auth |
| Sensitive data exposed? | Không |
| Server-side only? | ✅ — chỉ `orderService.ts`, không sửa client |
| Other money `\|\|` patterns? | `Number(stock) \|\| 0`, `Number(price) \|\| 0`, `Number(threshold) \|\| 0` — tất cả an toàn (0 là giá trị hợp lệ) |
| New attack surface? | Không |

## 7. Tests run

| Command | Exit | Result |
|---|---|---|
| `node --test tests/shippingFeeZero.test.ts` (trước fix) | 1 | **2/4 FAIL** (regression detected) |
| `node --test tests/shippingFeeZero.test.ts` (sau fix) | 0 | **4/4 PASS** |
| `node --test "tests/**/*.test.ts"` | 0 | **555 tests, 515 pass / 0 fail / 40 skip** |
| `npx.cmd tsc --noEmit` | 0 | clean |
| `npx.cmd eslint tests/shippingFeeZero.test.ts` | 0 | clean |
| `git diff --check` | 0 | clean |

## 8. Files changed

| File | Change |
|---|---|
| `src/lib/services/orderService.ts:908,1448` | `\|\| 25000` → `?? 25000` (2 dòng) |
| `tests/shippingFeeZero.test.ts` | Mới — 4 regression tests |

## 9. Remaining risks and blockers

- **A3** (checkout submit voucher code thay vì validated voucher) — chưa fix, cần UI flow test
- **A2** (client defaults ≠ DB seeds) — transient, cần operator verify production seeds
- **Voucher POST duplicate code overwrite** — cần business approve trước khi fix
- **`max_discount_amount` dead code** — latent, không user impact hiện tại
- R1/RLS/P0-A3 vẫn BLOCKED trên business decisions

## 10. Test evidence level

- **Source-tested**: contract test (`shippingFeeZero.test.ts`)
- **Runtime-tested**: behavioral demo (Node.js operator behavior)
- **Database-tested**: không (fix là TS-only, không đụng SQL)
- **API-tested**: không (fix là server-side service, không đổi API contract)
- **E2E-tested**: không

## 11. Final Git state

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Staged | 0 |
| Porcelain | 132 (+1: `tests/shippingFeeZero.test.ts`) |
| `git diff --check` | exit 0 |
| Commit | NOT PERFORMED |
| Push | NOT PERFORMED |
| Deploy | NOT PERFORMED |

## 12. Production verdict

**NO-GO.**

## 13. Next-session instructions

1. Fix A3: checkout `voucher_code: voucherApplied || formData.voucher_code` → chỉ gửi `activeVoucher?.code`
2. Investigate voucher POST duplicate code overwrite (cần business approve)
3. Operator verify production `flat_shipping_fee` seed value
4. R1/RLS/P0-A3: chờ business decisions
