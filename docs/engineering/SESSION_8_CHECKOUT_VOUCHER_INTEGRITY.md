# Session 8 — Checkout Voucher Integrity & Duplicate-Code Investigation

**Date:** 2026-10-13  
**Branch:** `main`  
**HEAD:** `1c51af625a575a41733d59b29cc9be9ae0892c60`  
**Production verdict:** NO-GO (unchanged)

---

## 1. Git State

| Field | Before | After |
|---|---|---|
| Branch | `main` | `main` |
| HEAD | `1c51af6` | `1c51af6` (unchanged) |
| Staged | 0 | 0 |
| Porcelain | 132 | 135 (+3: `voucherState.ts`, 2 test files) |

**Files changed:**
- `src/lib/checkout/voucherState.ts` — new, pure function `resolveCheckoutVoucherState`
- `src/app/checkout/page.tsx` — memo refactor + payload fix (2 lines)
- `src/app/api/vouchers/route.ts` — POST handler: upsert → insert/update split
- `tests/checkoutVoucherPayload.test.ts` — new, 12 tests
- `tests/voucherDuplicateCode.test.ts` — new, 8 tests

---

## 2. Task A — A3: Checkout gửi sai voucher code

### Root cause

`src/app/checkout/page.tsx:388` (trước fix):

```typescript
voucher_code: voucherApplied || formData.voucher_code || null,
```

- `voucherApplied` (line 91): `string | null` — chỉ được set khi user bấm "Áp dụng" (line 226) hoặc qua URL param (line 100)
- `formData.voucher_code` (line 87): `string` — giá trị input thô

**Defect:** Nếu user nhập mã nhưng không bấm Áp dụng, `voucherApplied` là null → payload fallback về `formData.voucher_code` (giá trị thô). Nếu mã không tồn tại trong danh sách voucher đã lưu, `activeVoucher` là null (không hiển thị giảm giá), nhưng payload vẫn gửi mã thô → server reject toàn bộ đơn hàng với `B1B:VOUCHER_UNAVAILABLE`.

### Fix

1. Tạo `src/lib/checkout/voucherState.ts` — hàm thuần `resolveCheckoutVoucherState` chỉ resolve từ `voucherApplied` (không fallback về `formData.voucher_code`).
2. Sửa memo `activeVoucher` trong checkout page dùng hàm thuần.
3. Sửa payload: `voucher_code: activeVoucher?.code || null`.

### Bằng chứng

`tests/checkoutVoucherPayload.test.ts` — 12 tests, tất cả PASS:

| Test | Trạng thái | Kỳ vọng |
|---|---|---|
| A3-1 | Chưa nhập voucher | `null` |
| A3-2 | Nhập mã không tồn tại, chưa áp dụng | `null` (không gửi mã rác) |
| A3-3 | Nhập mã hợp lệ, chưa bấm Áp dụng | `null` (chỉ gửi khi xác nhận) |
| A3-4 | Áp dụng thành công | Gửi đúng mã đã áp |
| A3-5 | URL param `?voucher=SUMMER20` | Tự áp dụng, gửi đúng mã |
| A3-6 | Đổi voucher (applied=SUMMER20, form=NEWCODE) | Vẫn gửi SUMMER20 |
| A3-7 | Xóa voucher | `null` |
| A3-8 | Voucher hết hạn | `null` |
| A3-9 | Voucher yêu cầu đơn tối thiểu, subtotal thấp | `null` |
| A3-10 | Voucher inactive | `null` |
| A3-11 | Mã có khoảng trắng thừa | Trim + uppercase vẫn khớp |
| A3-12 | Voucher hết lượt sử dụng | `null` |

---

## 3. Task B — Duplicate voucher code

### Root cause

`src/app/api/vouchers/route.ts:45-49` (trước fix):

```typescript
const { data, error } = await supabase
  .from("vouchers")
  .upsert(payload, { onConflict: "code" })
  .select()
  .single();
```

- `vouchers.code` có `UNIQUE CONSTRAINT` tại DB (xác nhận qua `\d vouchers` trên rehearsal DB).
- `upsert` với `onConflict: "code"` **ghi đè im lặng** voucher hiện có thay vì reject.
- `saveNewVoucher` và `updateStoredVoucher` đều POST cùng endpoint.

**Hậu quả:** Tạo voucher mới với mã đã tồn tại → voucher cũ bị ghi đè. Đổi mã voucher A sang mã đang thuộc voucher B → voucher B bị ghi đè.

### Fix

Tách POST handler thành 2 nhánh:
1. **Update** (`payload.voucher_id` được cung cấp): kiểm tra mã có thuộc voucher khác không → reject 409 nếu có. Update theo `voucher_id`.
2. **Create** (không có `voucher_id`): kiểm tra mã đã tồn tại → reject 409. Insert (không dùng upsert). Xử lý race qua error code `23505` (UNIQUE violation) → reject 409.

### Bằng chứng

`tests/voucherDuplicateCode.test.ts` — 8 tests, tất cả PASS:

| Test | Mô tả | Kỳ vọng |
|---|---|---|
| VC1 | Tạo voucher mới | 200, success |
| VC2 | Tạo trùng mã | 409, không insert |
| VC3 | Update giữ nguyên mã | 200, thành công |
| VC4 | Update A sang mã của B | 409, B không bị ghi đè |
| VC5 | Update A sang mã mới | 200, thành công |
| VC6 | Race: insert bị 23505 | 409, không thành công giả |
| VC7 | Mã normalize trim+uppercase | 409 khi trùng |
| VC8 | Không dùng upsert | Không có action `upsert` |

---

## 4. Validation

| Check | Exit | Result |
|---|---|---|
| `node --test tests/checkoutVoucherPayload.test.ts` | 0 | **12/12 PASS** |
| `node --test tests/voucherDuplicateCode.test.ts` | 0 | **8/8 PASS** |
| `node --test "tests/**/*.test.ts"` | 0 | **575 tests, 535 pass / 0 fail / 40 skip** |
| `npx.cmd tsc --noEmit` | 0 | clean |
| `eslint` (new files) | 0 | clean |
| `eslint` (changed files) | 1 | Pre-existing baseline (route.ts: 5 `any`, checkout: set-state-in-effect) |
| `git diff --check` | 0 | clean |

**Baseline comparison:** route.ts có đúng 5 `any` occurrences trước và sau fix (baseline xác nhận qua `git show HEAD`). Checkout page diff chỉ thay đổi memo + payload line, không thêm `any` hay setState mới.

---

## 5. Giới hạn chưa kiểm chứng

1. **Không test real DB:** Tests dùng mock Supabase client. UNIQUE constraint đã xác nhận qua `\d vouchers` trên rehearsal DB nhưng không test insert race trên real DB.
2. **Không test concurrent POST:** Race condition được xử lý qua error code `23505` nhưng chưa test với 2 request đồng thời trên real DB.
3. **PATCH path không đổi:** PATCH handler vẫn dùng `eq("code", id.toUpperCase())` — không có kiểm tra trùng mã khi update. Đây là scope riêng, cần investigate thêm.
4. **Client-side `saveNewVoucher` vẫn gửi `voucher_id` giả:** `vouch-${Date.now()}` không phải UUID → `buildVoucherPayload` không include `voucher_id` → luôn đi nhánh create. Cần verify admin flow không bị break.

---

## 6. Blockers

1. **R1 payment integrity:** split/under/overpayment, idempotency, webhook/admin race — chờ business approve.
2. **RLS activation:** draft migration 021 chưa approve.
3. **P0-A3:** quantity/line/aggregate limits chưa approve.
4. **Production `products.sku`:** cần operator verify.
5. **PATCH voucher code change:** cần investigate xem update mã có cần kiểm tra trùng không.

---

## 7. Đề xuất Session 9

1. **Investigate PATCH voucher code change:** PATCH handler cho phép đổi mã mà không kiểm tra trùng. Cần xác định có cần fix không.
2. **Test concurrent voucher create trên real DB:** Dùng rehearsal DB để test race condition với 2 request đồng thời.
3. **Verify admin voucher flow:** Đảm bảo `saveNewVoucher` (gửi `vouch-${Date.now()}`) và `updateStoredVoucher` (gửi UUID) vẫn hoạt động đúng với handler mới.
4. **R1/RLS/P0-A3:** Chờ business decisions.

---

**Không commit. Không push. Không deploy. Production vẫn NO-GO.**
