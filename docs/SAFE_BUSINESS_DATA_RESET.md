# SAFE BUSINESS DATA RESET — audit và phương án chờ quyết định

Ngày audit: 2026-10-12. Trạng thái: **NEEDS DECISION**.

Ngày ghi nhận nguyên tắc: 2026-10-12 — **DECIDED FOR PLANNING**. Việc tạo SQL xóa và thực thi vẫn **BLOCKED** bởi các điều kiện chưa đáp ứng; phê duyệt thực thi là **PENDING USER APPROVAL**.

**Không phải hướng dẫn thực thi reset. Không có SQL xóa dữ liệu được tạo.**
Các câu SQL bên dưới chỉ là truy vấn đọc dự kiến cho operator review; chưa chạy.
Không kết nối DB/Production, không đọc `.env`/credentials, không gọi API thật.

## Nguyên tắc được ghi nhận cho lập kế hoạch

Các nguyên tắc dưới đây được ghi nhận theo yêu cầu RECORD RESET DECISIONS. Đây là phạm vi lập kế hoạch, **không phải phê duyệt tạo SQL xóa, thực thi reset hoặc thao tác môi trường thật**.

| Trạng thái | Nhóm | Nguyên tắc |
|---|---|---|
| **DECIDED FOR PLANNING** | Customers | Giữ customer còn liên kết với `workshop_registrations`. Giữ customer chưa xác định nguồn gốc hoặc chưa chứng minh thuộc các đơn cần reset. Không xóa toàn bộ `customers`; không xóa tài khoản thành viên/quản trị dùng chung. |
| **DECIDED FOR PLANNING** | Inventory/vouchers | Đợt reset đầu tiên giữ nguyên stock, lịch sử nhập/xuất/kiểm kê và `vouchers.times_used`. Không gọi cancellation RPC hoặc logic tự hoàn kho/giảm quota. Đây là bảo toàn số liệu hiện tại, **chưa khẳng định khớp với lịch sử sau reset**. |
| **DECIDED FOR PLANNING** | Cache/metrics/audit | Chỉ xem xét cleanup sau khi xác định chính xác bảng/key, nguồn dữ liệu, phạm vi và tác động. Giữ nguyên audit logs; không xóa dựa trên tên bảng hoặc suy đoán. |
| **DECIDED FOR PLANNING** | Receipt images | Chưa xóa chứng từ trong Supabase Storage. Nếu cần dọn, lập danh sách object chính xác và xin phê duyệt riêng; không mở rộng sang bucket hoặc asset dùng chung. |
| **DECIDED FOR PLANNING** | Môi trường/backup | Chưa tạo hoặc chạy SQL xóa trước khi người dùng xác định local/staging/production. Trước mọi thao tác phá hủy phải xác minh backup khôi phục được và có phương án rollback. Không tự kết nối DB, chạy SQL, gọi API hoặc thao tác Production. |
| **PENDING USER APPROVAL** | Thực thi | Chưa duyệt tập order IDs/records, kế hoạch xử lý `order_idempotency`, cleanup cache/metrics hay thao tác môi trường. Mọi thực thi reset cần phê duyệt riêng sau review; ghi nhận nguyên tắc không cấp quyền thực thi. |
| **BLOCKED** | Điều kiện | Chưa có môi trường đích, bằng chứng backup/restore và rollback, phạm vi đơn hàng, phương án `order_idempotency`, hoặc xác minh schema/FK/triggers thực tế. Không tạo SQL phá hủy khi các điều kiện này còn thiếu. |

Batch ghi nhận này chỉ sửa tài liệu này. Độc lập với Pre-push Release Gate: không thay kết luận/bằng chứng audit push, không yêu cầu reset trước push và không thực hiện push trong batch.

## 1. Baseline và giới hạn bằng chứng

- Repository Gieo Mơ; branch `main`.
- HEAD `1c51af625a575a41733d59b29cc9be9ae0892c60`.
- Baseline lịch sử trước task tạo tài liệu audit: staged 0; 40 modified, 1 deleted, 64 untracked (`-uall`).
- 104 file dirty còn tồn tại đã được ghi nhận hash trong bộ nhớ trước khi tạo tài liệu.
- Chỉ tạo tài liệu này; không sửa ứng dụng, migration, script reset cũ hoặc candidate/cache.
- Trước batch RECORD RESET DECISIONS: HEAD/branch không đổi, staged 0; 40 modified, 1 deleted, 65 untracked. Tài liệu này đã tồn tại và còn untracked; chỉ cập nhật nội dung của nó, không ghi đè các file khác.
- Candidate payment R1/R2 trong `node_modules/.cache/gieomo-payment-only-20261012/` chưa tích hợp vào source chính. Audit này dùng source chính hiện tại.
- **Source-verified**: mô tả dưới đây dựa trên migrations 001–020 và code hiện tại, không phải catalog DB đang chạy.
- **Unknown**: môi trường reset, deployment SHA, migration thực tế, schema drift, số lượng bản ghi, trigger/rule/view/function ngoài repository, backup và khả năng restore.
- Không có **Test-verified**, **DB-test-verified** hoặc **Production-verified** cho reset này.

Đã đọc toàn bộ `CODEX_PROJECT_HANDOFF.md`, skill `gieomo-database-schema`, schema gốc và các định nghĩa/dependency liên quan; đối chiếu hướng dẫn maintenance, multi-warehouse và phần vận hành/backup trong development playbook. Tài liệu multi-warehouse có DDL đề xuất, không phải bằng chứng bảng đã tồn tại.

## 2. Bảng thuộc phạm vi nghiệp vụ

| Bảng | PK và dependency đã xác minh | Phương án dự kiến / lý do |
|---|---|---|
| `orders` | `order_id` UUID; `order_code` UNIQUE; `customer_id` NOT NULL FK → customers; seller/creator/shipper → members; voucher → vouchers; pickup point → pickup_points | Xóa các đơn thuộc phạm vi reset được duyệt. Dữ liệu nhận/giao hàng, địa chỉ snapshot, ghi chú và ba trạng thái nằm trong row này. |
| `order_items` | `order_item_id` UUID; `order_id` NOT NULL FK → orders, ON DELETE CASCADE; product/variant/combo FK → catalog | Xóa chi tiết và snapshot của đơn trong phạm vi. Xóa child không xóa ngược catalog. |
| `payments` | `payment_id` UUID; `order_id` NOT NULL FK → orders, ON DELETE CASCADE; `confirmed_by` FK → members | Xóa payment records của đơn trong phạm vi; method/amount/status/transaction_code là dữ liệu giao dịch. |
| `shipments` | `shipment_id` UUID; `order_id` NOT NULL FK → orders, ON DELETE CASCADE; assigned_shipper → members | Xóa tracking, COD, tiến trình giao/nhận và thông tin vận chuyển của đơn trong phạm vi. |
| `order_status_history` | `id` UUID; `order_id` NOT NULL FK → orders, ON DELETE CASCADE; changed_by → members | Xóa lịch sử order/payment/delivery của đơn trong phạm vi. Đây là bảng khác với `audit_logs`. |
| `customers` | `customer_id` UUID; phone UNIQUE; không có FK sang members/auth trong schema gốc | **DECIDED FOR PLANNING:** chỉ xét hồ sơ đã chứng minh phát sinh từ các đơn cần reset; giữ customer có workshop reference và customer chưa rõ nguồn gốc. Không xóa toàn bảng. Tập records còn chờ duyệt. |
| `order_idempotency` nếu migration 015 có thật | `idempotency_key` TEXT PK; `order_id` nullable FK → orders ON DELETE SET NULL; `response_json`, trạng thái/lease/fingerprint | Ledger checkout cần xử lý cùng reset; không thuộc ledger kho. Cần duyệt xử lý cả row orphan/failed/in-progress, không tự coi mọi row có thể xóa khi còn request đang chạy. |

Bằng chứng: [001_initial_schema.sql](../supabase/migrations/001_initial_schema.sql), dòng 63–73, 209–317; [015_order_idempotency.sql](../supabase/migrations/015_order_idempotency.sql), dòng 12–55.

### Thứ tự dependency dự kiến, chưa phải lệnh thực thi

1. Đóng băng tập order/customer mục tiêu đã duyệt, ngăn ghi đồng thời bằng quy trình bảo trì riêng.
2. Xử lý ledger `order_idempotency` đúng phạm vi trước khi xóa order.
3. Xóa rõ từng nhóm child của order: shipments, payments, order_status_history, order_items.
4. Xóa orders.
5. Chỉ xóa customers đã xác minh thuộc phạm vi và không có dependency dùng chung chưa được duyệt.

Không dựa vào cascade để tự mở rộng phạm vi. FK CASCADE của child đã biết không đồng nghĩa cho phép `TRUNCATE ... CASCADE`. FK từ bảng giữ lại tới bảng mục tiêu, dù SET NULL hay CASCADE, phải là blocker khi có row bị ảnh hưởng.

## 3. Bảng và dữ liệu bắt buộc giữ

| Nhóm | Bảng/dữ liệu đã xác minh | Cách bảo toàn dự kiến |
|---|---|---|
| Catalog | `product_categories`, `products`, `product_variants`, `product_media` | Không DELETE/UPDATE; giữ tất cả cột, row, ảnh và số lượng tồn. `product_variants.stock` là tồn chuẩn trong 001. |
| Combo | `combos`, `combo_items` | Giữ toàn bộ cấu hình và FK catalog. |
| Khuyến mãi | `vouchers` | Giữ toàn bộ, **kể cả `times_used`**; không giải phóng slot khi reset. |
| Kho | `inventory_adjustments` nếu có 019/020 | Giữ row, PK, unique idempotency key, stock_before/after, delta, reason, actor và snapshot. Không FK tới orders trong định nghĩa source. |
| Kho/config | `system_configs` và các key `inventory_warehouses`, `inventory_inflow_logs`, `inventory_transfer_logs` | Không xóa hay cập nhật cấu hình hoặc lịch sử kho. |
| Tài khoản | `members`, `auth.users` và mọi bảng auth thực tế | Giữ row, auth linkage, mật khẩu/credentials, role/status, permission; không đọc giá trị nhạy cảm. |
| Vận hành | `pickup_points`, `delivery_zones`, `system_configs` | Giữ nguyên. Không reset online presence hoặc notification-state config. |
| Kiểm toán | `audit_logs` | **DECIDED FOR PLANNING:** giữ nguyên, kể cả before_data/after_data; không xóa theo entity_type. Snapshot nghiệp vụ/PII có thể còn tồn tại; không cam kết xóa PII toàn hệ thống. |
| Ngoài phạm vi | `sponsors`, `media`, `workshops`, `workshop_registrations`, `contact_messages`, `product_reviews` | Giữ nguyên; không suy đoán là dữ liệu test/khách mua hàng chỉ từ tên hoặc nội dung. |
| ID | `order_code_seq` và các sequence/identity thực tế | Không restart/reset ID. Các PK UUID không cần reset. |
| Assets/storage | Catalog/media files, bucket metadata và permission | Giữ nguyên. Ảnh biên lai có xử lý riêng ở phần 6; không xóa toàn bucket. |

Bằng chứng: 001 dòng 49–207, 320–396; 004 dòng 8–20; 008 dòng 6–19; 019 dòng 62–76; 020 dòng 50–73. Source inventory API dòng 13–15, 39–66 lưu lịch sử kho dưới dạng JSON trong `system_configs`, không có bảng warehouse vật lý được migration hiện tại tạo.

## 4. Foreign key, trigger và tồn kho

**Source-verified:**

- Xóa orders sẽ cascade tới bốn bảng child nêu trên theo 001. FK outbound tới members/vouchers/catalog không xóa parent khi xóa order hoặc item.
- `orders.customer_id` dùng NO ACTION mặc định: phải xóa order trước customer.
- `workshop_registrations.customer_id` → customers **ON DELETE SET NULL** (001 dòng 385–396). Xóa một customer dùng chung sẽ sửa row workshop cần giữ. Đây là xung đột thực tế trong schema source; số row bị ảnh hưởng chưa biết.
- `order_idempotency.order_id` → orders **ON DELETE SET NULL**; xóa order không xóa `response_json` hay ledger status. Source `replayVerifyOrder` kiểm tra order tồn tại, nên không khẳng định response cũ luôn được trả thành công; ledger vẫn có thể gây reconciliation_required và giữ dữ liệu cũ.
- Trigger ứng dụng được tìm thấy trong migrations là BEFORE UPDATE `update_updated_at` (001 dòng 400–420; 004 dòng 25–31). Không thấy trigger DELETE hoàn kho hay trigger audit DELETE trong source migrations. FK actions vẫn có thể UPDATE row giữ lại dù không có custom DELETE trigger.
- Trừ kho trong `deduct_variant_stock_atomic` (012 dòng 82–108) và `create_order_atomic` (016 dòng 715–719) là lời gọi function, không phải trigger xóa orders.
- `cancel_order_atomic` (017 dòng 182–259) hoàn stock và giảm vouchers.times_used. **Không dùng cancellation API/RPC để reset**: sẽ vi phạm yêu cầu giữ tồn/voucher.
- `adjust_variant_stock` (019/020) thay stock và ghi inventory ledger; không được gọi trong reset.
- **DECIDED FOR PLANNING:** đợt đầu giữ stock hiện tại và voucher counters, không tự hoàn lượng đã bán/đã giữ cho pending orders. Chu kỳ mới có thể còn thiếu quota; chưa khẳng định stock/counters sẽ khớp lịch sử còn lại sau reset.

**Unknown:** catalog live có thể có trigger, rule, partition, FK cross-schema, view/materialized view hoặc function khác. Không thể chứng minh DELETE giữ stock/ledger/account nguyên vẹn chỉ bằng source. Phải audit catalog live và restore rehearsal trên DB test được duyệt trước khi có SQL phá hủy.

## 5. Luồng ghi, báo cáo và đối soát

| Luồng | Source | Kết quả audit |
|---|---|---|
| Customer create/update | orderService dòng 461–500 | Upsert theo phone, có thể chạy trước khi order insert thành công. Customer orphan không đủ căn cứ để xóa; không có buyer-only discriminator trong bảng. |
| Order/items/history | orderService dòng 1069–1267; migration 016 | Ghi orders, order_items, order_status_history và ledger checkout; trừ stock/reserve voucher trong tạo đơn. |
| Payment xác nhận/webhook | payment route, SePay route, paymentRecordService | Ghi payments, cập nhật orders, ghi order_status_history/ghi chú theo nhánh. Không thấy bảng payment confirmation riêng. |
| Delivery/cancel | orders PATCH; migration 017 | Trạng thái giao/nhận trong orders, shipments schema riêng; cancel RPC thay stock/voucher. Không gọi các luồng này khi reset. |
| Reconciliation | reconciliationService dòng 218, 276, 319–320, 639 | Tính từ orders/items/payments/catalog hiện tại; không thấy bảng lưu kết quả reconciliation trong source. |
| Reports/dashboard | reports/page.tsx dòng 5–29; dashboard/page.tsx dòng 7–51 | Tính từ `getStoredOrders`, không thấy bảng revenue snapshot/materialized view trong migrations. UI không phải truy vấn trực tiếp DB mỗi lần. |
| Customer admin | customers/page.tsx dòng 26–97 | Tổng hợp orders và customer cache local; xóa DB không tự xóa cache. |
| Inventory history | inventory route; migrations 019/020 | JSON nhập/chuyển kho trong system_configs; ledger điều chỉnh kho độc lập. Giữ cả hai. |

Không tạo thao tác xóa trên bảng report/reconciliation giả định. Các materialized view/report tables ngoài source nếu operator tìm thấy phải được phân loại và duyệt riêng.

## 6. Các điều kiện còn thiếu và xung đột đã ghi nhận

1. **BLOCKED — môi trường đích:** người dùng chưa xác định local, staging hay production và deployment/version tương ứng. Chưa tạo SQL xóa, chưa kết nối để tự xác định.
2. **BLOCKED — backup/restore và rollback:** chưa có bằng chứng backup nhất quán khôi phục được, restore rehearsal và phương án rollback trước/sau COMMIT. Không coi backup tồn tại là bằng chứng khôi phục thành công.
3. **PENDING USER APPROVAL / BLOCKED — phạm vi đơn hàng:** chưa có tiêu chí/tập order IDs, cutoff hoặc phạm vi chu kỳ được duyệt. Vì thế chưa thể chốt tập child records/customer IDs và counts bị xóa.
4. **PENDING USER APPROVAL / BLOCKED — order_idempotency:** chưa xác minh bảng có thật và chưa chốt xử lý ledger gắn order mục tiêu, orphan, failed, completed, response_json, active leases hoặc request đang chạy. Không tự chọn xóa toàn bảng hay để nguyên response cũ.
5. **BLOCKED — schema/triggers thực tế:** cần catalog/FK/rule/trigger/function/partition/view thực tế và bằng chứng migration; source không chứng minh runtime. Phương án ngăn ghi/in-flight/webhook/retry cần duyệt riêng; không tự pause dịch vụ.
6. **DECIDED FOR PLANNING — customer dùng chung/không rõ nguồn gốc:** giữ nguyên. Xung đột với mục tiêu trước đó “xóa hết hồ sơ mua hàng” được ghi nhận, không tự giải quyết bằng xóa hoặc SET NULL workshop. Customer orphan có thể là hồ sơ độc lập hoặc checkout thất bại; chỉ biết không có order chưa đủ căn cứ xóa.
7. **PENDING USER APPROVAL — cache/metrics:** SQL không xử lý mọi thiết bị/tab. `gieomo_members` trộn identity/session-related fields và totalOrders/totalRevenue; syncMembersFromServer còn giữ metrics local (orderStore dòng 1705–1769). Chỉ xem xét cleanup sau khi xác minh nguồn/phạm vi/tác động; không xóa toàn key tài khoản hoặc tự chạy journal recovery.
8. **DECIDED FOR PLANNING — giữ chứng từ và audit:** proof route dòng 180–232 ghi Storage object và URL trong orders.internal_note; xóa order không xóa object. Audit logs có thể giữ JSON snapshot nghiệp vụ/PII. Giữ cả hai theo nguyên tắc hiện tại; mục tiêu “không còn dữ liệu cũ ở mọi nơi” chưa thể được cam kết. Không tự chọn xóa audit hoặc Storage để làm sạch hoàn toàn.
9. **PENDING USER APPROVAL — cleanup ảnh nếu cần sau này:** phải lập danh sách object liên quan chính xác, kiểm tra ownership/phạm vi, upload orphan/reupload và ảnh dùng chung, rồi yêu cầu duyệt riêng. Không DELETE storage.objects bằng SQL, không xóa toàn bucket. Chưa có danh sách/counts thực tế.

Các nguyên tắc planning phù hợp với FK/schema source đã đối chiếu: giữ customer có workshop reference tránh ON DELETE SET NULL ngoài phạm vi; không gọi cancellation RPC tránh hoàn stock/giảm quota. Tuy nhiên chúng chấp nhận giữ lại một phần dữ liệu lịch sử, không phải bằng chứng reset toàn hệ thống đã sạch hoặc bảo toàn được trên DB thật.

## 7. Cache phải audit riêng, không thực thi cleanup

**Source-verified:** `syncOrdersFromServer` (orderStore dòng 35–74) giữ order local dưới 10 phút không có trong response server; không lọc riêng pending như comment. Fetch thất bại có thể để cache cũ hiển thị. `getStoredPayments` dòng 1331–1389 giữ explicit payment cache ngay cả khi orders rỗng. Customer admin seed từ local cache. Reload một tab không đủ chứng minh reset toàn hệ thống.

Các key cần phân loại theo tập order/customer đã duyệt: `gieomo_orders`, `gieomo_payments`, `gieomo_customers`, `gieomo_my_order_codes`, `gieomo_customer_profile`, `gieomo_order_token_<code>`, `gieomo_proof_<code>`, `gieomo_proof_submitted_<code>`, `gieomo_cancel_journal`; sessionStorage `gieomo_checkout_idempotency_key`. Chỉ ghi tên key, không đọc giá trị token/session.

Giữ nguyên `gieomo_products`, `gieomo_combos`, `gieomo_vouchers`, `gieomo_warehouses`, `gieomo_inventory_inflow_logs`, `gieomo_inventory_transfer_logs`, auth/session keys, config và account data. `gieomo_admin_notifications` và account-derived metrics là dữ liệu hỗn hợp cần chính sách riêng, không xóa hàng loạt.

- `getStoredOrders` dòng 81–90 gọi cancellation recovery; journal có thể cập nhật stock **cục bộ** trong `gieomo_products` (dòng 823–945), không chứng minh có ghi stock DB. Phải kiểm kê journal trước khi mở lại client; không tự chạy recovery hoặc xóa stamp trong catalog.
- Inventory page dòng 66–89 tự heal inflow logs qua `saveStoredInflowLogs`; helper gửi POST inventory. Vì vậy mở dashboard/inventory không mặc nhiên là kiểm tra chỉ đọc. Kiểm chứng baseline bằng query đọc được duyệt trước; browser checks phải cô lập/chặn write paths.
- Không dùng `clearAllMockData`, kể cả truyền `false`: orderStore dòng 3827–3863 vẫn xóa vouchers, gọi clearInventoryLogs (có API writes) và luôn xóa products/combos.
- Không dùng `supabase/reset_test_data.sql`: script đó xóa catalog/combo/voucher/audit/workshop, sửa system config và restart order_code_seq, trái scope.

## 8. Truy vấn operator dự kiến — CHƯA CHẠY

Chỉ chạy khi có phê duyệt riêng và môi trường xác định. Không gửi PII/config values/password/token trong kết quả. Chỉ lấy metadata, counts và fingerprints. Nếu bảng khác source/missing, dừng, không tự bỏ qua hoặc đổi tên.

### 8.1 Inventory bảng/view và columns (metadata)

```sql
SELECT n.nspname AS schema_name, c.relname, c.relkind,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY c.relname;

SELECT table_schema, table_name, column_name, data_type, is_nullable,
       is_identity, identity_generation
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

### 8.2 Tất cả FK có đầu public, kể cả cross-schema

```sql
SELECT con.conname,
       con.conrelid::regclass AS source_table,
       con.confrelid::regclass AS target_table,
       pg_get_constraintdef(con.oid) AS definition,
       con.convalidated, con.condeferrable, con.condeferred
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace sn ON sn.oid = src.relnamespace
JOIN pg_class dst ON dst.oid = con.confrelid
JOIN pg_namespace dn ON dn.oid = dst.relnamespace
WHERE con.contype = 'f' AND (sn.nspname = 'public' OR dn.nspname = 'public')
ORDER BY con.conrelid::regclass::text, con.conname;
```

### 8.3 Trigger/rule và dependency view (metadata, chưa đủ kiểm chứng side effects)

```sql
SELECT n.nspname, c.relname, t.tgname, t.tgenabled, t.tgisinternal,
       p.oid::regprocedure AS trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
ORDER BY c.relname, t.tgname;

SELECT schemaname, tablename, rulename FROM pg_rules
WHERE schemaname = 'public' ORDER BY tablename, rulename;

SELECT DISTINCT vn.nspname AS view_schema, v.relname AS view_name,
       bn.nspname AS base_schema, b.relname AS base_relation
FROM pg_rewrite rw
JOIN pg_class v ON v.oid = rw.ev_class
JOIN pg_namespace vn ON vn.oid = v.relnamespace
JOIN pg_depend d ON d.classid = 'pg_rewrite'::regclass AND d.objid = rw.oid
JOIN pg_class b ON b.oid = d.refobjid
JOIN pg_namespace bn ON bn.oid = b.relnamespace
WHERE d.refclassid = 'pg_class'::regclass AND v.relkind IN ('v', 'm')
  AND b.oid <> v.oid AND (vn.nspname = 'public' OR bn.nspname = 'public')
ORDER BY view_schema, view_name, base_schema, base_relation;
```

Operator phải review function bodies liên quan tới trigger/custom reset/cancellation, rule bodies và partition dependencies trong môi trường an toàn; chỉ cung cấp kết luận/metadata đã loại secrets. Không tự chạy function để thử. View query không chứng minh hết dependency gián tiếp/dynamic SQL.

### 8.4 Counts trên bảng base đã xác minh tồn tại

```sql
SELECT 'orders' AS table_name, count(*) AS row_count FROM public.orders
UNION ALL SELECT 'order_items', count(*) FROM public.order_items
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'shipments', count(*) FROM public.shipments
UNION ALL SELECT 'order_status_history', count(*) FROM public.order_status_history
UNION ALL SELECT 'customers', count(*) FROM public.customers;

SELECT count(*) AS customers_total,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.orders o WHERE o.customer_id = c.customer_id
       )) AS customers_with_orders,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM public.orders o WHERE o.customer_id = c.customer_id
       )) AS customers_without_orders,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM public.orders o WHERE o.customer_id = c.customer_id
       ) AND EXISTS (
         SELECT 1 FROM public.workshop_registrations w
         WHERE w.customer_id = c.customer_id
       )) AS buying_customers_shared_with_workshops
FROM public.customers c;
```

Nếu catalog xác nhận `order_idempotency` tồn tại, operator mới chuẩn bị count theo status, null order_id, active lease, needs_recon và orphan response; không query optional table khi chưa xác nhận. Counts thực tế của mọi nhóm hiện là **Unknown**, không phải 0.

## 9. Điều kiện để tạo SQL reset sau review

Chưa được tự triển khai các bước này:

1. Chốt môi trường và chính xác tập records; áp dụng các nguyên tắc DECIDED FOR PLANNING, xác minh customer đủ điều kiện và ghi nhận ngoại lệ giữ lại. Kế hoạch order_idempotency/cache/metrics cần review riêng; ảnh và audit vẫn giữ nguyên. Nếu thay phạm vi Storage sau này phải duyệt riêng.
2. Operator cung cấp catalog và counts không chứa secrets/PII; đối chiếu với deployment/source, không coi file migrations là bằng chứng đã apply.
3. Có backup DB nhất quán gồm bảng xóa và bảng giữ, policy/function/schema; backup ảnh biên lai nếu có xử lý Storage. Bảo quản backup ngoài Git/public, giới hạn quyền truy cập.
4. Restore backup vào DB test riêng được duyệt; chứng minh phục hồi count/relationships/catalog/stock/ledger/account/config. Snapshot DB không tự khôi phục Storage hoặc browser data; phải có kế hoạch riêng.
5. Đóng băng writers bằng vận hành đã duyệt; xử lý in-flight checkout/payment/webhook/stock và retry. Không tắt RLS/trigger.
6. SQL tương lai dùng BEGIN/COMMIT và fail-closed assertions trước/sau; explicit schema/tables/record IDs, không blanket CASCADE/TRUNCATE/DROP. Không sửa tồn/voucher/accounts/config/sequence. Không gọi cancel RPC.
7. Gate trước DELETE: schema/PK/FK/trigger/rule/partition đúng bản đã duyệt; không có external row dependency tới customer/order mục tiêu; không còn active leases; số lượng mục tiêu đúng baseline; protected snapshots đúng. Unexpected object/condition phải RAISE EXCEPTION và rollback cả transaction, không skip.
8. Gate trong transaction trước COMMIT: targets không còn; bảng giữ có cùng key-set và toàn bộ row values, không chỉ cùng COUNT hoặc tổng stock. So sánh mọi variant stock, full inventory ledger, warehouse/history config, voucher counters, combo definitions, members/auth linkage/roles và permission/RLS metadata. Dùng snapshot/hash an toàn, không in password/config secrets. Bất kỳ chênh lệch nào phải rollback.
9. Rehearsal trên DB test: DELETE không gọi restore stock; FK shared/customer chặn đúng; unexpected trigger/schema drift/count drift đều abort; injected failure giữa bước rollback toàn bộ. Chỉ có static review/fake test không chứng minh các tính chất PostgreSQL này.
10. Storage/cache không nằm trong transaction DB; phải có thứ tự, lỗi/retry/restore và phê duyệt riêng. Không cam kết DB COMMIT đồng nghĩa reset toàn bộ hệ thống.

## 10. Xác minh sau reset — thiết kế chưa thực hiện

- Chạy lại counts mục tiêu theo phạm vi được duyệt: orders/items/payments/shipments/status history trong phạm vi bằng 0; customer đủ điều kiện bị xóa đúng tập, customer workshop/chưa rõ nguồn gốc giữ nguyên; ledger checkout được xác minh theo phương án chưa chốt, không mặc định xóa mọi orphan.
- Đối chiếu full snapshots/fingerprints các bảng giữ, catalog, stock từng variant, mọi row ledger, key/value cấu hình kho, voucher và tài khoản/quyền. Không chỉ nhìn UI hoặc tổng số rows.
- Xác minh report/reconciliation từ server và mọi bảng/view vật lý được phát hiện; không tạo zero summary giả. Row-cap PostgREST không được dùng làm bằng chứng tổng DB bằng 0.
- Trên client test đã cô lập write paths: reports/dashboard/payments/customers/order tracking không hiện đơn cũ; không còn merge cache dưới 10 phút; journal không tái tạo đơn/stock; thông báo catalog/contact được giữ. Những thông báo ngoài đơn cũ không phải lỗi reset.
- Inventory UI có healing hiển thị riêng nên không dùng số UI thay stock DB. Không mở app thật trong task này để kiểm tra.
- Khôi phục trước COMMIT: ROLLBACK; sau COMMIT: theo backup/restore plan đã rehearsal, không có SQL undo tổng quát. Dừng writers trước restore để không ghi đè giao dịch mới. Không chạy seed hoặc tự tạo payment records.

## 11. Kết quả và điểm dừng

Đã audit source/metadata khai báo và ghi nhận baseline hash. Chưa chạy SQL, DB/API/Production, test/build, backup/restore hoặc reset; chưa tạo file SQL có thể xóa dữ liệu. Không sửa script cũ hoặc application.

**DECIDED FOR PLANNING:** đã ghi nhận nguyên tắc giữ customers dùng chung/chưa rõ nguồn gốc, stock/voucher counters đợt đầu, audit logs và receipt images; cache/metrics chỉ được xem xét sau khi xác minh phạm vi/tác động.

**PENDING USER APPROVAL:** phạm vi records, phương án order_idempotency/cache/metrics và mọi thực thi còn chưa được duyệt. Việc duyệt tài liệu hoặc ghi nhận nguyên tắc không cho phép thực thi reset.

**BLOCKED:** chưa có môi trường đích, bằng chứng backup/restore và rollback, tập đơn hàng, phương án order_idempotency, hoặc schema/triggers thực tế. Chưa tạo SQL xóa. Trạng thái tổng thể vẫn **NEEDS DECISION**; dừng chờ review. Công việc reset này không thay đổi hoặc trở thành điều kiện trì hoãn audit push GitHub độc lập.
