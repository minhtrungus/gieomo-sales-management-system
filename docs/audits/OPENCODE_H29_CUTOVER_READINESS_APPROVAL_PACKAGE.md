# H29 — Cutover Readiness Approval Package (Gieo Mơ)

Ngày: 2026-10-22. Chuẩn bị bởi: OpenCode (audit agent, GLM). Toàn bộ phân tích cục bộ, không có thao tác ghi nào lên Production, không thực hiện cutover, không đổi Git state, không đè `OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md`.

## 0. Trạng thái hồ sơ (final verdict block)

| Đánh giá | Trạng thái |
|---|---|
| **READINESS PACKAGE** | **PASS (conditional)** — chỉ PASS đầy đủ khi 4 điều kiện ở §8 được owner ký |
| **MIGRATION LEDGER FORENSICS** | **COMPLETE** |
| **PAYMENT RECONCILIATION APPROVAL LIST** | **COMPLETE** |
| **DUPLICATE REVIEW LIST** | **COMPLETE** |
| **PRODUCTION SYNC** | **NO-GO** — không thực hiện (theo yêu cầu H29); mọi thay đổi Production chờ duyệt |

Cấu trúc hồ sơ (6 tài liệu):
1. `OPENCODE_H29_MIGRATION_LEDGER_FORENSICS.md` — forensics + kế hoạch bootstrap (không thi hành).
2. `OPENCODE_H29_DEPENDENCY_MATRIX.md` — app × DB-state × flows + rollback notes.
3. `OPENCODE_H29_CUTOVER_RUNBOOK.md` — runbook đầy đủ (draft).
4. `OPENCODE_H29_PAYMENT_RECONCILIATION_APPROVAL_LIST.md` — 39 dòng masked.
5. `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md` — 20 cặp masked.
6. Tài liệu này — đóng gói, duyệt, điều kiện.

## 1. Hiện trạng (byte-level, tại thời điểm 2026-10-22)

**Infrastructure / schema**
- Production Supabase ở trạng thái **pre-021**: net-state 001–020 = khớp 100% với replay fresh 001→020 ở **mức cột** (0 cột khác biệt) và **9/10 hàm** khớp body (whitespace-normalized). Chứng cứ: forensics §2/§4.
- **Ledger lịch sử migration KHÔNG tồn tại** (không config.toml, không bảng `supabase_migrations`); lịch sử áp dụng chạy ngoài CLI. Lệch văn-bản 2 vùng duy nhất: khối members của 012, body `create_order_atomic` của 016 (+ hàm sót `rls_auto_enable`).
- **Lỗ hổng an ninh P1 (từ backup tại 10-22):** `anon` giữ SELECT (table-level) trên `members.password_hash` — chỉ lọc dòng qua policy `Public read basic members` (012 members-block chưa chạy). Đề xuất hotfix sớm hơn cutover (không bắt cửa sổ).
- Writer RPC prod `create_order_atomic` (thế hệ ngoài-repo) **hỏng 2 nhánh runtime**: combo (`jsonb_object_length` không tồn tại) và all-product-locks (`pr.sku` không tồn tại cột). Tất cả 73 đơn hiện hữu do **đường legacy insert** tạo (149/149 order_items chỉ snapshot; 0 idempotency key; `order_idempotency` 0 dòng).

**Business data (masked)**
- 39 đơn `paid` = **3.207.466đ**, tất cả banking, không có payments/event tiền, không có mã GD trong notes → toàn **needs-evidence** giờ sao kê; 14 dòng **ambiguous** trong cặp trùng.
- 20 cặp trùng lặp ứng viên (methodology A/B/C); 16 cặp CAO-tin-cậy (gap ≤ 8s, mọi tiêu chí), 2 cặp cùng PAID (DP-04/DP-07 — phải sao kê quyết), 2 chain 1.111đ test-pattern (DP-18/19) + 1 (DP-20) TRUNG BÌNH.
- Khoản test 1.111đ (4 đơn) / 2.222đ được phân loại rõ để không đếm nhầm thành doanh thu thật.

**Code**
- Working tree WIP-V2 (`POST /api/orders` → `createOrderServerAtomicV2` RPC v25-contract; `apply_payment_event`, `reject_payment_atomic`, `save_combo_atomic`, `order_inventory_reservations`) chỉ tương thích **DB-B (sau 021–030)**. Không one-sided cutover.

## 2. Blockers hiện còn → quyết định owner cần

| # | Blocker | Việc cần quyết | Đánh giá |
|---|---|---|---|
| B1 | Ledger trống | Dùng CLI `migration repair` mark 001–020 (forensics §6) | Low-risk nếu làm đúng trình tự; cần duyệt I.a |
| B2 | Migrations 021–030 chưa chạy | Chạy full trong cửa sổ + cùng deploy WIP-V2 | Cần duyệt I.b + rehearsal trên mirror trước |
| B3 | 2 cặp cùng PAID / 14 dòng ambiguous tiền | Sao kê quyết định (không tự động) | Cần duyệt II |
| B4 | 20 cặp trùng lặp (hoạt động legacy) | Merge/cancel chọn lọc, duyệt từng cặp | Cần duyệt III (tách rời cửa sổ) |
| B5 | Lỗ hổng password_hash | Hotfix REVOKE + test PostgREST | Cần duyệt ngay (ưu tiên P1) |
| B6 | Lệch file-generation của 012/016 | Chấp nhận mark-with-drift-note, hoặc sửa file history comment | Cần duyệt I.a note |
| B7 | 007 storage: thiếu chứng cứ | Kiểm tra storage platform trong preflight | Cần duyệt trong I.c checklist |

## 3. Phạm vi thay đổi Production (chốt scope)

- DDL: 021 → 030 theo runbook §4 (cùng một cơ chế áp).
- History-sync: mark 001–020 (KHÔNG mark 021–030).
- Deploy: build WIP-V2 (hash duyệt trong checklist I.b).
- Hotfix: REVOKE SELECT members từ anon (quyết D1, khuyến nghị chạy sớm hơn cửa sổ).
- KHÔNG có: data backfill tài chính tự động; DELETE/UPDATE trùng lặp trong cutover; xoá backup cũ; sửa `docs/audits/OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md`.

## 4. Sales risk & impact

| Rủi ro | Đánh giá | Guard |
|---|---|---|
| Chậm bán trong cửa sổ (pause checkout 30–120 phút) | Tổn thất doanh số nhỏ | Cửa sổ khuya (theo history: 01:22–01:52 & 13:06–13:08 là cao điểm nhỏ); thường thời gian dưới 1 giờ |
| Double-charge/real-money cho 13 dòng ambiguous | Không tự động; sao kê quyết định, chờ duyệt | Duyệt II + III |
| Legacy writer chết sau 022/027 nếu code chưa deploy | Đơn mới sẽ FAIL ngay | Deploy code trong cùng cửa sổ — hard gate trong runbook §5 |
| Idempotency retry chờ (khách gấp 2 lần) | v025 shape chặn từ DB-B | Policy smoke 02 |

## 5. Rollback plan (tóm lược)

Chi tiết từng-step rollback clauses ở `OPENCODE_H29_CUTOVER_RUNBOOK.md` §8. Nguyên tắc:
1. FAIL DDL trước khi có đơn mới dưới DB-B → rollback per-step, giữ ledger mới (đánh dấu aborted).
2. FAIL sau khi có đơn mới → **không rollback DB**; fix-forward code. Nếu bắt buộc rollback code: mở lại legacy path (restore 013 policies + grants) + giữ 021 (restore từ archive nếu thiếu).
3. Tiền sai → không rollback DB; dùng 029 reject/event ledger đối giải.
4. Duplicate sai → chỉ merge theo phê duyệt, có backup đứng trước.

## 6. Cutover duration

**Chưa xác định** — chưa có nghi thức rehearsal đo thời gian từng bước trên mirror prod (PLANNED, xem §7). Dự phóng an toàn cửa sổ: 60–120 phút (bao gồm backup, 10 migrations, deploy, 10 smoke); rehearsal cho phép siết số.

## 7. Test & release gate — thực chạy vs PLANNED (evidence ladder)

**Đã thực thi — PASS (chi tiết: reconciliation report §7):**
- [x] `node --test tests/*.test.ts`: **482 pass / 0 fail / 60 skipped** (PG-gated integration skip không có `ATOMIC_PG_URL`).
- [x] Mandatory PG suites trên isolated DB: **54/54 pass (MANDATORY_PG_PASS)** + PAYMENT_INTEGRITY_PG_PASS + ORDER_INTEGRITY_PG_PASS.
- [x] Canonical replay chain 001–030: **CANONICAL_REPLAY_PASS migrations=30**.
- [x] `npx tsc --noEmit` exit 0; `npx next build` SUCCESS.
- [x] Backup + restore parity (H29 tiền thân): PASS 26/26 bảng.
- [x] H29 mở rộng: prod ⇄ fresh020 cột/function parity (0 diff cột, 9/10 hàm) — PASS.

**PLANNED (chưa chạy — điều kiện PASS cho cutover):**
- [ ] Rehearsal 021→030 trên **mirror prod (55442)** — bắt buộc vì mirror có drift (khác fresh020).
- [ ] Rehearsal bootstrap `migration repair` (CLI) trên clone máy mô phỏng Supabase.
- [ ] PG concurrency tests (idempotency) phải chạy không-skip trên DB-B sau cutover.
- [ ] RLS password_hash hotfix verification (PostgREST REST probe).
- [ ] Timing rehearsal → chốt cutover duration.
- [ ] Smoke 10 bước (runbook §6) trên cửa sổ thật.
- [ ] Webhook SePay end-to-end sandbox.

## 8. Điều kiện PASS cuối (pre-launch conditions)

1. Owner ký duyệt mục I (a: bootstrap mark; b: 021–030 áp + deploy; c: preflight checklist).
2. Owner ký duyệt mục II (payment ledger reconcile flow) SAU khi sheet sao kê được hoàn tất từ list 39 dòng.
3. Owner ký duyệt mục III (destructive duplicate — duyệt từng cặp, chỉ CAO-tier, không merge hai-PAID trước sao kê).
4. Rehearsal trên mirror prod PASS (test-block PLANNED được thực hiện) trước ngày cutover thực.

## 9. BIỂU MẪU PHÊ DUYỆT — I. Schema/Application Cutover

Ký duyệt cho thay đổi schema + deploy application theo nội dung dưới đây:

- [ ] I.a **Ledger bootstrap** — mark 001–020 qua CLI `migration repair` sau khi `supabase init`; ghi chú drift 012/016 được ghi nhận; không mark 021–030.
- [ ] I.b **Run migrations 021→030** theo runbook §4 + **deploy WIP-V2** cùng cửa sổ, artifact hash: ________________
- [ ] I.c Preflight checklist (runbook §1) đã thực: verify target read-only PASS, smoke scripts sẵn, pause-write mechanism xác định: ________________
- Ngày đề xuất cửa sổ: ________________  Operator: ________________  Owner ký: ________________

## 10. BIỂU MẪU PHÊ DUYỆT — II. Payment Ledger Reconciliation

Căn cứ list 39 dòng (masked) + sheet đối soát sao kê:

- [ ] II.a Duyệt KẾT CHỐT: mỗi dòng được mark verified/no-money/review yêu cầu sao kê khớp; số dòng "no-money" dự kiến: ______
- [ ] II.b Duyệt **ingestion qua RPC `apply_payment_event`** (bằng RPC, không UPDATE tay) cho các dòng verified SAU cutover.
- [ ] II.c Xử lý 13 dòng ambiguous theo kết quả sao kê (merge/cancel qua duyệt III hoặc giữ nguyên).
- Sheet đối soát lưu ở đâu: ________________; Owner ký: ________________

## 11. BIỂU MẪU PHÊ DUYỆT — III. Destructive Duplicate Reconciliation

Căn cứ `OPENCODE_H29_DUPLICATE_REVIEW_LIST.md` (20 cặp):

- [ ] III.a Chấp nhận nguyên tắc: chỉ merge cặp tier CAO (A+B+C, gap ≤8s); cặp-two-PAID (DP-04/DP-07) chỉ quyết sau sao kê.
- [ ] III.b Duyệt từng cặp bằng danh sách tên cặp (tích từng DP-xx): ________________
- [ ] III.c Thao tác chỉ qua RPC (`cancel_order_atomic` + revert) — không UPDATE tay; backup fresh ngay trước đợt xử lý.
- Owner ký: ________________

## 12. Ký duyệt còn mở (pending owner decisions)

- D1: Hotfix password_hash REVOKE chạy ngay hay chờ cutover (khuyến nghị: ngay, độc lập).
- D2: Cặp-two-PAID (DP-04/DP-07) quyết theo sao kê 1 hay 2 giao dịch riêng.
- D3: Pattern test 1.111/2.222 (5 đơn): giữ giữ như dữ liệu-test (đối soát chẩn đoán) hay loại khỏi danh sách doanh thu.
- D4: 007 storage — kế hoạch kiểm tra storage platform trước bootstrap.
- D5: Ngày/giờ cửa sổ cutover; operator-on-call.
- D6: Duyệt build artifact hash của WIP-V2 deploy.
