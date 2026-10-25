# H29 — Cutover Runbook (Draft — KHÔNG thực hiện trong phiên này)

Tài liệu này là **kế hoạch vận hành**; mọi lệnh ghi Production phải chờ owner duyệt (bản duyệt: `OPENCODE_H29_CUTOVER_READINESS_APPROVAL_PACKAGE.md`).
Cutover duration thực tế = **chưa xác định** (chưa có rehearsal đo thời gian — mục PLANNED, xem test-gate checklist).

## 0. Phạm vi thay đổi Production (dự kiến)

1. Bootstrap ledger: mark 001–020 applied qua CLI `migration repair` (theo forensics §6).
2. Chạy migrations 021→030 đúng thứ tự.
3. Deploy ứng dụng WIP-V2 (build được duyệt) **cùng cửa sổ** với DB change.
4. Hotfix an ninh 012-members (REVOKE) — khuyến nghị tách chạy **sớm hơn** cửa sổ (không bắt buộc cùng đợt).

KHÔNG làm: backfill tài chính tự động, merge/cleanup duplicate (chờ owner duyệt theo list riêng), xoá dữ liệu, đổi cấu hình nền tảng Supabase.

## 1. Preflight (T-48h → T-0)

- [ ] Owner duyệt các biểu mẫu (schema/application cutover; payment ledger reconciliation; destructive duplicate — mục III có thể tách sau).
- [ ] Verify target bằng truy vấn read-only trên Supabase target: các marker object của 021–030 phải toàn vắng; ledger trống/absent; policies "Public insert …" còn nguyên.
- [ ] Build WIP-V2: `npx tsc --noEmit` + `npx next build` PASS; ghi commit/artifact hash.
- [ ] Chuẩn bị sẵn script + checklist smoke (§6); phân vai: 1 operator chạy, 1 người rà checklist.
- [ ] Lost-update guard: quyết định cơ chế pause write (đóng `POST /api/orders`, `/api/orders/payment`, webhook SePay bằng feature-flag tạm).

## 2. Fresh backup + delta control (T-0, đầu cửa sổ)

1. **Backup mới ngay trước cutover**: pg_dump schema public + data, checksum sha256 từng file, thư mục `backups/prod-YYYYMMDD-HHMMSS/` (mẫu tham chiếu: `backups/prod-20261022-20261022T080112/`).
2. **Delta control so backup cũ**: đếm orders (73), paid (39), tổng tiền paid (3.207.466đ tại snapshot cũ); mọi đơn phát sinh giữa 2 mốc phải được liệt kê và đối giải trước khi tiếp tục.
3. Pause writes **trước khi** chụp backup, để delta về 0 tại thời điểm T-0.

## 3. History sync (bootstrap ledger — chỉ khi ledger vẫn trống)

1. `supabase init` (nếu chưa có config.toml) + giữ nguyên project ref hiện có.
2. `supabase migration repair --status applied` cho **001–020 theo đúng thứ tự** (điều kiện: verify net-state — đã PASS theo forensics §4; drift 012/016 được ghi chú vào ops-log).
3. Verify: `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;` → đúng 20 dòng.
4. **Không mark 021–030** — chúng chạy thật ở bước 4.

## 4. Ordered apply 021→030 (cửa sổ chính)

Dùng duy nhất một cơ chế áp (khuyến nghị `supabase db push` sau khi init; phương án thay thế: psql -f theo thứ tự manifest `scripts/postgres/replay-canonical-migrations.ps1`). Mỗi bước: áp → verify → mới sang bước sau; FAIL = dừng, dùng rollback-clause tương ứng, không nhảy cóc.

| # | Migration | Verify ngay sau bước | Rollback-clause nếu FAIL |
|---|---|---|---|
| 4.1 | 021 reconcile idempotency v015→v025 | Cột `order_idempotency` = v025 shape (scope_key + uuid); bảng archive tồn tại; `orders.idempotency_key_v015` đã bị rename | Khôi phục từ `order_idempotency_v015_archive` (an toàn vì chưa có clé in-flight v025) |
| 4.2 | 022 revoke runtime DML | Policy "Public insert …" biến mất; thử insert anon → 42501 | Trả lại grant + policies 013-net-state |
| 4.3 | 023 payment_integrity | `payment_events` tồn tại; RPC `apply_payment_event` có; anon insert payments bị chặn | DROP bảng + hàm (an toàn nếu chưa ghi event nào) |
| 4.4 | 024 repair apply_payment_event | Hàm body mới; dry-run một payload test | CREATE OR REPLACE về 023-body |
| 4.5 | 025 v025 idempotency + writer v25 | `create_order_atomic_v25` + wrapper có; smoke RPC thành công (§6.01) | Wrapper về body 016 (chỉ hợp khi code legacy còn chạy) |
| 4.6 | 026 cancel atomic | `cancel_order_atomic` có; DO-guard pass | DROP FUNCTION `cancel_order_atomic` |
| 4.7 | 027 close bypass read/RPC | Smoke track-order guest vẫn đọc được theo code | Restore policies liên quan theo 013-state |
| 4.8 | 028 least privilege | Grant matrix khớp file; admin dashboard đọc OK | Trả lại 013-grants |
| 4.9 | 029 reject_payment_atomic | RPC có; dry-run reject một đơn pending test | DROP FUNCTION |
| 4.10 | 030 save_combo_atomic | RPC có + smoke admin combo | DROP FUNCTION |

## 5. Deploy code + mở traffic

1. Deploy build WIP-V2; giữ sẵn build cũ rollback.
2. Bật lại các write-route đã pause.
3. Chạy 10 smoke (§6) — đủ green trước khi mở traffic đầy đủ.

## 6. Smoke tests (tối thiểu)

1. Guest checkout product/variant (đơn test) → có order_code; `order_idempotency` ghi bản ghi v025 (scope_key có).
2. Checkout retry cùng idempotency key → outcome `existing` + cùng order_id (không clone).
3. Checkout combo → đơn combo tạo được; giỏ combo thiếu variant thành phần → fail-closed với error code định nghĩa.
4. Cancel đơn test → stock/voucher reversal một lần (rule applied-effects một lần).
5. Admin confirm payment banking (referenceNumber thật cho đơn test) → payments row + payment_events row; confirm lặp lại → an toàn không tạo double.
6. Admin reject payment pending → pending→failed một lần.
7. Webhook SePay: event test → payment_events + cập nhật order; replay event → không ghi trùng.
8. Admin save combo (create + update) → RPC OK.
9. Admin inventory adjust → chạy bình thường (regression 019/020).
10. Track order guest theo code; admin members read → **không thể thấy password_hash**.

## 7. Lost-update / cặp-guard tóm tắt

- Pause writes trước backup (delta 0 tại cửa sổ).
- Verify từng bước trong cửa sổ ngay trước bước kế; không dồn verify.
- Sequential deploy: sau step 4.10 + smoke 1–4 green (đường đơn hàng) mới deploy code; smoke 5–7 cũng phải green trước khi mở webhook SePay.

## 8. Rollback theo lớp sự cố

| Lớp | Hành động |
|---|---|
| FAIL DDL tại 4.x (chưa có đơn mới nào tạo dưới DB-B) | Dừng; rollback-clause của bước; giữ ledger state; rehearse lại trên mirror 55442 rồi thử lại |
| Sự cố sau khi đơn mới đã tạo dưới DB-B | **KHÔNG rollback DB**; fix-forward (deploy lại code). Nếu bắt buộc rollback code: đồng thời mở lại legacy path (restore 013 policies + renters grants) và giữ nguyên 021 (có archive phục hồi về v015 nếu cần) |
| Sự cố tiền (confirm sai, webhook) | KHÔNG rollback DB; dùng 029 reject / payment_events để đối giải; cập nhật theo business |
| Phát hiện P0 data sau cửa sổ (đơn trùng nghiêm trọng) | Kích hoạt `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md` — chỉ merge/cancel theo phê duyệt owner |
| Hủy toàn bộ cửa sổ | Rollback code + rollback DB theo thứ tự ngược 030→021 bằng script ngược đã rehearse; đánh dấu aborted trong ops-log |

## 9. Phụ lục — tham chiếu

- Forensics & bootstrap chi tiết: `OPENCODE_H29_MIGRATION_LEDGER_FORENSICS.md`.
- Dependency matrix rollback notes: `OPENCODE_H29_DEPENDENCY_MATRIX.md` §4.
- Payment & duplicate lists: `OPENCODE_H29_PAYMENT_RECONCILIATION_APPROVAL_LIST.md` / `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md`.
- Approval forms: `OPENCODE_H29_CUTOVER_READINESS_APPROVAL_PACKAGE.md`.
- Backup hiện có: `backups/prod-20261022-20261022T080112/` (checksummed).
