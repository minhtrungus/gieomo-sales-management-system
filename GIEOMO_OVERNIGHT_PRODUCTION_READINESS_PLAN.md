# Gieo Mơ — Overnight Stabilization, Test & Production Release Plan

> **Mục tiêu:** đưa `gieomo-sales-management-system` tới trạng thái có thể phát hành an toàn bằng chuỗi batch nhỏ, có kiểm chứng và có thể rollback.
>
> Đây là **kế hoạch**, không phải bằng chứng code đúng hoặc Production an toàn. Không tuyên bố PASS/GO chỉ vì build thành công. Nếu còn lỗi P0/P1, thiếu test bắt buộc, chưa xác minh dữ liệu/ACL/webhook hoặc rollback chưa sẵn sàng thì dừng phát hành.

- Repository: `C:\Users\MT\Workspaces\gieomo-sales-management-system`
- Công cụ hiện tại: **OpenCode**
- Branch/HEAD được báo cáo gần nhất: `main` / `1c51af625a575a41733d59b29cc9be9ae0892c60`
- P0-A3: `docs/engineering/P0-A3_IDEMPOTENCY_DESIGN_REVIEW.md`
- P0-A3 design review được báo cáo `READY FOR IMPLEMENTATION PLANNING`; implementation và Production cutover vẫn `NO-GO / OPEN / BLOCKED`.
- Working tree được báo cáo gần nhất: `42 modified, 1 deleted, 58 untracked, 0 staged`. Đây là baseline lịch sử, phải kiểm tra lại trước khi làm.

## 0. Quy tắc vận hành bắt buộc

### Bảo vệ thay đổi hiện có
- [ ] Trước mỗi batch, ghi lại `git status --short`, branch, HEAD và danh sách file dirty.
- [ ] Không dùng `git reset --hard`, `git clean`, `git checkout --`, `git restore` trên thay đổi chưa xác nhận hoặc lệnh có thể xóa/ghi đè công việc.
- [ ] Không stash, revert, overwrite, stage, commit, push hoặc deploy nếu chưa được cho phép rõ ràng.
- [ ] Không sửa file ngoài scope. Nếu cần chạm file ngoài scope, dừng và báo lý do.
- [ ] Không in secret/token/cookie/webhook key hoặc giá trị `.env`; chỉ báo tên biến và configured/missing.
- [ ] Không chạy migration, SQL ghi dữ liệu, webhook thật, giao dịch thật hoặc thao tác Production trong batch review.
- [ ] Test DB chỉ chạy trên database cô lập đã xác nhận; không mặc định URL nào là an toàn.
- [ ] Nếu môi trường hoặc target không rõ, dừng trước thao tác có khả năng ghi dữ liệu.

### Định nghĩa PASS
Một batch chỉ PASS khi phạm vi/file thay đổi đúng, type-check/lint/build/test liên quan chạy thành công, có regression test, kiểm tra quyền/tính toàn vẹn phù hợp, diff được review và kết quả được ghi rõ. Test bị skip hoặc chưa chạy không được tính PASS. Mock không chứng minh concurrency PostgreSQL thật.

Trạng thái: `NOT STARTED`, `IN REVIEW`, `BLOCKED`, `FAIL`, `PASS`, `GO`, `NO-GO`. `PASS` của batch không tự động đồng nghĩa `GO` Production.

## 1. Batch 0 — Baseline, bản đồ hệ thống và an toàn thay đổi

- [ ] Ghi `git status --short`, branch, HEAD; phân biệt file dirty có sẵn và file mới.
- [ ] Đọc `DEVELOPMENT_AND_PRODUCTION_PLAYBOOK.md` cùng tài liệu deploy/rollback.
- [ ] Kiểm tra scripts thật trong `package.json`: type-check, lint, build, unit, integration.
- [ ] Inventory mọi writer: order, payment, stock, voucher; API, RPC, webhook, cron/worker và external writer nếu phát hiện được.
- [ ] Phân biệt migration trong repo với migration thực sự đã áp dụng ở từng môi trường.
- [ ] Xác nhận local/test/staging/Production và quy trình rollback.
- [ ] Kiểm tra tên biến môi trường và configured/missing, không in giá trị.
- [ ] Ghi unknown/blocker và người chịu trách nhiệm cung cấp bằng chứng.

**PASS:** baseline rõ ràng, không có thao tác phá hủy, biết chính xác lệnh test và các rủi ro chưa xác minh.

## 2. Batch P0-A3 — Idempotency khi tạo đơn hàng

**Ưu tiên P0; chặn phát hành nếu chưa giải quyết rủi ro tạo đơn trùng.**

Tài liệu: `docs/engineering/P0-A3_IDEMPOTENCY_DESIGN_REVIEW.md`

### Trạng thái được báo cáo
- Design review: `READY FOR IMPLEMENTATION PLANNING`.
- Implementation: `NO-GO / OPEN / BLOCKED`.
- Production cutover: `NO-GO / OPEN / BLOCKED`.
- Tài liệu tăng từ 470 lên 631 dòng; không có nghĩa implementation đã tồn tại.
- Chưa có bằng chứng PostgreSQL concurrency test thực sự PASS.

### Blocker trước implementation/cutover
- [ ] Chốt maximum quantity per line.
- [ ] Chốt maximum aggregate quantity.
- [ ] Quyết định có maximum line count hay không.
- [ ] Inventory mọi writer/job/worker/external writer có thể tạo đơn.
- [ ] Có bằng chứng drain/stop hoặc kiểm soát writer không tham gia gate protocol.
- [ ] Kiểm tra DB catalog/ACL/owner/membership/grants/default privileges/`SECURITY DEFINER`/`search_path`.
- [ ] Phân loại legacy rows, orders không có ledger, key NULL và key cũ.
- [ ] Chuẩn bị PostgreSQL cô lập, xác nhận rõ ràng cho concurrency test.
- [ ] Chốt patch plan theo file và review migration/RPC.
- [ ] Chốt monitoring, rollback owner, runbook và dual-reader artifact đã xác minh.

### Test bắt buộc
- [ ] Cùng key + cùng payload tuần tự: một order; retry trả kết quả ổn định.
- [ ] Cùng key + cùng payload đồng thời trên PostgreSQL thật: tối đa một order.
- [ ] Cùng key + payload khác: conflict, không tạo order thứ hai.
- [ ] Winner commit/loser chờ/reread/replay đúng.
- [ ] Winner rollback: request còn lại xử lý theo protocol, không trả kết quả giả.
- [ ] Mất response sau commit rồi retry: không tạo order mới.
- [ ] DB read error không được diễn giải thành key chưa tồn tại.
- [ ] NULL/legacy path không âm thầm bypass gate sau cutover.
- [ ] Order không có ledger được phát hiện là orphan; không tự tạo lại mù quáng.
- [ ] Hash canonicalization: Unicode, null/missing, số lượng, sort lines, duplicate line multiplicity.
- [ ] Product/variant/combo identity và parent/variant mismatch.
- [ ] Customer/voucher/stock/order/items/history/ledger rollback cùng transaction khi lỗi.
- [ ] ACL test chứng minh direct insert/old writer không bypass gate sau cutover.
- [ ] V1/V2 replay, ledger states, lease expiry và rollback dual-reader.
- [ ] Reciprocal order-ledger invariants và tính bất biến của dữ liệu v2.

**Release gate:** không bật `V2_OPEN`, không chạy migration Production, không cutover khi còn business blocker hoặc operator evidence chưa đủ. Tài liệu đầy đủ/build pass không thay thế PostgreSQL concurrency/ACL evidence.

## 3. Batch R1 — Payment Retry Consistency

**Phạm vi:** payment identity, retry, duplicate insert, admin confirm/reject, payment POST và webhook. Không sửa order creation/P0-A3 trong batch này.

### Trạng thái review (cập nhật 2026-10-13 — OpenCode batch R1-review)

- Review source-level: **PASS** — đã truy vết toàn bộ writer, uniqueness, retry, confirm/reject, webhook, tests (chi tiết findings: `docs/engineering/OVERNIGHT_EXECUTION_STATE.md` + báo cáo batch).
- Tests local đã chạy: `node --test` 6 file payment → **63 pass / 0 fail / 4 skipped** (skip = PG integration, thiếu `pg`/`ATOMIC_PG_URL`). SKIP ≠ PASS.
- Implementation: **BLOCKED** — chờ phê duyệt patch plan tối thiểu (application fixes + unit tests; migration cần isolated PG).
- Production/DB evidence: **NOT VERIFIED / NO-GO**.

### Review
- [x] Tất cả nơi tạo payment record: admin, API, service, SePay webhook, background jobs. (Kết luận: chỉ 1 module ghi `payments` — `paymentRecordService.recordPaymentOnce`; không có cron/worker writer nào trong repo; RPC 016/017 không đụng `payments`.)
- [x] Identity: provider transaction/reference ID, payment ID, order ID và DB uniqueness. (Partial unique index `(order_id, transaction_code)` — migration 018; KHÔNG có unique "một order chỉ một paid"; cross-writer dùng mã khác nhau.)
- [x] Webhook signature/authentication; reject signature sai. (Chỉ so sánh static API-key header; không có chữ ký/replay protection — gap.)
- [x] Webhook duplicate, concurrent, out-of-order, retry sau timeout. (Retry cùng reference dedupe được; nhưng giao dịch thứ 2 reference mới trên đơn đã paid bị bỏ qua — gap.)
- [x] Đối chiếu amount/currency/order phía server. (Amount một chiều `>=`; không có cột currency; admin confirm ghi `final_amount` bất kể tiền thực nhận.)
- [x] Confirm/reject lặp lại, double-click, pending-only transition, duplicate-paid. (Server: early-return `isAlreadyPaid`, CAS guard, reject `.neq paid`; client: in-flight Set + dialog; đã có test.)
- [x] State transition hợp lệ; trạng thái cũ không ghi đè trạng thái mới. (`resurrectionGuard.test.ts` E1–E9; cancelled không hồi sinh; `refunded` chỉ là dropdown chết.)
- [x] Transaction boundary, lock, audit/history, lỗi giữa chừng. (Pipeline 3 PostgREST transaction rời; insert-first có chủ đích; history lỗi bị nuốt — ghi nhận.)
- [x] Phân biệt “không tìm thấy” với “DB lỗi”. (Payment service phân biệt duplicate/error; webhook order-not-found trả 200 im lặng — gap.)
- [x] Không log secrets, chữ ký đầy đủ hoặc PII không cần thiết. (Không log secret; webhook không có chữ ký để log; warning amount chứa tên khách hàng — chấp nhận được, ghi nhận.)

### Test bắt buộc
- [ ] Gửi lại cùng webhook nhiều lần chỉ có một kết quả payment hợp lệ.
- [ ] Hai webhook đồng thời cùng transaction ID.
- [ ] Cùng ID nhưng amount/order/payload khác bị từ chối an toàn.
- [ ] Signature sai/thiếu, payload sai schema, thiếu identity.
- [ ] Event sai thứ tự và retry sau lỗi tạm thời.
- [ ] Admin confirm/reject lặp lại và các chuyển trạng thái không hợp lệ.
- [ ] Amount mismatch và order không tồn tại.
- [ ] DB lỗi trước commit, trong transaction và timeout sau commit.
- [ ] DB unique constraint được kiểm chứng; không chỉ application pre-check.
- [ ] Audit history chính xác, không duplicate transition.
- [ ] Deterministic tests; không gọi provider thật/Production webhook.

> **Coverage 2026-10-13:** đã có unit/mock cho recordPaymentOnce (P1–P9), confirm client (T1–T9), bypass PATCH (BP1–BP8), resurrection (E1–E9). **Còn thiếu:** test webhook route trực tiếp (signature sai/thiếu schema, unknown order, giao dịch thứ 2 reference mới), test amount mismatch, test DB-error injection ở từng nhánh webhook, và toàn bộ PG concurrency (đang SKIP). Các mục trên chưa tick vì chưa chạy thật.

**PASS:** uniqueness + transaction/state transition được chứng minh; retry idempotent; test cô lập chạy thật; không có payment writer bypass chưa kiểm soát.

## 4. Batch 4 — Authorization, roles, transitions & audit

### Trạng thái (cập nhật 2026-10-13 — OpenCode batch 4-review + 4b-fix)
- Review source-level: **PASS** — guard matrix 24 routes, session/cookie, object-level, audit, RLS alignment (chi tiết: `docs/engineering/OVERNIGHT_EXECUTION_STATE.md`).
- Fixes đã implement + test (mock): presence spoof (session identity), payment history `changed_by_member_id`, sepay `timingSafeEqual` + không echo token → `tests/authHygieneBatch4.test.ts` 7/7 PASS; regression 66/66.
- Còn mở (cần quyết định/range scope): C1 notify/email public, C3 session revocation, C2 RLS anon INSERT (migration 021 + isolated PG), C8 token trong localStorage (architectural), C9 audit_logs chưa có writer, C4 reviews auto-approve, C5 upload auth, C6 members roster PII, C7 rate limiting.
- Production: **NOT VERIFIED**.

- [ ] Các admin API dùng `requireAdmin` nhất quán.
- [ ] Protected endpoint không truy cập được khi chưa xác thực.
- [ ] Phân biệt admin/sale/member/customer; server quyết định quyền.
- [ ] Object-level authorization: user không đọc/sửa order/payment/member của người khác.
- [ ] Confirm/reject/delete/stock adjustment có guard và state transition.
- [ ] Session signing/expiry, cookie flags, revocation và PBKDF2 flow.
- [ ] Không có plaintext password fallback hoặc secret trong log/bundle.
- [ ] Audit có actor/action/target/time/result cần thiết, không lưu thừa PII.
- [ ] RLS/grants khớp application authorization.

### Test
- [ ] Anonymous → protected endpoints trả 401/403 đúng.
- [ ] Sale/member/customer gọi admin route bị từ chối.
- [ ] User A không đọc/sửa tài nguyên User B.
- [ ] Invalid/expired/tampered session bị từ chối.
- [ ] Invalid transitions bị từ chối.
- [ ] Destructive action có server-side permission.
- [ ] Regression tất cả route bị ảnh hưởng.

Không mở endpoint public chỉ để hết 401. Phải phân biệt 401 hợp lệ với 401 lỗi đối với request được xác thực.

## 5. Batch R2 — Payment canonical lookup & success UI

Phụ thuộc R1.

- [ ] Xác định nguồn sự thật duy nhất cho payment/order status.
- [ ] UI không đánh dấu paid chỉ vì redirect/query string/client state.
- [ ] Retry/polling sau timeout không tạo payment mới.
- [ ] Hiển thị pending/paid/rejected/failed/unknown nhất quán.
- [ ] Amount, transaction reference và order lấy từ server đã xác minh.
- [ ] Webhook chưa xác nhận thì không hiển thị thành công.
- [ ] Xử lý duplicate callback, refresh, back button.

### Test
- [ ] Reload trang kết quả không đổi trạng thái.
- [ ] Mất mạng/timeout rồi retry.
- [ ] Webhook chậm thì UI vẫn pending.
- [ ] Duplicate event không tạo duplicate UI/ledger.
- [ ] Amount/order mismatch không hiện paid.
- [ ] State transition đúng theo rule.

## 6. Batch 3E — Reconciliation, notifications, KPI/monitoring

### Trạng thái (cập nhật 2026-10-13 — OpenCode batch 3E-review + 3E-fix)
- Review source-level: **PASS** — reconciliation service/route/UI, notifications, KPI/dashboard (chi tiết trong checkpoint).
- Fixes đã implement + test: notifications GET fail trả 500/success:false (client giữ state cũ), state read/upsert fail-closed, `end_date` date-only bao tròn ngày cuối (P3b test), bỏ dead `p.status`. Tests 28/28 PASS.
- Còn mở: webhook ghi nhận underpayment/second-transfer/unknown-order (C1–C3 — phụ thuộc quyết định R1), Phase A unbounded scan (C4 — cần perf evidence), không có drift alerting (C5), KPI 3 nguồn revenue khác nhau + COGS 40% synthetic (C8 — cần business định nghĩa revenue), presence read-modify-write (C11), catalog cache 30s (C12).
- Production: **NOT VERIFIED**.

Phạm vi: Orders ↔ Payments ↔ Inventory; cảnh báo và chỉ số. Dashboard không thay thế DB constraint/transaction.

- [ ] Review `reconciliationService.ts`, `/api/admin/reconciliation`, notifications và presence endpoints.
- [ ] Xác minh `requireAdmin` và quyền đọc.
- [ ] Phát hiện order thiếu payment, payment duplicate/orphan, amount mismatch.
- [ ] Đối soát order items, stock movements và voucher usage.
- [ ] KPI có định nghĩa rõ, không đếm duplicate.
- [ ] Dashboard read-only không tự sửa dữ liệu.
- [ ] Hiển thị timestamp đối soát, lỗi query và cách xử lý.
- [ ] Xác định alert/owner cho pending kéo dài, webhook failure, orphan và reconciliation drift.

### Test
- [ ] Fixture đúng không tạo false positive.
- [ ] Mỗi loại inconsistency đều được phát hiện.
- [ ] Dashboard không ghi order/payment/inventory.
- [ ] Filter, pagination, empty state, DB error và authorization.
- [ ] KPI khớp fixture chuẩn.
- [ ] Monitoring không log secret/PII thừa.

## 7. Functional fixes — 8 lỗi sản phẩm đã ghi nhận

Mỗi mục là một scope riêng, cần regression test; không coi là đã fix chỉ vì batch khác PASS.

### F1 — Không thêm được combo vào sản phẩm nổi bật trang chủ
- [ ] Kiểm tra cấu hình featured, admin UI, API validation, storefront query/render.
- [ ] Combo inactive/unpublished không hiển thị.
- [ ] Test thêm/xóa combo, refresh, mobile/desktop, product thường.
- [ ] PASS khi combo hợp lệ hiển thị đúng.

### F2 — Không chỉnh sửa được voucher
- [ ] Kiểm tra edit form, API, schema và quyền.
- [ ] Chốt rule với voucher đã dùng/active/hết hạn.
- [ ] Không thay đổi hồi tố đơn đã chốt.
- [ ] Test edit, validation, concurrent edit, quyền, voucher đã dùng.
- [ ] Trước đây có báo cáo code change nhưng chưa runtime verify; cần retest.

### F3 — SKU độc nhất trong combo; đổi SKU theo ghi chú khách hàng
- [ ] Chốt quy trình: SKU cũ trả về kho, SKU mới xuất kho, trạng thái reserve/hold.
- [ ] BTC chọn được SKU còn tồn; không xuất một SKU cho hai đơn active.
- [ ] Atomicity khi combo thiếu hàng/SKU bị lấy đồng thời.
- [ ] Audit actor, thời gian, lý do và SKU trước/sau.
- [ ] Test hết hàng, concurrency, hủy đơn, đổi qua lại, rollback.
- [ ] Không tự suy diễn nghiệp vụ đổi/trả kho khi chưa chốt.

### F4 — Thứ tự SKU/sản phẩm độc nhất
- [ ] Available/chưa mua hiển thị trước theo rule đã chốt.
- [ ] Thứ tự trong nhóm ổn định.
- [ ] Phân biệt sold/held/reserved/available.
- [ ] Test pagination/filter/sort/refresh; sort đúng layer server/client.
- [ ] Không chỉ sort client khi server pagination làm sai thứ tự.

### F5 — Một lần mua tạo hai đơn
- [ ] Trace bằng log/correlation ID và inventory mọi order creation path.
- [ ] Kiểm tra checkout UUID/sessionStorage, API POST, shared service, retry và legacy path.
- [ ] P0-A3 là trọng tâm; không coi client-only guard là đảm bảo.
- [ ] Test double-click, reload, retry timeout, hai tab, concurrent requests, response mất sau commit.
- [ ] Xác minh một submit chỉ tạo một order trên PostgreSQL thật.
- [ ] Không tự xóa order trùng Production trước reconciliation và phê duyệt.

### F6 — Phí ship và hiển thị giá/discount
- [ ] Chuẩn hóa subtotal, fixed/percentage discount, shipping và final amount phía server.
- [ ] Audit product/cart/checkout/order detail/admin/sale/payment summary.
- [ ] Chốt thứ tự áp discount/voucher và rounding.
- [ ] Client không quyết định final amount.
- [ ] Test fixed/percentage discount, cap, voucher invalid/expired, free shipping, shipping 0, rounding.
- [ ] Server final amount khớp breakdown và payment amount.
- [ ] Trước đó báo cáo chỉ sửa một phần; chưa xác minh toàn bộ UI.

### F7 — Hiển thị SKU cụ thể trong chi tiết đơn
- [ ] Hiển thị SKU/variant thực tế, không chỉ product cha.
- [ ] Combo hiển thị từng component/SKU snapshot lúc đặt.
- [ ] Order lịch sử không đổi khi product/SKU hiện tại thay đổi.
- [ ] Test product, variant, combo, order cũ và dữ liệu thiếu.
- [ ] Không lộ thông tin không phù hợp role.

### F8 — SePay webhook không hoạt động
- [ ] Xác minh URL/method/payload/schema/signature/provider config.
- [ ] Kiểm tra response code, timeout, proxy/deploy logs và parse errors.
- [ ] Mapping transaction ID, amount, order reference và status.
- [ ] Test sandbox/test event, không tùy tiện replay Production webhook.
- [ ] Test signature sai, duplicate, out-of-order, timeout và retry.
- [ ] Correlation ID logs không chứa secret; có metrics success/failure.
- [ ] HTTP 2xx không chứng minh payment đã đối soát đúng.
- [ ] PASS chỉ khi có end-to-end evidence trong provider test environment và DB/UI khớp.

## 8. Inventory, voucher và combo integrity

### Inventory
- [ ] Mọi stock mutation có transaction/locking/constraint phù hợp.
- [ ] Không âm tồn nếu nghiệp vụ cấm.
- [ ] Reserve/release/fulfill/cancel/return có state rõ và không chạy hai lần.
- [ ] Concurrent purchase không bán vượt tồn.
- [ ] Validate SKU/variant/combo phía server.
- [ ] Có audit/reconciliation movement.

### Voucher
- [ ] Validate hạn, trạng thái, quota, usage, min spend, maximum discount.
- [ ] Concurrent redemption không vượt quota.
- [ ] Retry không tăng usage hai lần.
- [ ] Cancel/refund theo business rule đã chốt.
- [ ] Không sửa lịch sử thanh toán ngoài ý muốn.

### Combo
- [ ] Validate combo active/published và component quantities.
- [ ] Quy tắc giá combo rõ ràng.
- [ ] Không trừ stock hai lần hoặc bỏ sót component.
- [ ] Unique SKU đúng qua reserve → paid → fulfill → cancel/return.
- [ ] Combo hiển thị đúng ở featured products và order detail.

## 9. Automated regression — toàn hệ thống

### Evidence 2026-10-13 (OpenCode, local only)
- `node --test "tests/**/*.test.ts"` → **419 PASS / 0 FAIL / 34 SKIP** (453 tổng; skip = 5 file `*.integration.test.ts` PG — thiếu `pg`/`ATOMIC_PG_URL`; SKIP ≠ PASS).
- `npx tsc --noEmit` → **OK** (0 error).
- `npx next build` → **OK** (build xanh; KHÔNG đủ để PASS batch).
- `npx eslint` trên các file đã sửa → chỉ lỗi/warning **có sẵn** (`no-explicit-any`, unused vars) — không có lỗi mới do batch này.
- Chưa chạy: lint toàn repo (baseline noise chưa được establish), PG integration trên target cô lập.

### Static checks
- [ ] TypeScript type-check.
- [ ] Lint theo script thực tế.
- [ ] Production build.
- [ ] Unit tests.
- [ ] Integration tests.
- [ ] Kiểm tra migration/schema drift an toàn; không apply vào Production.
- [ ] Diff review và kiểm tra file ngoài scope.
- [ ] Test quan trọng bị skip phải được ghi là blocker, không tính PASS.

### End-to-end flows
- [ ] Customer: catalog → chọn SKU/variant → cart → checkout → một order.
- [ ] Giá/discount/shipping checkout khớp server final amount.
- [ ] Payment pending → webhook hợp lệ → paid → order state đúng.
- [ ] Refresh/retry/double-click không tạo duplicate order/payment.
- [ ] Admin confirm/reject đúng transition.
- [ ] Sale tạo order theo đúng quyền.
- [ ] Voucher quota/usage và stock chính xác.
- [ ] Combo/unique SKU reserve/xuất/trả đúng.
- [ ] Cancel/return không double-release/double-restock.
- [ ] Reconciliation phát hiện fixture sai và không sửa dữ liệu.
- [ ] Admin dashboard, notifications, presence và orders API đúng quyền.
- [ ] Mobile/desktop, loading/error/empty states.
- [ ] Legacy data/path hoạt động theo compatibility rule đã chốt.

### Data integrity
- [ ] Không duplicate order theo cùng idempotency key.
- [ ] Không duplicate payment theo provider transaction identity.
- [ ] Không payment orphan hoặc amount mismatch bị bỏ sót.
- [ ] Stock movement/order items/voucher usage/payment history nhất quán.
- [ ] Idempotency ledger khớp order.
- [ ] Constraint/ACL test trên PostgreSQL thật trong DB cô lập.
- [ ] Test không tạo/sửa Production data.

## 10. Release readiness — staging, smoke test, rollback

### Trước deploy
- [ ] Không còn P0/P1 chưa xử lý hoặc chưa được risk-accepted bởi người có thẩm quyền.
- [ ] CI bắt buộc xanh; artifact đúng commit.
- [ ] Migration được review về thứ tự, locking, backfill, compatibility và rollback.
- [ ] Backup/snapshot và restore procedure được xác minh.
- [ ] Required env vars hiện diện; không in giá trị.
- [ ] ACL/owner/grants và webhook config được xác minh ở đúng môi trường.
- [ ] Có release owner, rollback owner, payment/order monitor.
- [ ] Chốt ngưỡng dừng: 5xx tăng, payment mismatch, duplicate order/payment, webhook failure, inventory drift.
- [ ] Xác định commit/artifact/migration thực sự deploy.

### Sau deploy — smoke test có kiểm soát
- [ ] Health/version endpoint (nếu có) đúng release.
- [ ] Login và role authorization.
- [ ] Đọc catalog/product và admin dashboard.
- [ ] Chỉ tạo order test khi có môi trường/test data được phê duyệt.
- [ ] Webhook test dùng sandbox/test event nếu provider hỗ trợ.
- [ ] Order/payment/stock/voucher/reconciliation khớp.
- [ ] Kiểm tra logs/metrics/error rate/webhook delivery.
- [ ] Không test ghi dữ liệu thật nếu thiếu approval/test account/cleanup plan.

### Rollback
- [ ] Có điều kiện kích hoạt rollback.
- [ ] Xác minh app rollback tương thích schema.
- [ ] Không rollback destructive migration khi chưa xác minh an toàn.
- [ ] P0-A3 rollback dùng dual-reader artifact đã kiểm chứng; writer v1-only không được tạo/retry trong chế độ không tương thích.
- [ ] Payment rollback không đổi paid thành unpaid hoặc xử lý event cũ gây double-credit.
- [ ] Sau rollback chạy smoke test và reconciliation.
- [ ] Lưu timestamp, commit, migration state, evidence và quyết định operator.

## 11. Thứ tự đề xuất trong đêm

Đây là thứ tự ưu tiên, không phải cam kết tất cả sẽ hoàn thành trong một đêm. Không cắt test để chạy kịp giờ.

1. **Batch 0:** baseline + inventory, chỉ đọc.
2. **R1:** payment retry review, chỉ đọc trước; lập patch plan.
3. **P0-A3:** chốt business decisions, operator evidence và implementation plan; chưa triển khai/cutover khi BLOCKED.
4. **Batch 4:** authorization/state transitions.
5. **R2:** canonical payment lookup/success UI sau R1.
6. **3E:** reconciliation/notifications/KPI.
7. **F1–F8:** mỗi feature diff/test riêng; ưu tiên sai tiền, duplicate transaction/order, auth bypass và tồn kho.
8. **Inventory/voucher/combo integrity** theo dependency.
9. **Automated regression + PostgreSQL integration tests.**
10. **Staging release gate + smoke test + rollback rehearsal.**
11. **Production GO/NO-GO** do người có thẩm quyền dựa trên bằng chứng.

Nếu thời gian hạn chế, có thể hoãn feature không thiết yếu; không được hoãn kiểm thử tính toàn vẹn để phát hành.

## 12. GO / NO-GO cuối cùng

### GO chỉ khi
- [ ] Không còn P0/P1 chưa xử lý hoặc chưa được chấp thuận bằng văn bản.
- [ ] Type-check, lint, build, unit, integration, regression bắt buộc PASS.
- [ ] PostgreSQL concurrency tests chạy trên target cô lập đã xác nhận.
- [ ] Payment uniqueness/retry/webhook idempotency được chứng minh.
- [ ] Authorization/ACL được kiểm chứng; không có writer bypass chưa kiểm soát.
- [ ] Orders ↔ Payments ↔ Inventory ↔ Vouchers nhất quán.
- [ ] Migrations, backup/restore và rollback đã review.
- [ ] Staging smoke test PASS.
- [ ] Monitoring, alerting, release owner và rollback owner đã xác nhận.
- [ ] Diff chỉ có thay đổi được phê duyệt; không mất thay đổi sẵn có.
- [ ] Người chịu trách nhiệm release ghi nhận GO.

### NO-GO ngay nếu
- Có duplicate order/payment hoặc sai amount chưa giải thích.
- Test bắt buộc fail/skip hoặc test target không rõ.
- Không chứng minh được uniqueness/concurrency/ACL.
- Cần sửa trực tiếp Production để thử.
- Migration rủi ro dữ liệu chưa có backup/restore và rollback plan.
- Secret lộ, authorization bypass hoặc tồn kho có thể âm/bán vượt.
- P0-A3 còn blocker nhưng định bật `V2_OPEN`/cutover.
- Không xác định được commit/artifact sẽ deploy.

## 13. Báo cáo sau mỗi batch

OpenCode phải kết thúc mỗi batch bằng:

```text
BATCH:
VERDICT: PASS / FAIL / BLOCKED
SCOPE:
FILES CHANGED:
BASELINE -> FINAL GIT STATUS:
CHECKS RUN:
TESTS PASSED / FAILED / SKIPPED:
DATABASE TARGET:
PRODUCTION OPERATIONS: NONE / DETAILS
CONFIRMED FINDINGS:
UNRESOLVED RISKS:
NEXT SAFE BATCH:
GO / NO-GO:
```

- Không ghi PASS nếu test chưa chạy.
- Không ghi Production verified nếu chỉ đọc source/local.
- Không tự bắt đầu batch kế tiếp khi có blocker.
- Không gom nhiều domain vào một diff lớn.
- Sau mỗi batch review diff và giữ nguyên thay đổi ngoài scope.

## 14. Trạng thái mở đầu (kế thừa từ báo cáo cũ; Batch 0 phải xác minh lại)

| Hạng mục | Trạng thái được báo cáo | Việc tiếp theo |
|---|---|---|
| P0-A3 design | `READY FOR IMPLEMENTATION PLANNING` | Chốt business decisions/operator evidence; patch plan |
| P0-A3 implementation | `BLOCKED / NO-GO` | Chưa triển khai/cutover |
| R1 payment retry | `REVIEW PASS (source-level); IMPLEMENTATION BLOCKED` — 2026-10-13; 63 pass/0 fail/4 skip local | Chờ phê duyệt patch plan; cần isolated PG cho uniqueness proof |
| Batch 4 authorization | `REVIEW PASS; PARTIAL FIXES IN CODE (mock-tested); REMAINING GAPS OPEN` — 2026-10-13 | Presence spoof/payment actor/sepay compare fixed; notify-public, revocation, RLS, token-storage cần quyết định |
| R2 payment UI | `PARTIAL / NOT VERIFIED` | Sau R1 |
| 3E reconciliation | `REVIEW PASS; PARTIAL FIXES IN CODE (mock-tested)` — 2026-10-13 | Notifications fail-closed + end_date fix; presence GET/POST fail-closed (BH7–BH9); webhook recording gaps phụ thuộc R1; KPI revenue cần business; presence RMW race cần atomic RPC (migration-blocked, để cùng nhóm migration 021) |
| F1 featured combo | `REVIEW PASS — ROOT CAUSE FOUND; FIX BLOCKED ON BUSINESS DECISIONS` — 2026-10-13 | `combos.featured` đã có end-to-end (schema/API/admin UI) nhưng homepage `FeaturedProductsSection` chỉ query products; cần chốt: gộp lưới hay section riêng, cap/sort, default featured=true |
| F2 voucher edit | `REVIEW PASS — LIKELY STILL BROKEN` — 2026-10-13 | Admin UI gọi POST upsert (PATCH chết); sửa code voucher UUID → 400 conflict; fields phantom (visibility/min_items_count/gift) không persist + revert sau sync; GET chỉ trả active; cần business: code rename có được phép? phantom fields là feature thật? |
| F7 SKU in order detail | `IMPLEMENTED + TESTED (mock) — 2026-10-13` | getOrdersServer mapping alias snapshot + SKU; admin detail render SKU; sale pages fallback `item_name_snapshot`; `tests/orderItemMapping.test.ts` 4/4; full suite 423/0/34; tsc OK; build OK. Combo component SKU: KHÔNG đổi (cần business) |
| F3 unique SKU in combo | `PARTIAL / NEEDS BUSINESS RULES` | Chốt nghiệp vụ + inventory tests |
| F4 SKU sorting | `OPEN / NEEDS REGRESSION` | Chốt thứ tự và test |
| F5 duplicate order | `P0-A3 / BLOCKED` | PostgreSQL evidence |
| F6 pricing/shipping display | `PARTIAL / NOT FULLY VERIFIED` | Audit mọi UI và server calculation |
| F8 SePay webhook | `NOT VERIFIED END-TO-END` | Sandbox/runtime verification |
| Full regression | `LOCAL PASS (419/0/34 skip) + tsc OK + build OK — 2026-10-13` | PG integration vẫn skip; cần isolated target |
| Production release | `NO-GO UNTIL EVIDENCE` | Staging, smoke, rollback, explicit GO |

> Các trạng thái trong bảng được kế thừa từ báo cáo trước, không phải kiểm tra mới trên repository.
