# H29 — Migration Ledger Forensics (Gieo Mơ)

Trạng thái hồ sơ: **MIGRATION LEDGER FORENSICS — COMPLETE** (mọi kết luận có grade FACT / HYPOTHESIS riêng).
Ngày: 2026-10-22. Phạm vi: read-only cục bộ, không chạm Production, không chạy cutover.
Bản sao chứng cứ: mirror prod `127.0.0.1:55442` (`gieomo_prod_rehearsal`, restore từ backup `backups/prod-20261022-20261022T080112/`), replay canonical 030 `127.0.0.1:55456`, **cluster đối chứng mới `127.0.0.1:55461` ("fresh020" — replay sạch file hiện tại 001→020)**.

---

## 1. Tóm tắt điều hành

| Câu hỏi | Trả lời | Grade |
|---|---|---|
| Ledger nào là authority cho repo này? | **Không ledger nào tồn tại.** Repo chưa từng `supabase init` (không có `supabase/config.toml`); schema `supabase_migrations` không tồn tại trong dump prod; `package.json` không có script migrate; đường chạy duy nhất của repo là `scripts/postgres/replay-canonical-migrations.ps1` (không đọc/ghi ledger nào) | FACT |
| Tại sao schema đầy đủ 001–020 nhưng ledger trống? | Lịch sử đã được áp bằng **đường thủ công ngoài CLI** (SQL editor / psql ad-hoc), không phải "chưa từng chạy" — chứng minh: schema cột của prod **giống 100%** replay 001→020 trên cluster đối chứng fresh020 (0 khác biệt tên/kiểu cột toàn bộ bảng public) | FACT (drift) / HYPOTHESIS (đường cụ thể) |
| Prod đang dừng ở migration nào? | **Trước 021.** 021 không chạy trên prod (bằng chứng shape, §5.4); 022–030 không chạy (bằng chứng policies/grants còn nguyên, §5.5) | FACT |
| Lịch sử deploy = file hiện tại? | **Không 1:1.** 3 vùng lệch statement-level được khoanh chính xác: khối members của 012, body `create_order_atomic` của 016 (3 dòng), hàm sót `rls_auto_enable` | FACT |
| Có thể bootstrap ledger bằng cách simple-mark 001–021 = applied? | **KHÔNG được mark 021.** Mark 001–020 an toàn về net-state; 021 phải chạy thật (FW transform idempotency v015→v025). Chi tiết §6 | FACT + plan |

---

## 2. FACTS được kiểm chứng trực tiếp (cách tái lập ghi ở §7)

1. `supabase/config.toml` **không tồn tại** trong repo → CLI chạy `db push` không có canvas cấu hình nào; repo chưa được init cụm migration của Supabase CLI.
2. Dump prod (`schema.sql` trong `backups/prod-20261022-20261022T080112/`) **không chứa** `supabase_migrations.schema_migrations` (truy vấn trên mirror: `ERROR: relation "supabase_migrations.schema_migrations" does not exist`). Nghĩa là Production không có bảng ledger nào để "trống".
3. `package.json` không có bất kỳ script `migrate/db push/repair`; chỉ có `test:pg:mandatory`.
4. `.temp/linked-project.json` có project ref (liên kết Supabase CLI từng được tạo); không có config.toml → liên kết không hoàn chỉnh.
5. Schema-cột: prod ⇄ fresh020 (file 001→020 chạy sạch): **0 khác biệt** tên cột và 0 khác biệt kiểu cột trên toàn bộ bảng public (script `h29-extract2.mjs`, `h29-close-checks.json`).
6. Function-body: 9/10 hàm public **IDENTICAL** sau khi chuẩn hoá whitespace giữa prod và fresh020. Ngoại lệ: `create_order_atomic` (3 dòng, §5.2) và `rls_auto_enable` (chỉ có ở prod, còn sót, §5.3).
7. Đơn hàng đang sống do **đường legacy** tạo (không phải writer RPC): 149/149 `order_items` có `product_id/variant_id/combo_id = NULL` (chỉ snapshot), `order_idempotency` 0 dòng, `orders.idempotency_key` 0 giá trị.
8. Writer RPC đã deploy trên prod **hỏng 2 nhánh runtime** (khoan trong `BEGIN…ROLLBACK` trên mirror, không commit):
   - Đơn có combo → `ERROR: function jsonb_object_length(jsonb) does not exist` (line 215);
   - Nhánh lock products (cả giỏ chỉ variant) → `ERROR: column pr.sku does not exist` (line 260) — `products` ở prod & ở file 001 đều không có cột `sku` (chỉ `product_variants.sku` có).
   → Đơn thật không thể tạo qua RPC; tất cả đơn hiện có sinh từ đường legacy insert (013 còn cho phép).
9. `anon` CÓ `SELECT` (table-level) phủ tới cột `members.password_hash` trên prod (`information_schema.column_privileges`): khối REVOKE members của 012 chưa từngg chạy (§5.1).
10. Data-test checks: `discount_type` có `freeship` (014 ✓), `product_variants.image_url` (010 ✓), FK quan hệ sản phẩm (009 ✓), 5 key social config (005 ✓), `uq_payments_order_transaction_code` (018 ✓), `uq_inventory_adjustments_idempotency_key` + cột snapshot + FK `ON DELETE SET NULL` (019/020 ✓).
11. Prod mirror không có policy nào trong schema `storage` — nhưng dump backup chỉ che phủ schema public → **007 phần storage: evidence không đủ, thiếu chứng cứ** (§8).

## 3. Nguyên nhân ledger trống — phân tích

Chuỗi sự kiện được chứng minh (FACT):

- Các object 001–020 **tồn tại với trạng thái đích trùng khớp** file hiện tại ở mức cột/schema — nghĩa là đã được áp dụng thành công theo thứ tự, nhưng **đường chạy không ghi ledger** (không bảng nào ghi lại).
- Lệch statement-level chỉ có 2 vùng (012-members, 016-body) → file 012/016 đã được áp từ **một thế hệ văn bản khác** (khoảng thời gian deploy trước đó) — hệ quả tự nhiên của "SQL editor ad-hoc không version hoá".

→ HYPOTHESIS có hỗ-trợ (bác trừ): lịch sử được áp trực tiếp bằng Supabase SQL editor / psql ad-hoc, có thể nhiều tay, từng đợt; CLI `db push` không bao giờ được chạy vì chưa init config → ledger không bao giờ được tạo (không có bảng nào để ghi). Đánh giá: cao độ tin cậy; không thể chứng minh 100% vì không có log phía platform.

## 4. Bảng phân loại 001–030

Ký hiệu scoring: "present = x/y trên prod ⇄ fresh020" (presence trùng = net-state khớp file, do later-migrations có thể drop/đổi tên: đã đối chiếu riêng).
D = thao tác phá hủy (DROP/DELETE/TRUNCATE/UPDATE); INE = có `IF NOT EXISTS`; CR = `CREATE OR REPLACE`.

| # | File (ý nghĩa) | Chứng cứ áp dụng trên prod | Re-runnable? | Destructive | Phụ thuộc | Rủi ro re-apply | Xử lý đề xuất |
|---|---|---|---|---|---|---|---|
| 001 | Initial schema (enums/tables/functions) | 34/34 ⇄ 34/34; cột khớp 100% | Không (CREATE bảng thường) | 0 | — | CREATE bảng lỗi exists | Mark applied sau khi đối soát |
| 002 | Grants & RLS | 29/33 ⇄ 28/33 (chêch lệch = policy members, §5.1) | Không | 0 | 001 | Grants lệch trạng thái (prod rộng hơn) | Mark applied; chú ý prod đang giữ grant rộng |
| 003 | system_configs + RLS CRUD | 6/8 ⇄ 6/8 (2 policy thiếu do 011/012 thay thế) | Có (INE) | 0 | 001 | thấp | Mark applied |
| 004 | contact_messages + catalog RLS | 4/11 ⇄ 4/11 (5 policy "Authenticated all" bị thế hệ sau thay) | Có (INE) | 0 | 001 | thấp | Mark applied |
| 005 | Social config keys | 5/5 key có trên prod; DML-only | Có (upsert) | 0 | 003 | thấp (DML upsert) | Mark applied |
| 006 | members (password_hash) + policies | 3/3 ⇄ 2/3 (policy members còn trên prod = drift §5.1) | Có (INE, tự sửa) | 3 (drop trigger lỗi) | 001 | thấp — nhưng **không re-apply 012-part** | Mark applied **có ghi chú drift** |
| 007 | storage buckets + RLS | **Thiếu chứng cứ** (backup không che phủ schema storage) | Có (INE) | 4 | — | — | Mark applied **có điều kiện**; kiểm tra platform trước bootstrap |
| 008 | product_reviews | 5/5 ⇄ 5/5 | Có (INE) | 0 | 001 | thấp | Mark applied |
| 009 | relationships FK | FK tồn tại (6 FK product*) | Có (INE, DO-guard) | 0 | 001/008 | thấp | Mark applied |
| 010 | image_url variant | col có | Có (INE) | 0 | 001 | thấp | Mark applied |
| 011 | RLS hardening orders/members/configs | 6/6 ⇄ 5/6 (policy members, §5.1) | Không (DROP policy vô điều kiện) | 12 | 001 | RLS lệch nếu re-apply ngoài thứ tự | Mark applied |
| 012 | stock atomic + hardening | 1/1 function có; **khối members KHÔNG chạy trên prod** (§5.1) | Không | 13 | 001 | cao nếu re-apply (mất state hiện hành) | Mark applied **với drift ghi rõ**; cutover kiểm REVOKE members trước |
| 013 | RLS orders/customers/payments | 15/15 ⇄ 15/15 | Không (drop + create) | 14 | 002 | thấp | Mark applied |
| 014 | freeship enum | enum có | Có (DO-guard) | 0 | 008 | thấp | Mark applied |
| 015 | order_idempotency v015 (idempotency_key TEXT + lease) | 2/2 ⇄ 2/2; **cột 18/18 khớp tổng thể giữa prod⇄fresh020** | Có (INE) | 1 | 013 | thấp | Mark applied |
| 016 | create_order_atomic (world writer) | function có; **body lệch 3 dòng với file hiện tại**; runtime hỏng 2 nhánh (§2.8) | Không (CREATE OR REPLACE) | 5 | 015 | cao | Mark applied **với drift**; body sẽ được 025/026 thay |
| 017 | cancel_order_atomic | function có, body IDENTICAL | CR có thể re-apply | 3 | 016 | thấp | Mark applied |
| 018 | uq_payments_order_transaction_code | index có | Có (INE) | 0 | 001 | thấp | Mark applied |
| 019 | inventory_adjustments | 2/2 ⇄ 2/2; unique index + snapshot cột có | Có (INE) | 1 | 001 | thấp | Mark applied |
| 020 | ledger delete policy + FK SET NULL | FK `deltype=n` + cột snapshot có | Có (INE, self-verify) | 1 | 019 | thấp | Mark applied |
| **021** | **reconcile idempotency v015→v025 (scope_key, uuid)** | **KHÔNG áp dụng**: prod giữ v015-shape (18 cột lease TEXT), không có `scope_key`, không có `orders.idempotency_key_v015` | FW một-hướng (rename → archive) | 0 | 015 | **bắc cầu bắt buộc trước 025** | **Chạy thật trong cutover** (không mark) |
| 022 | revoke runtime DML + drop public-insert policies | KHÔNG áp dụng: "Public insert customers/orders/…" còn nguyên | Áp theo kế hoạch | 5 | 013 | phá legacy writer — **phải đi kèm deploy code** | Chạy thật (sau backup) |
| 023 | payment_integrity (payment_events, apply_payment_event) | KHÔNG áp dụng (bảng `payment_events` vắng) | Có (INE) | 1 | 023 | thấp (additive) | Chạy thật |
| 024 | repair apply_payment_event | KHÔNG áp dụng | Có (guard regprocedure) | 0 | 023 | thấp | Chạy thật |
| 025 | order_idempotency v025 + create_order_atomic v25 (scope_key) | KHÔNG áp dụng | Có (INE) | 1 | **021**, 013 | cao nếu chạy thiếu 021 (shape lệch → writer v25 hỏng ngay) | Chạy thật (đúng thứ tự) |
| 026 | cancel_order_atomic + tri-prereq guard| KHÔNG áp dụng | Có (guard 3 regprocedure) | 4 | 025, 016/017 | thấp | Chạy thật |
| 027 | đóng bypass read/RPC | KHÔNG áp dụng | Không (revoke/drop policy) | 5 | 022 | chặn đường legacy — phải cùng deploy code | Chạy thật |
| 028 | least privilege grants | KHÔNG áp dụng (prod còn grant rộng: anon có SELECT members…) | Không (REVOKE) | 10 | 022 | chức năng có thể chặn nếu code chưa đổi | Chạy thật + smoke test |
| 029 | reject_payment_atomic | KHÔNG áp dụng | CR | 1 | 023/024 | thấp | Chạy thật |
| 030 | save_combo_atomic | KHÔNG áp dụng | INE/CR | 2 | 026 | thấp | Chạy thật |

> Chú thích chi tiết 022–030: xem `OPENCODE_H29_DEPENDENCY_MATRIX.md`.

## 5. Vùng lệch statement-level (drift) — khoanh chính xác

### 5.1 012 — khối members chưa áp (hiệu lực bảo mật)
- Trên prod: policy `Public read basic members` vẫn tồn tại; role `anon` có SELECT (table-level) cho phép truy cập cột `password_hash`.
- File hiện tại 012: `DROP POLICY` + `REVOKE SELECT ON members FROM anon, authenticated`.
- fresh020 (chạy 012-theo-file) không còn policy; prod còn → **statement cụ thể chưa chạy trên prod**.
- **Hệ quả bảo mật (P1): PostgREST anon có thể SELECT với password_hash của thành viên đang active (chỉ lọc cấp dòng: `status='active'`).** Password_hash được seed từ file 006 (giá trị đứng là plaintext trong repo).
- Cần owner quyết: sửa ngay trên prod (hotfix REVOKE; rollback = GRANT lại như cũ) hay gói vào cutover 028. → đề xuất: **hotfix ngay**, không đợi cutover.

### 5.2 016 — body writer lệch 3 dòng chuẩn hoá
So sánh line-level (LCS) prod ⇄ fresh020 của `create_order_atomic`:
1. Prod dùng helper `jsonb_object_length(v_combo_rows)` — hàm **không tồn tại** trong prod (exists ở thế hệ khác) → nhánh combo chết runtime (đã khoan thăm dò).
2. Prod `SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status FROM public.products pr` — `products` không có `sku` (ở cả prod và ở file 001) → nhánh lock products chết runtime (đã khoan thăm dò: `column pr.sku does not exist`).
3. Phiên bản file hiện tại không dùng cả hai → file ≠ deployed generation.
→ Writer RPC của prod là một **thế hệ văn bản ngoài repo**; state này sẽ được 025/026 ghi đè (CREATE OR REPLACE) khi cutover.

### 5.3 Hàm sót `rls_auto_enable`
Chỉ có trên prod; fresh020 không tạo tên này (001/006 tạo lineage khác). Không chạm runtime hiện tại; đề nghị DROP có kiểm soát trong cutover hoặc giữ yên (vô hại).

### 5.4 021 — chứng cứ "chưa áp"
- prod `order_idempotency` = 18 cột v015 (trùng fresh020 từng cột từng kiểu);
- không có `scope_key`, không có `order_idempotency_v015_archive`, không có `orders.idempotency_key_v015`, không có cột `idempotency_key` kiểu uuid (canon có, từ drift matrix);
- `orders.idempotency_key` chưa từng có giá trị.

### 5.5 022–030 — chứng cứ "chưa áp"
- Grants: prod giữ grant rộng (anon có SELECT members, INSERT...), policy `Public insert customers/orders/…` còn nguyên — đúng trạng thái **trước-022**;
- các object đặc trưng (payment_events, order_inventory_reservations, các RPC guard 023–030) đều vắng.

## 6. Kế hoạch bootstrap ledger (đề xuất — KHÔNG thực hiện trong phiên này)

Nguyên tắc: bootstrap bằng công cụ chuẩn CLI, không hand-INSERT, và **021 không có trong danh sách mark**.

1. **Chuẩn bị nền tảng (một lần, owner duyệt):** `supabase init` trong repo để sinh `supabase/config.toml` (hiện repo chưa init — thiếu canvas của mọi lệnh CLI); giữ `.temp/linked-project.json` nguyên vẹn.
2. **Mark 001–020 applied:** `supabase migration repair --status applied` cho từng file 001–020 theo đúng thứ tự. Điều kiện thiết lập nhận định: net-state đã đối soát cột/function/integrity ✓ (bảng §4); các vùng drift (012 members, 016 body) được ghi chú vào mục ops-log — mark nghĩa là "không chạy lại", không phải "trùng khớp 100% văn bản".
3. **KHÔNG mark 021–030.** Với 021: là FW transform thực tế (rename cột → archive) cần chạy trên dữ liệu sống.
4. **Áp 021→030 qua `supabase db push`** (hoặc psql theo order manifest `replay-canonical-migrations.ps1`) trong cửa sổ maintenance, đúng thứ tự.
5. **Rehearsal bắt buộc trước:** chạy cùng chuỗi trên **mirror prod (55442)** — không phải trên fresh020/canon — vì mirror là trạng thái thực có drift; khai báo PASS/FAIL theo từng bước (điểm rủi ro: 021 cần v015🏹 shape → prod đúng shape; writer body prod sẽ được 025 CREATE OR REPLACE thay thế → hợp lệ dù body lệch).
6. **Tiêu chí rollback** — xem `OPENCODE_H29_CUTOVER_RUNBOOK.md` §8.

Rủi ro còn mở (cần quyết sở hữu):
- R1: mark repair của CLI tính checksum theo file hiện tại — đòi checksum khớp file đã deploy (012/016 lệch) là bất khả thi; chấp nhận "checksum của file-repo, drift ghi chú" (khuyến nghị) hay skip checksum (option B).
- R2: 007 phần storage: nếu platform thực tế có storage schema, mark không phá gì; xác minh bằng truy vấn platform trong cửa sổ trước khi bootstrap.

## 7. Inventory chứng cứ + tái lập

| Artifact | Vai trò |
|---|---|
| `.tmp/recon-20261022/h29-migration-evidence.mjs/.json` | phân tích object theo từng migration trên cả 3 cluster |
| `.tmp/recon-20261022/h29-extract2.mjs`, `h29-close-checks.json` | so cột prod⇄fresh020; kiểm chứng data checks; trích rút 39 đơn paid / 20 cặp trùng lặp (masking) |
| `.tmp/recon-20261022/h29-coa-diff.mjs`, `coa_prod.txt`, `coa_f020.txt`, `h29-fn-def-cmp.mjs` | so body hàm prod ⇄ fresh020 (LCS + normalize) |
| `.tmp/recon-20261022/h29-combo-runtime-probe2.mjs` | khoan runtime writer trong BEGIN/ROLLBACK |
| `docs/audits/OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md` | cơ sở trước (không đổi) |

Cluster: 55442 mirror prod; 55456 canonical full 030; **55461 fresh020 (mới) — đối chứng file-current 001→020, kết nối trust loopback. Cả 3 cluster left running (no data-write outside ROLLBACK probes).

## 8. Spendis ledger: FACT vs HYPOTHESIS

| # | Mệnh đề | Grade |
|---|---|---|
| F1 | Không config.toml / không script migrate / không bảng ledger trong prod | FACT |
| F2 | prod-net-state == file 001–020 ở mức cột & 9/10 hàm | FACT |
| F3 | 021–030 chưa áp trên prod | FACT |
| F4 | Writer RPC prod hỏng 2 nhánh runtime (combo, products.sku) | FACT (khoan thăm dò trên mirror, đã ROLLBACK) |
| F5 | anon SELECT password_hash trên prod at-backup-time | FACT (mirror) |
| F6 | 012/016 deploy bằng văn bản khác trong quá khứ | FACT (dấu vết yếu: body/policy khác file) |
| H1 | Lịch sử được áp bằng SQL editor / psql ad-hoc từng đợt | HYPOTHESIS có hỗ trợ |
| H2 | Checkout combo/product-branch chưa từng gọi thành công trên prod | HYPOTHESIS (0 đơn có combo & snapshot hint; không có log runtime) |
| H3 | 007 storage chưa áp trên prod | KHÔNG THẨM ĐỊNH được từ backup (backup chỉ che phủ schema public) |
