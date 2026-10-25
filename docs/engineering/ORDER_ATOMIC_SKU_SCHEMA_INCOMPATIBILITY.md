# create_order_atomic — không tương thích schema `products.sku` (Session 5)

> Điều tra root cause + phương án sửa. **Chưa triển khai任何 thay đổi nghiệp vụ trong phiên này.**
> Production verdict: **NO-GO**.

## 1. Root cause và bằng chứng

**Root cause:** migration `016_create_order_atomic.sql` truy vấn cột `products.sku` — cột không tồn tại trong schema. Đây là lỗi tham chiếu bảng sai của migration, không phải fixture sai và không phải migration bị thiếu.

Bằng chứng:

| # | Bằng chứng | Kết quả |
|---|---|---|
| 1 | `supabase/migrations/001_initial_schema.sql:88-105` — bảng `products` | Không có cột `sku` (chỉ `product_id, category_id, name, slug, short_description, description, price, compare_at_price, cost_price, status, featured, sort_order, weight_gram, thumbnail, created_at, updated_at`) |
| 2 | `001:115` — `product_variants.sku TEXT UNIQUE` | SKU tồn tại ở biến thể, nullable, unique |
| 3 | `001:258` — `order_items.sku_snapshot TEXT` | Snapshot trên dòng đơn, nullable → nhận `NULL` hợp lệ |
| 4 | `information_schema.columns` trên DB rehearsal (`gieomo_session4_rerun`) | chỉ `product_variants.sku`; đếm `products.sku` = **0** |
| 5 | Git history: `git show 6de9784:supabase/migrations/001_initial_schema.sql` (commit duy nhất của 001) | `products` chưa bao giờ có `sku`; `git log --all -S "products.sku"` và `-G "ADD COLUMN.*sku"` → **không có kết quả** → chưa từng có migration nào thêm cột này |
| 6 | `src/types/database.ts:124-147` — interface `Product` | Không có trường `sku`; `ProductVariant.sku` (162); `OrderItem.sku_snapshot` (306) |
| 7 | `src/lib/validations/schemas.ts` — `productSchema` vs `variantSchema` | `productSchema` không có `sku`; `variantSchema` có `sku` |
| 8 | Toàn bộ UI sinh SKU (`src/app/admin/products/new/page.tsx`, `BulkVariantGenerator.tsx`, `src/lib/utils/skuGenerator.ts`) | Chỉ sinh SKU cấp biến thể theo mẫu `GM-[PROD]-[VARIANT]`; không có màn hình nhập SKU cấp sản phẩm |
| 9 | `tests/reconciliationCatalog.test.ts:170-181` (Batch 3B, C1) | Contract test đã khẳng định `products` "KHÔNG có cột sku" và cấm select nó |
| 10 | `src/lib/services/reconciliationService.ts:410-411` | Đã từng gặp đúng lỗi này: "Trước 3B query chọn `sku, price, stock` → PostgREST PGRST204" và đã bị sửa |

**Kết luận:** SKU là thuộc tính của **biến thể** trong mô hình hiện tại. Migration 016 tham chiếu sai bảng.

### `create_order_atomic` cần SKU để làm gì?

Chỉ một mục đích duy nhất: điền `order_items.sku_snapshot` cho **dòng product-only** (không biến thể).

- Mục 4 (`016:472-495`) `LOCK products` — mục đích theo comment của chính nó là *"snapshot status/price/name"*, nhưng câu `SELECT` ở `016:486` lấy thêm `pr.sku` → xây `v_product_rows`.
- Mục 6, `016:596` `'sku_snapshot', v_obj->>'sku'` — đọc từ `v_product_rows` (dòng product-only).
- Các mục khác của `v_product_rows` đều hợp lệ: `status` (554-555, 584), `price` (561, 588), `name` (574, 594).
- Hai nguồn `sku_snapshot` còn lại **đúng**: dòng variant (`016:576`, lấy `product_variants.sku`), dòng combo (`016:541`, `'COMBO-' || upper(left(id,6))`).
- Không có mục đích nào khác: fingerprint idempotency (`016:798-808`) chỉ *truyền tiếp* `sku_snapshot`, không phụ thuộc việc nó khác `NULL`.

→ Hàm **không cần** SKU từ `products`; chỉ cần `name/price/status`. Bỏ `pr.sku` là đủ.

## 2. Truy vấn tái hiện (thực tế, có chạy)

Target đã xác minh trước khi chạy: host `127.0.0.1`, port `55439`, user `session4_admin`, data directory `.tmp/postgres-session4-data`, database **`gieomo_session4_rerun`** (rehearsal — database evidence `gieomo_session4_test` **không bị đụng tới**). Toàn bộ là truy vấn chỉ đọc.

### 2.1 Truy vấn lỗi (đúng theo yêu cầu)

```sql
SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status
FROM public.products AS pr
LIMIT 1;
```

Kết quả thực tế:

```
ERROR:  42703: column pr.sku does not exist
LINE 1: SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status
                                       ^
LOCATION:  errorMissingColumn, parse_relation.c:3859
```

- **SQLSTATE: `42703`** (undefined_column)
- Thông báo: `column pr.sku does not exist`
- **psql exit code: 1**
- Vị trí lỗi: `parse_relation.c:3859` → lỗi ở **thời điểm parse**, independent of data → xác nhận câu `SELECT` hỏng ngay cả khi bảng rỗng.

### 2.2 Kiểm chứng đối chứng (cùng truy vấn, bỏ `pr.sku`)

```sql
SELECT pr.product_id, pr.name, pr.price, pr.status
FROM public.products AS pr
LIMIT 1;
```

→ trả 1 dòng, **exit code 0**. Chứng minh phần còn lại của mục 4 (`name/price/status`) hoạt động bình thường; chỉ `pr.sku` là lỗi.

### 2.3 Truy vấn catalog

```sql
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema='public' AND column_name='sku';
-- → product_variants | sku
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='products' AND column_name='sku';
-- → 0
```

### 2.4 Re-run integration test (rehearsal DB)

```powershell
$env:ATOMIC_PG_URL='postgresql://session4_admin@127.0.0.1:55439/gieomo_session4_rerun'
$env:GIEOMO_PG_ISOLATED='1'
node --test tests/atomicOrderPg.integration.test.ts
```

→ **exit code 1**; **7 tests = 1 PASS / 6 FAIL / 0 SKIP**.

- PASS: `PG parity — pricing_preview()` (không đụng `products`).
- 6 FAIL đều là cùng một lỗi: `error: column pr.sku does not exist`, `file: 'parse_relation.c'`, `line: '3859'`, `where: 'PL/pgSQL function create_order_atomic(jsonb) line 260 at FOR over SELECT rows'`, `internalQuery: 'SELECT pr.product_id, pr.name, pr.sku, pr.price, pr.status ... FOR UPDATE'`.

Lưu ý: 6 test này gồm cả dòng variant-only → chứng minh lỗi **không** chỉ ảnh hưởng dòng product-only (mục 4 luôn lock parent product).

## 3. Phạm vi ảnh hưởng

### 3.1 Migration 016 (RPC writer — chế độ mặc định)

`resolveOrderWriterMode()` (`orderService.ts:445-446`) trả `"rpc"` trừ khi `GIEOMO_ORDER_WRITER=legacy`, và `:719` chọn RPC khi có idempotency key → mặc định **tất cả đơn hàng đi qua `create_order_atomic`**.

Vì lỗi ở thời điểm parse và `v_lock_products` không rỗng với mọi loại dòng (product-only, variant-only qua `v_parent_ids`, combo qua `v_product_ids`) → **mọi đơn hàng tạo qua RPC đều thất bại**.

Ảnh hưởng các luồng: `POST /api/orders` (`src/app/api/orders/route.ts:43` → `createOrderServer`) dùng bởi checkout (`/checkout`), admin create (`/admin/orders/create`), POS (`/admin/orders/pos`), sale create-order (`/sale/create-order`).

Không ảnh hưởng: `cancel_order_atomic` (017), các luồng thanh toán/webhook, `pricing_preview` (đã PASS).

### 3.2 Luồng legacy (`orderService.ts`)

- `:801-805` `.from("products").select("product_id, name, sku, price, status")` — cùng lỗi, nhưng **chỉ nhánh dòng product-only** (`:794`).
- Biến thể (`:762` chỉ select `products(name, price, status)`) và combo (`:752`) không bị.
- Hậu quả (suy luận từ source, **chưa chạy** vì repo không có PostgREST): PostgREST trả `PGRST204` → `.maybeSingle()` trả `data=null` → `:807 if (!product || ...)` → trả thông báo sai *"Một trong các sản phẩm đã chọn không còn kinh doanh."* — lỗi schema bị nuốt thành lỗi nghiệp vụ. Đây là đúng pattern mà Batch 3B đã ghi nhận ở `reconciliationService.ts:411`.
- Comment tại `:796-800` khẳng định *"Chọn cột chỉ gồm field có căn cứ 001"* — nhưng `sku` không có căn cứ 001 → comment và code mâu thuẫn.

### 3.3 Tác động đến dữ liệu cũ / API / storefront

- `order_items.sku_snapshot` nullable (001:258) → `NULL` hợp lệ.
- Người đọc đều null-safe: `src/app/admin/orders/[id]/page.tsx:447-449` (`{(item.sku_snapshot || item.sku) && ...}`), `reconciliationService.ts:72/535` (`it.sku_snapshot || null`), `orderService.ts:1816` (`f.sku_snapshot && ...` — fallback chỉ dùng khi cả hai khác NULL và `product_id` NULL, dòng product-only có `product_id` nên không dùng tới).
- Migration 016 **chưa từng tạo được đơn nào** trên môi trường rehearsal → không có dữ liệu cũ do RPC sinh ra cần cân nhắc.
- Với legacy: nếu production DB thật sự có `products.sku` thì đơn cũ có thể đang có `sku_snapshot` khác NULL cho dòng product-only → **không thể xác minh từ repo**, phải operator kiểm tra.

## 4. Phương án (chưa triển khai)

### Phương án A — Không lấy SKU từ `products` *(khuyến nghị)*

**Thay đổi SQL:** migration mới (gọi là `023`) `CREATE OR REPLACE FUNCTION create_order_atomic` với mục 4 bỏ `pr.sku`:

```sql
SELECT pr.product_id, pr.name, pr.price, pr.status
  FROM public.products pr
 WHERE pr.product_id = ANY(v_lock_products)
 ORDER BY pr.product_id FOR UPDATE
```

`sku_snapshot` dòng product-only → `NULL` (mục 6:596 đọc key không tồn tại → `NULL` → `nullif(NULL,'')` = `NULL`).

**Thay đổi TS:** `orderService.ts:803` bỏ `sku` khỏi select; `:821` → `sku_snapshot: null`.

| Tiêu chí | Đánh giá |
|---|---|
| Ưu điểm | Khớp schema 001, khớp type `Product`, tái sử dụng tiền lệ Batch 3B; **không đổi schema**; không cần backfill; RPC và legacy đồng nhất hợp đồng `sku_snapshot = NULL` cho dòng product-only; rủi ro thấp nhất |
| Rủi ro | Nếu production thật có `products.sku` (không xác minh được từ repo) thì SKU dòng product-only sẽ变为 NULL → hiển thị admin mất dòng SKU → **cần operator xác minh schema production trước** |
| Dữ liệu hiện hữu | Không đổi (không migration schema); đơn cũ sinh bởi legacy giữ nguyên |
| API/storefront | Không đổi contract; UI đã null-safe |
| Migration cần thêm | 1 file mới (023, thay thế function) — **không sửa 016 lịch sử/đã rehearse** |
| Test hồi quy | Xem mục 5 |

### Phương án B — Thêm cột `products.sku` bằng migration mới

Chỉ hợp lệ nếu có căn cứ nghiệp vụ rằng **SKU cấp sản phẩm là dữ liệu riêng, tồn tại song song SKU biến thể**. Hiện **không có căn cứ nào** trong repo (mục 1, bằng chứng 6-8): không có form nhập, không có writer, không có type, không có Zod field → cột mới sẽ luôn `NULL` = cùng kết quả như A nhưng thêm dữ liệu giả.

Nếu nghiệp vụ xác nhận:

- `ALTER TABLE products ADD COLUMN sku TEXT UNIQUE` (nullable, không NOT NULL để tránh vỡ bảng khi áp).
- **Backfill:** không thể suy đoán → `NULL` toàn bộ; không sync từ `product_variants.sku` (một sản phẩm nhiều biến thể → không có "một" SKU đúng).
- Tính duy nhất: `UNIQUE` riêng cho `products`; **không** thể dùng chung index với `product_variants.sku` (khác bảng) và không ép khớp chéo hai bảng.
- Phải đi kèm sửa UI/Zod/productService mới có dữ liệu; nếu không → cột chết.

| Tiêu chí | Đánh giá |
|---|---|
| Ưu điểm | Không sửa logic RPC/legacy; mở đường cho SKU sản phẩm trong tương lai |
| Rủi ro | Cột không có writer → mọi dòng product-only vẫn `NULL` (vô ích); trái design đã chốt ở 001 + contract test C1 + type; cần thay đổi CRUD/API; PostgREST schema cache phải refresh; mâu thuẫn với comment `orderService.ts:796-800` |
| Dữ liệu hiện hữu | Additive, không phá; nhưng sinh dữ liệu mơ hồ (NULL mãi) |
| Migration cần thêm | 1 (ADD COLUMN); có thể không cần sửa 016 |
| Test hồi quy | Schema test (cột tồn tại/nullable/unique), product CRUD roundtrip, parity RPC↔legacy |

### Phương án C — Chuẩn hóa nguồn SKU theo biến thể

- Dòng có `variant_id` → nguồn duy nhất `product_variants.sku`. **Đã đúng sẵn** ở cả RPC (`016:576`) và legacy (`orderService.ts:788`).
- Dòng combo → nguồn `COMBO-<6 ký tự>` (`016:541`, `orderService.ts:752`) — đã đúng.
- Dòng product-only → **không tự chọn một SKU biến thể tùy ý**; để `NULL` nếu hợp đồng cho phép.
  - Sản phẩm **nhiều biến thể**: chọn SKU biến thể nào? Không có căn cứ → sai lệch dữ liệu.
  - Sản phẩm **không biến thể**: không có nguồn → `NULL`.
  - ⇒ Phần product-only của C **sụp đổ vào A**; C chủ yếu là một *ràng buộc thiết kế* (ngăn ai đó "chấm" bừa một SKU biến thể), không phải đoạn code riêng.

| Tiêu chí | Đánh giá |
|---|---|
| Ưu điểm | Định nghĩa rõ từng nguồn; chống dùng sai SKU biến thể cho dòng không phải biến thể |
| Rủi ro | Không tự giải quyết được bài toán dòng product-only nếu nghiệp vụ bắt buộc phải có SKU → lúc đó phải chọn B |
| Migration | Không riêng (phụ thuộc lựa chọn phần product-only) |
| Test hồi quy | Như A + assert variant line lấy đúng `variant.sku` |

### Khuyến nghị

**Phương án A, kế thừa nguyên tắc của C** (variant → `product_variants.sku`; combo → `COMBO-*`; product-only → `NULL`), vì nó phù hợp nhất với schema hiện tại, không đổi schema, tận dụng tiền lệ Batch 3B và mọi consumer đã null-safe.

Chỉ chọn **B** nếu người phụ trách nghiệp vụ xác nhận tồn tại SKU cấp sản phẩm và chỉ ra nguồn dữ liệu điền vào nó.

**Phiên này không sửa code/migration.**

## 5. Quyết định cần người phụ trách nghiệp vụ / operator xác nhận

1. **Schema production thực tế:** `products` trên môi trường production có cột `sku` không? (cần chạy `information_schema`/`\d products` bên phía operator — repo không trả lời được). Đây là điều kiện tiên quyết để chốt A.
2. **Hợp đồng `sku_snapshot` cho dòng product-only = `NULL`** có chấp nhận được cho admin hiển thị, đối soát và kế toán không?
3. **Có tồn tại "SKU cấp sản phẩm"** như một dữ liệu nghiệp vụ riêng không? (Nếu có → B kèm nguồn dữ liệu cụ thể; nếu không → loại B.)
4. **Cách sửa áp dụng:** migration mới `023` (replace function) hay hiệu chỉnh `016` trước khi nó được commit/apply production? Cả hai đều phải do người có thẩm quyền chọn; phiên này không chọn.
5. **Legacy nuốt lỗi schema thành thông báo sai nghiệp vụ** (`orderService.ts:807`) — có muốn xử lý fail-closed tường minh cho lỗi PGRST204 không? (ngoài phạm vi sửa `products.sku` nhưng cùng gốc).

## 6. Test đã chạy và test còn thiếu

### 6.1 Test đã thực sự chạy trong Session 5

| Test / truy vấn | Lệnh | Exit | Kết quả |
|---|---|---|---|
| Truy vấn tái hiện | `psql -c "SELECT ... pr.sku ... FROM public.products AS pr LIMIT 1"` | **1** | `42703 column pr.sku does not exist` — **reproduced** |
| Đối chứng bỏ `pr.sku` | `psql -c "SELECT pr.product_id, pr.name, pr.price, pr.status ..."` | **0** | 1 dòng, OK |
| Catalog `sku` | `information_schema.columns` | **0** | chỉ `product_variants.sku`; `products.sku` count = 0 |
| `tests/migration016Source.test.ts` | `node --test` | **0** | **9/9 PASS** — nhưng **không assert nào về `sku`** (gap được xác nhận bằng `Select-String "pr.sku\|products.sku\|sku"` → 0 kết quả) |
| `tests/atomicOrderPg.integration.test.ts` (PG thật) | `node --test` với `ATOMIC_PG_URL=.../gieomo_session4_rerun` | **1** | **7 = 1 PASS / 6 FAIL / 0 SKIP**; mọi FAIL = `column pr.sku does not exist` |

Không có test mới nào được viết hay chạy → không có tuyên bố PASS cho test chưa triển khai.

### 6.2 Test hồi quy đề xuất (chưa triển khai)

1. **`tests/migration016Source.test.ts`** — thêm (theo mẫu test `pr.stock` sẵn có ở dòng 35-41):
   - `assert.doesNotMatch(SQL, /pr\.sku/, "016 không SELECT pr.sku")`;
   - quét mọi tham chiếu `products.<col>` trong SQL và đối chiếu với danh sách cột của bảng `products` đọc từ `001_initial_schema.sql` (kiểu "schema-derived allowlist") — chặn cả `stock`, `sku` lẫn cột lạ tương lai;
   - khẳng định `001` không define `products.sku` (phòng khi ai đó thêm cột vào 001 thì test tự nới lỏng có chủ đích).
2. **Contract test cho `orderService.ts`** (mở rộng pattern C1 của `tests/reconciliationCatalog.test.ts:170-181`):
   - đọc source `src/lib/services/orderService.ts`, trích mọi `.from("products").select(...)`;
   - assert danh sách cột không chứa `sku`, `stock` (và chỉ chứa allowlist theo 001);
   - hiện C1 mới chỉ cover `reconciliationService.ts` → đây là lỗ hổng khiến `orderService.ts:803` lọt lưới.
3. **PostgreSQL integration** (`tests/atomicOrderPg.integration.test.ts`, đã có case):
   - đơn **product-only** → `outcome='created'` và `order_items.sku_snapshot IS NULL`;
   - đơn **variant-only** → `sku_snapshot = product_variants.sku`;
   - đơn **combo** → `sku_snapshot ~ '^COMBO-[0-9A-F]{6}'`;
   - các case đã FAIL (atomic/concurrency/P0-1/P0-2/race stock/race voucher) phải chuyển sang PASS **sau khi áp A** — nay chưa chạy nên chưa PASS.
4. **Đối chiếu "các trường hợp tạo đơn trước đây không còn lỗi schema":** chạy lại `atomicOrderPg` + `paymentIdempotencyPg` + `r1PaymentPg` trên DB rehearsal sau khi áp dụng — chưa chạy.
5. **Parity fingerprint RPC↔legacy:** `sku_snapshot` phải bằng nhau cho cùng dòng (cả hai đều `NULL` cho product-only) — thêm vào `tests/orderRequestHash.test.ts` hoặc test fingerprint hiện có.

## 7. Git status trước / sau

| | Trước Session 5 | Sau Session 5 |
|---|---|---|
| Branch | `main` | `main` |
| HEAD | `1c51af625a575a41733d59b29cc9be9ae0892c60` | `1c51af625a575a41733d59b29cc9be9ae0892c60` |
| Staged | 0 | 0 |
| Porcelain entries | 131 (48 unstaged / 83 untracked) | 131 (thêm 1 file báo cáo nằm trong thư mục untracked `docs/engineering/`) |
| `git diff --check` | exit 0 | exit 0 |
| Commit/push/deploy | không | không |

Không chạy `git reset`, `git clean`, `git stash`, `git checkout` để hoàn tác; toàn bộ thay đổi unstaged/untracked từ các phiên trước được giữ nguyên. `package.json` / `package-lock.json` không đổi. Database evidence `gieomo_session4_test` không bị ghi/đọc-thay-đổi trong phiên này; chỉ dùng `gieomo_session4_rerun` với truy vấn chỉ đọc (các lệnh integration test có seed nhưng rollback/ dọn trong chính test).

Tài liệu/đã đọc (không sửa): `001_initial_schema.sql`, `016_create_order_atomic.sql`, `012_atomic_stock_and_rls_hardening.sql`, `src/types/database.ts`, `src/lib/services/orderService.ts`, `src/lib/services/reconciliationService.ts`, `src/lib/services/productService.ts`, `src/lib/validations/schemas.ts`, `src/lib/utils/skuGenerator.ts`, `src/lib/data/orderStore.ts`, `src/app/admin/*` (SKU UI), `tests/migration016Source.test.ts`, `tests/reconciliationCatalog.test.ts`, `tests/atomicOrderPg.integration.test.ts`.

File mới: `docs/engineering/ORDER_ATOMIC_SKU_SCHEMA_INCOMPATIBILITY.md` (báo cáo này). **Không sửa source, không sửa migration, không sửa test.**

## 8. Production verdict

**NO-GO.**

- Lỗi schema `products.sku` trong `create_order_atomic` đã root-cause và tái hiện bằng truy vấn thật (SQLSTATE 42703, exit 1).
- Chưa có phương án nào được triển khai; migration 016 và luồng legacy vẫn nguyên trạng.
- R1 vẫn `PARTIAL / BLOCKED`, RLS activation `BLOCKED`, P0-A3 `BLOCKED` (theo báo cáo Session 4).

### Bước triển khai tiếp theo (đề xuất, cần phê duyệt)

1. Operator xác minh schema production (`products.sku` có hay không) → chốt A hay B.
2. Người phụ trách nghiệp vụ chốt hợp đồng `sku_snapshot = NULL` cho dòng product-only.
3. Sau khi chốt: viết migration mới (không sửa 016 lịch sử), sửa `orderService.ts:803/821`, bổ sung test mục 6.2, chạy lại toàn bộ evidence PostgreSQL trên rehearsal DB, rồi mới tái đánh giá verdict.
