# H29 — Dependency Matrix: App × DB Migration State × Critical Flows (Gieo Mơ)

Trạng thái: **DEPENDENCY MATRIX — COMPLETE**. Phạm vi: đọc toàn bộ migrations 022–030 + grep code `src/**` — read-only.

## 1. Nội dung từng migration 021–030 (điều cốt lõi cho tương thích app)

| # | Tên file | Đóng góp schema/runtime | Điểm chạm app |
|---|---|---|---|
| 021 | `reconcile_v015_idempotency` (supabase/migrations/021*) | order_idempotency v015 (idempotency_key TEXT + lease 90s) → shape v025 (`scope_key` TEXT, `idempotency_key` UUID, `retain_until`); tạo bảng `order_idempotency_v015_archive`; `orders.idempotency_key` (text) → `idempotency_key_v015` | Writer v25 đọc/ghi `scope_key` |
| 022 | `revoke_runtime_order_dml` | REVOKE INSERT/UPDATE/DELETE trên customers/orders/order_items/payments/order_status_history cho anon+authenticated; DROP các policy "Public insert …" | **Chặn hẳn đường legacy writer** — phải cùng deploy code mới |
| 023 | `payment_integrity` | Bảng `payment_events`; RPC `apply_payment_event(jsonb)` (SECURITY DEFINER); FORBID anon; invariant single-paid | Webhook SePay + admin confirm |
| 024 | `repair apply_payment_event` | Thay thân `apply_payment_event` giữ hợp đồng JSONB cũ (idempotent với 023 cũ nếu có) | — |
| 025 | `atomic_idempotent_order_creation` | `order_idempotency` (CREATE IF NOT EXISTS — trông vào 021); `create_order_atomic_v25(jsonb)` + wrapper `create_order_atomic(jsonb)`; lock sản phẩm/variant; OUTCOME JSONB (created/existing/…) | `POST /api/orders` (WIP V2) |
| 026 | `atomic_order_cancellation` | `cancel_order_atomic(jsonb)` (reversal 1 lần: stock, voucher); DO-guard cần cả `create_order_atomic_v25` + `create_order_atomic` + `cancel_order_atomic` | `DELETE/PATCH /api/orders` cancel |
| 027 | `close_runtime_read_and_rpc_bypasses` | Chặn đọc ẩn danh nhạy cảm + đóng các RPC bypass cũ | Ảnh hưởng route public read |
| 028 | `orders_payments_least_privilege` | GRANT/REVOKE như danh sách tối thiểu cho service_role/authenticated | Admin dashboard/members |
| 029 | `atomic_payment_rejection` | `reject_payment_atomic(jsonb)` (từ pending → failed, một lần, an toàn gọi lại) | `/api/orders/payment` reject |
| 030 | `atomic_combo_persistence` | `save_combo_atomic(jsonb)` (create/update combo 1 lần) | `POST/PATCH /api/combos` |

**Chuỗi bắt buộc:** 023→024; **021 phải trước 025** (writer v25 cần `scope_key` và `idempotency_key UUID` — trên prod thiếu 021 nên 025 không đủ điều kiện); 026 yêu cầu đủ 3 hàm (025 + 016/017 đã có); 022/027/028 phải cùng đợt deploy code (nếu revoke xong mà code cũ còn chạy → checkout chết).

## 2. Object 021–030 × tham chiếu trong `src/**` (grep, kèm dòng đầu)

| Đối tượng DB | Nơi app dùng |
|---|---|
| `create_order_atomic` (wrapper v25) | `lib/services/orderCreateAtomicV2.ts:119` (RPC), `lib/data/orderStore.ts:163` (comment/chuẩn hoá) |
| `cancel_order_atomic` | `app/api/orders/route.ts:183` |
| `apply_payment_event` | `app/api/orders/payment/route.ts:66`, `app/api/webhook/sepay/route.ts:92` |
| `payment_events` | `app/api/webhook/sepay/route.ts:55` |
| `reject_payment_atomic` | `app/api/orders/payment/route.ts:121` |
| `save_combo_atomic` | `app/api/combos/route.ts:296` |
| `order_inventory_reservations` | `lib/services/orderService.ts:91` |
| `scope_key` | `lib/services/orderCreateAtomicV2.ts:112` |
| `adjust_variant_stock` | `app/admin/inventory/page.tsx:537`, `app/api/inventory/route.ts:145`, `lib/services/inventoryAdjustService.ts:3` |
| `order_idempotency_v015_archive`, `retain_until`, `cancellation_effects_completed_at`, `inventory_reservation_recorded_at`, `idempotency_scope` | **không tham chiếu trực tiếp trong src** — dùng nội bộ SQL |

Định tuyến API liên quan: `orders`, `orders/payment`, `orders/proof`, `webhook/sepay`, `combos`, `inventory`, `members`, `auth/*`, `categories`, `products`, `pickup-points`, `vouchers`, `reviews`, `contact*`, `settings`, `upload`, `notify/email`, `admin/*`.

## 3. Ma trận App-version × DB-state × Critical Flow × Expected result

Chữ code:
- **DEPLOYED-LEGACY** = code đang chạy trên prod (thế hệ trước V2: dùng đường insert nhiều bước + writer v015 nếu có; không gửi `scope_key`).
- **WIP-V2** = tree hiện tại (`createOrderServerAtomicV2`, gửi `scope_key`, `request_hash`, đầu ra "created"; `apply_payment_event` + `reject_payment_atomic`).
- DB-A = prod hôm nay (pre-021, policies 013 còn, grants rộng, writer RPC hỏng 2 nhánh — FACT, xem forensics §5.2).
- DB-B = prod sau khi áp 021→030 đúng thứ tự + bootstrap xong.

| Flow (người dùng) | DEPLOYED-LEGACY + DB-A (hiện tại) | WIP-V2 + DB-A | DEPLOYED-LEGACY + DB-B | WIP-V2 + DB-B (mục tiêu cutover) |
|---|---|---|---|---|
| Guest checkout giỏ product/variant (đường legacy) | Hoạt động (tạo đơn, items chỉ snapshot) | Preview/tracing OK nhưng POST sẽ gọi RPC → **LỖI**: `column pr.sku`/`jsonb_object_length` (RPC prod hỏng) + payload thiếu lease_owner | Rẽ vào RPC nhưng 022 đã revoke anon-insert → legacy **CHẾT** | **OK**: RPC v25 tạo đơn nguyên tử + idempotency `scope_key` |
| Guest checkout combo | Legacy vẫn tạo combo-wise rows? (0 items combo trên data — không dùng) | RPC → FAIL (jsonb_object_length) | FAIL (revoke) | **OK**: combo branch valid theo file; fail-closed ví thiếu variant thành phần |
| Idempotent retry (gửi lại key trùng) | Không có key trên data; n/a | FAIL trước (payload lệch) | — | OK: `existing`/`created` deterministic, `order_idempotency` ghi state; retry không clone đơn |
| Cancel (BTC) | Legacy update/cancel + tự khôi phục stock thủ công | chạy path cancel `cancel_order_atomic` (v015)? — hành vi không cố định, cần smoke | RPC v026 đảm bảo reversal 1 lần | OK (cancel atomic; chỉ PROVENANCE-marked đơn) |
| Admin confirm payment (banking) | Cập nhật trực tiếp `orders.payment_status` (grants rộng còn cho phép) | Gọi `apply_payment_event` → **FAIL** (bảng/RPC chưa có) | RPC 023 có, nhưng 022/028 đã thu hẹp — legacy update trực tiếp bị chặn | OK: `payment_events` + invariant single-paid |
| Admin reject payment | Legacy update trực tiếp | Gọi `reject_payment_atomic` → FAIL | n/a | OK: pending→failed 1 lần |
| Webhook SePay (tiền về) | Legacy ghi `payments`?/history tay (d13: 39 paid thiếu event) | `payment_events` → FAIL | n/a | OK: event ledger + idempotency webhook |
| Admin save combo | Legacy upsert bảng combos | `save_combo_atomic` → FAIL | n/a | OK |
| Inventory adjust (admin) | `adjust_variant_stock` (019, đã có trên prod) hoạt động | OK (hàm không đổi ở 021–030) | OK | OK |
| Admin/members reads | Grant rộng (anon SELECT members — P1, forensics §5.1) | — | Sau 028: chặt hơn | OK + hết lộ password_hash |
| Order tracking (guest, theo code) | OK (policy read theo code) | OK | Sau 027 có thể siết thêm — cần smoke | OK (verify smoke) |

**Kết luận cốt lõi:** cây phần mềm hiện đang tương thích **không một chiều nào cả** — DEPLOYED-LEGACY chỉ sống với DB-A (nhưng Writer RPC hỏng có sẵn), WIP-V2 chỉ sống với DB-B. Cutover phải **đồng bộ hoá DB-B + deploy WIP-V2 trong cùng cửa sổ**, khoảng chống lost-update = đóng route ghi (maintenance) trong thời gian chuyển đổi.

## 4. Thứ tự / giới hạn rollback

| Item | Dùng lại được (rollback an toàn về data)? | Ghi chú |
|---|---|---|
| 023 payment_events + các event đã ghi | **KHÔNG xoá**: bảng additive phải giữ; rollback phải giữ event (tiền thật) | Không xoá event tiền; chỉ cho phép disable code path |
| 021 idempotency v015→v025 | Một hướng có điều kiện: bảng archive `order_idempotency_v015_archive` để quay lại; KHÔNG rollback khi đã có key v025 in-flight | Có checkpoint trước |
| 022/027/028 revoke/drop policy | Rollback = trả lại 013-state (policies + grants) theo script đối chiếu; dữ liệu không đổi | Kịch bản an toàn "go back để code legacy chạy" |
| 025/026/029/030 (CREATE OR REPLACE) | Quay lại body 016/017 từ file 016/017 hiện hành | Kịch an toàn như "go back để code legacy chạy" |
| Deploy code WIP-V2 | Rollback về build trước | — |
| **Cảnh báo:** các REVOKE/drop policy khi đã có sự kiện tiền thật trong `payment_events` nhưng code chưa sửa — phải có phương án giữ event ở mọi kịch bản rollback |

Rollback chi tiết từng-tier per-failure-class: `OPENCODE_H29_CUTOVER_RUNBOOK.md` §8.
