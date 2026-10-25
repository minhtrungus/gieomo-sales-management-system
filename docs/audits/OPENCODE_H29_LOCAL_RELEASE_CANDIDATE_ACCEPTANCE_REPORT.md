# H29 — LOCAL RELEASE CANDIDATE ACCEPTANCE REPORT

- **Session**: OpenCode — Local Release Candidate Acceptance
- **Date**: 2026-10-22
- **Scope**: LOCAL-ONLY. Không connect/ghi Production/Preview. Không đọc secrets/.env.local. Không stage/commit/push/merge/stash/reset.
- **Giờ GMT+7 bắt đầu preflight**: ~14:20 (HEAD check), các run test trong phiên này.

---

## 0. Kết luận cuối

> ### `LOCAL_ACCEPTANCE_PASS_WITH_BLOCKERS`
>
> **Production cutover vẫn `NO-GO`** cho tới khi các blocker (§4) và phê duyệt P1.1/P1.2 được giải quyết riêng.

- 8/9 nhóm test **PASS** toàn bộ (RUN-grade); nhóm 9 **PARTIAL** (type-check PASS, build PASS, **lint FAIL — nợ nợ hiện hữu**, không phải regression mới).
- Không có FAIL test nào trong các tầng: node suite **0 fail / 542**, mandatory PG suite **0 fail / 54**, SQL integrity **0 fail**, HTTP E2E **0 fail / 16**.
- Mọi blocker còn lại là **môi trường / phê duyệt**, không phải lỗi sản phẩm mới.

---

## 1. Bước 1 — Kiểm tra môi trường (preflight)

Script: `.tmp/recon-20261022/h29-rc1-preflight.ps1`

| Hạng mục | Trạng thái lúc bắt đầu |
|---|---|
| Git HEAD / branch | `1c51af6` / `main` |
| `git status --porcelain` | 166 entries, **0 staged** |
| Stashes | 0 |
| Worktrees | 12 (bao gồm main) |
| WIP Thank-You Card | `.tmp/integrated-merge-030/docs/audits/H29_R37_THANKYOU_CARD_CODEX_REPORT.md` **TỒN TẠI** (bảo toàn toàn phiên) |
| Số báo cáo `OPENCODE_H29*` | 8 (không ghi đè) |
| Cluster `55456` (canonical) | accepting |
| Cluster `55461` (fresh020) | accepting |
| Cluster `55471` (P1 fixture) | accepting |
| Cluster `55442` (prod mirror) | **no response — Blocker B-1 từ phiên trước, chưa phục hồi** |
| Listener `3789`/`55842` (residue E2E lần trước) | không còn — sạch |
| Playbook | `docs/DEVELOPMENT_AND_PRODUCTION_PLAYBOOK.md` (đã đọc) |
| Drafts 031/032 | tồn tại nguyên vị |

**Kết luận môi trường**: đủ môi trường an toàn để chạy (3 cluster healthy + repo root). Không có điểm phải dừng.

---

## 2. Bước 2 — Ma trận nghiệm thu

Đã đọc playbook + các báo cáo H29 trước đó, xây 9 nhóm theo yêu cầu. Mỗi dòng dưới đây: mục tiêu → dữ liệu → lệnh → kết quả → grade.

| # | Nhóm | Test chính (thực thi) | Lệnh / bằng chứng | Kết quả |
|---|---|---|---|---|
| 1 | Đăng nhập, phân quyền, thành viên, P1.1/P1.2 | `authPrimitives`, `authHygieneBatch4`, `authorization*`, P1 SQL probes, HTTP E2E-1..5 | `node --test` + `psql` fixture + E2E assert | **PASS (RUN)** — 16/16 E2E, probes fresh pass; `rc1-p1-fresh-flags.txt`, `rc1-e2e-assert.txt` |
| 2 | Danh mục, biến thể, combo, giá | `productServiceUpsert/Delete`, `orderItemMapping`, `pricing` (TR1–TR14), `pricingSqlParity` (P01–P17), `comboPersistencePg.integration` | node suite + PG suite | **PASS (RUN)** |
| 3 | Giỏ hàng, checkout, tạo đơn, chống trùng | `checkoutSubmitAction`, `checkoutVoucherPayload`, `createOrderAttempt`, `orderRequestHash`, `orderRouteHttp`, `requestSequenceGuard` (G1–G7), `atomicOrderPg.integration`, `atomicOrderRpc`, migration 015/025 idempotency | node suite + PG suite | **PASS (RUN)** |
| 4 | Thanh toán, webhook, đối soát (mô phỏng local) | `r1WebhookFailureModes` (R1-W1..W6), `paymentRecordService` (P1–P9), `paymentIdempotencyPg.integration`, `paymentApplyFaultPg.integration`, `paymentRejectionPg.integration`, `r2PaymentResult`, reconciliation O1–O10/R1–R4/P1–P11/C1–C6 | node suite + PG suite + `test-payment-integrity.sql` | **PASS (RUN)** — mọi giao dịch đều synthetic, không gửi gì ra ngoài |
| 5 | Quản lý đơn, xác nhận/từ chối, hủy, lịch sử | `orderStoreCancel` (C1–C19, J1, M1, ID1), `cancelVoucherRelease`, `cancelOrderPg.integration`, `resurrectionGuard`, `patchPaymentBypassClosed` (BP1–BP8), `paymentConfirmServerFirst` (T1–T9c) | node suite + PG suite + `test-order-integrity.sql` → `ORDER_INTEGRITY_PG_PASS` | **PASS (RUN)** |
| 6 | Thank-You Card + `/track` | `thankYouCard` (5 test), `r2PaymentResult` (R2-T1..T6), `proofOwnership` (B7–B13), `proofTokenExpiry` (C12-T1..T8) | node suite | **PASS (RUN)** server-side; **browser-level SKIPPED** (không có harness — §3) |
| 7 | Quản trị, phân quyền, API nhạy cảm | `patchPaymentBypassClosed` (BP patch), E2E authenticated roster, `orderCanonicalWriterSource`, `orderIdentityServerFirst`, `orderDetailsServerFirst` | node suite + E2E | **PASS (RUN)** |
| 8 | RLS, GRANT, concurrency regression | `ordersPaymentsPrivilegesPg.integration` (028 least-privilege 5 test), `voucherConcurrency.integration` (2 test PG), `voucherDuplicateCode`/`voucherPatchCodeChange` (race 23505→409), fresh P1 grant probes | `run-mandatory-pg-tests.mjs` + node suite + psql | **PASS (RUN)** |
| 9 | Build, type-check, lint, security | `npm run type-check`, `npm run build`, `npm run lint` | npm | **PARTIAL** — type-check **PASS** (exit 0); build **PASS** (route table render đủ, 0 error); lint **FAIL** — 6.266 errors / 57.855 warnings, **nợ hiện hữu trên tip sẵn có** (xác nhận phía preflight không có new-code diff của session này) |

**Tổng**: PASS 8 · PARTIAL 1 · FAIL 0 (trong các test đã chạy) · BLOCKED 2 (browser E2E, mirror 55442) · SKIPPED 1 (browser E2E — no harness).

---

## 3. Bước 3 — Chi tiết thực thi theo tầng

### Tier A — Node unit/source-contract suite (nhóm 1–8)
- Lệnh: `node --test (Get-ChildItem tests -Filter *.test.ts -Recurse | ForEach-Object FullName)`
- Kết quả: **`tests 542 · pass 482 · fail 0 · skipped 60 · 12.1s`** — khớp chính xác baseline H29 trước đó (482/60) ⇒ **không regression**. Ghi chú: toàn bộ 60 skipped đều là PG-integration/replay-source test yêu cầu `ATOMIC_PG_URL`/`GIEOMO_PG_ISOLATED=1` hoặc được thay thế (superseded) bởi canonical 027/028 — không có skip giả danh PASS.

### Tier B — P1.1/P1.2 fresh SQL probes (nhóm 1, 8)
- Cluster healthy `55471`, db `gieomo_p1_fixture` (synthetic, không đụng db khác).
- `p1-probe-t4-anon-trio.sql` exit 0: `anon_visible_rows = 1`, `inactive fixture = 0` ⇒ patch 031 vẫn đứng đúng sau tất cả các run khác trong phiên.
- Flags snapshot lưu: `.tmp/recon-20261022/rc1-p1-fresh-flags.txt`.

### Tier C — Canonical chain replay + SQL integrity (nhóm 8 + Bước 4)
- **Nâng cấp phương pháp** so với kế hoạch đầu: script repo `replay-canonical-migrations.ps1` (full cluster lifecycle) trên port mới 55441 bị **sự cố môi trường** (xem Blocker NEW-ENV-1) sau khi đã chạy gần hết chuỗi. Chuyển sang replay **từng file psql** đúng protocol của script đó (bootstrap roles → 001→030 → verify) vào db scratch `gieomo_rc1_tip030` trên cluster **healthy 55471**:
  - Script: `.tmp/recon-20261022/rc1-tip030-replay.ps1`
  - 30/30 migrations `APPLIED` (chuỗi NOTICE "does not exist, skipping" là idempotent-expected, không phải lỗi)
  - Canonical DO-verification: **DO pass** (đủ RPC set; runtime role KHÔNG thực thi được protected writer)
  - `test-payment-integrity.sql` → **`PAYMENT_INTEGRITY_PG_PASS`**
  - `test-order-integrity.sql` → **`ORDER_INTEGRITY_PG_PASS`**

### Tier D — Mandatory PG integration suite (nhóm 3/4/5/8)
- Lệnh: `ATOMIC_PG_URL=postgres://p1_fixture_admin@127.0.0.1:55471/gieomo_rc1_tip030 GIEOMO_PG_ISOLATED=1 node scripts/postgres/run-mandatory-pg-tests.mjs`
- Kết quả: **`MANDATORY_PG_PASS files=10 skipped=0` — `tests 54 · pass 54 · fail 0 · cancelled 0 · skipped 0` (4.5s)**.
- Đáng chú ý: 10 test "028 removes runtime privileges/RSS" trước đó chỉ SKIP trong Tier A nay đều **RUN và PASS** — bằng chứng trực tiếp rằng **`030` tip + `028` least-privilege giữ контракт runtime-role**.

### Tier E — HTTP E2E loopback scoped (nhóm 1, 6, 7)
- Sử dụng lại harness P1: mock envoy PostgREST `127.0.0.1:55842` (guard bearer local-only) + `next dev --turbopack -H 127.0.0.1 -p 3789` với env overrides cục bộ (cả hai process khởi động trong phiên này; host requests xác nhận qua access log 200/401 khớp).
- Kết quả: **`SUMMARY pass=16 fail=0`** (`rc1-e2e-assert.txt`, assert_exit=0):
  - E2E-1 roster unauth: chỉ bộ ba `memberId,fullName,referralCode`, ẩn inactive.
  - E2E-2 login hợp lệ 200 + token + cookie, `password_hash` không bao giờ xuất hiện.
  - E2E-3/E2E-4 sai mật khẩu/tài khoản lạ → 401 generic, không echo.
  - E2E-5 roster authenticated: object đầy đủ sanitised, không `password_hash`.
- Dọn dẹp: 2 process node (3789/55842) đã stop bằng `Stop-Process` chống đúng PID — listeners confirmed closed.

### Browser E2E (loopback UI)
- **SKIPPED**: không có harness browser trong repo (playwright/puppeteer/cypress đều không cài — kiểm tra devDependencies). Không tự cài thêm (ngoài phạm vi + cần duyệt). Server-side của các luồng đó đã phủ bởi Tier A và Tier E.

---

## 4. Bước 4 — Kiểm tra khả năng release (code ↔ migrations)

**STATIC REVIEW** (grep + canonical-tip inspection) + **RUN** (PG suite):

| Đường đi | Code | Migration tip | Trạng thái |
|---|---|---|---|
| Tạo đơn atomic | `src/lib/services/orderCreateAtomicV2.ts:119` → `rpc("create_order_atomic")` | `create_order_atomic(jsonb)` fingertips (canonical replay verify DO) | **KHỚP (RUN+STATIC)** |
| Hủy đơn atomic | `src/app/api/orders/route.ts:201` → `cancel_order_atomic` | `cancel_order_atomic(jsonb)` + `026` stock_restored/voucher_released | **KHỚP (RUN+STATIC)** |
| Xác nhận thanh toán | `src/app/api/orders/payment/route.ts:66` → `apply_payment_event` | `apply_payment_event(jsonb)` + `023/024` payment contract | **KHỚP (RUN+STATIC)** |
| Từ chối thanh toán | `src/app/api/orders/payment/route.ts:121` → `reject_payment_atomic` | `reject_payment_atomic(jsonb)` + `029` | **KHỚP (RUN+STATIC)** |
| Combo checkout | `src/app/api/combos/route.ts:296,400` → `save_combo_atomic` | `save_combo_atomic(jsonb)` (`030`) + `comboPersistencePg.integration` PASS | **KHỚP (RUN+STATIC)** |
| `pr.sku` | không còn trong `025/026` (grep zero-hit) | writer `025/026` resolved path: `order_items.variant_id` path | **GREEN (STATIC)** |
| Idempotency | `orderStore.ts` gửi `Idempotency-Key`; `015/025` bảng + `uq_orders_idempotency_scope_key` | `atomicOrderPg.integration` + `paymentIdempotencyPg.integration` PASS | **KHỚP (RUN+STATIC)** |
| Least privilege 028 | n/a | `ordersPaymentsPrivilegesPg.integration` 5/5 PASS trên tip | **RUN PASS** |
| RLS posture 011/013 | n/a | chain-replay + probes pass | **RUN PASS** |

**Các khoản thanh toán cần đối soát / cặp đơn nghi trùng**: theo đúng requerimiento — **KHÔNG deciding, KHÔNG đánh dấu hoàn thành**. Chúng còn là quyết định nghiệp vụ (đúng như baseline reconciliation reports). Không test nào tự ý resolve.

---

## 5. Bước 5 — Kết quả nhóm (đã ở ma trận §2), tổng hợp

- ✅ PASS: 8 nhóm (mọi tier node/PG/SQL/E2E zero-fail)
- ⚠️ PARTIAL: 1 (nhóm 9 — lint FAIL hiện hữu)
- ❌ FAIL: 0 test thực thi bị fail
- ⛔ BLOCKED: 2 (browser E2E — no harness; mirror 55442 — B-1)
- ⏭️ SKIPPED: 1 (browser E2E — đúng nghĩa skip, không vaPASS giả)

---

## 6. Lỗi còn tồn tại (theo mức độ)

| Mức | Vấn đề | Loại | Ghi chú |
|---|---|---|---|
| **HIGH (môi trường)** | Postmaster windows wedging pattern `0xC0000142` tái phát | Môi trường | Trước đó: 55442 (B-1). Phiên này: autovacuum worker trên scratch cluster mới chết cùng signature 13:37, postmaster reinitializing vô hạn dù `pg_ctl stop -m fast/immediate` không đáp ứng. **Không phải lỗi app.** Cần owner investigate (Windows Event Log / antivirus interference) và dừng bằng `stop -m immediate` rồi start lại khi cluster đã hàn gắn. |
| **MEDIUM** | Lint debt 6.266 errors / 57.855 warnings | Nợ hiện hữu | `npm run lint` exit 1; chủ yếu `no-explicit-any`, `react-hooks/set-state-in-effect`, `purity`. Pre-existing ngay cả trên tip `1c51af6` sạch. Cần chính sách lint gate rõ ràng trước khi coi là gate release. |
| **LOW** | Residue scratch cluster | Môi trường | `.tmp/postgres-canonical-f3458b63da` (port 55441 wedged) + `.tmp/postgres-canonical-f3458b63da.log` (110 KB, chứa trace wedge). Giữ nguyên làm bằng chứng/foresnics; không taskkill. |
| **LOW** | Turbopack warning | Cosmetic | `package-lock.json` ở `C:\Users\MT` outside repo — chỉ warning, không sát thương. |

**Không có lỗi sản phẩm mới nào phát sinh từ các test lần này.**

---

## 7. Những phần CHƯA kiểm thử

1. **Browser-level E2E UI** mọi luồng (cart, checkout, admin CRUD, track render canvas) — skipped.
2. **Supabase hosted/Production paths** — bao giờ cũng out-of-scope local session.
3. **Real outbound email/webhook** — chỉ mock contracts; chưa test Resend/SePay thật (đúng yêu cầu "chỉ mô phỏng local").
4. **Load/stress + connection pool limits** — đầu ra bị lạnh bởi wedge môi trường, chưa có baseline số.
5. **`021/022` draft source tests** — test `migration021Draft`/`022Draft` pass trong Tier A (RUN file-level), nhưng runtime behaviour được xác nhận qua canonical chain thay vì standalone cluster riêng.

---

## 8. Bảo toàn WIP + trạng thái Git (cuối phiên)

- HEAD `1c51af6` trên `main` — **không đổi**; 0 staged; 0 stash.
- 166 porcelain entries — nguyên như preflight (WIP không bị mất/thêm bởi session).
- `.tmp/integrated-merge-030/…THANKYOU_CARD_CODEX_REPORT.md` — **còn nguyên**.
- Tất cả 8 báo cáo `OPENCODE_H29*` — **không ghi đè** (báo cáo này là file mới).
- Dữ liệu fixture `gieomo_p1_fixture` trên 55471 — nguyên trạng (2 rows flag snapshot khớp).
- Scratch db mới `gieomo_rc1_tip030` trên 55471: được **giữ lại** làm evidence store (5/5 canonical RPC + chain tip-030). Owner có thể `DROP DATABASE gieomo_rc1_tip030;` khi không cần.

---

## 9. Blocker trước cutover (carry-over + mới)

| ID | Blocker | Trạng thái | Hành động cần |
|---|---|---|---|
| B-1 | Prod mirror 55442 wedged (từ phiên trước) | BLOCKED | Owner chạy `pg_ctl stop -m immediate` → start lại khi ổn |
| NEW-ENV-1 | Wedging pattern `0xC0000142` tái phát trên host (scratch cluster mới) | BLOCKED để re-run full replay script | Owner investigate Windows Event Log/AV; tránh chạy PG-heavy dài hạn trên host cho tới khi phân định |
| P1-APPROVAL | Hotfix P1.1 (`031`) + P1.2 (`032`) cần duyệt riêng | AWAITING EXPLICIT APPROVAL | Owner phê duyệt P1-D1/D2/D3 rồi mới chạy runbook §C trên Production |
| CUTOVER-01 | `anon INSERT` trên `members` + inventory schema-wide | OPEN | Lập inventory plan khi chuẩn bị cutover |
| CUTOVER-02 | Cặp thanh toán cần đối soát / đơn nghi trùng | OPEN — business decision | Không tự giải quyết (đúng play) |
| LINT-GATE | Lint fail 6266 errors | OPEN | Owner chọn: fail-soft (whitelist nợ) hoặc lên kế hoạch dọn dần |

---

## 10. Đề xuất bước tiếp theo (dựa trên bằng chứng)

1. **Owner Scene**: giải quyết B-1 + NEW-ENV-1 (chỉ tác vụ `pg_ctl stop -m immediate` + start; investigate 0xC0000142) trước khi chạy thêm PG-heavy scenario.
2. **P1 approval path** (đã chuẩn bị sẵn ở phiên trước, không đổi): `docs/audits/OPENCODE_H29_P1_PRODUCTION_HOTFIX_APPROVAL_PACKAGE.md` — sau khi duyệt, chạy Runbook §C.
3. **Chính sách lint gate**: quyết định fail-soft hoặc kế hoạch dọn 6.266 errors theo đợt (nhiều errors là mechanical cá `any`).
4. **Cutover prep**: inventory `anon INSERT` schema-wide (CUTOVER-01) trong session POST-approval.
5. **Optional cleanup**: sau khi archive evidence, có thể drop `gieomo_rc1_tip030` + xoá `.tmp/postgres-canonical-f3458b63da*` (chỉ khi postmaster đã được stop thành công).

---

## 11. Bảng bằng chứng (evidence files mới lần này)

| File | Nội dung |
|---|---|
| `.tmp/recon-20261022/h29-rc1-preflight.ps1` | Preflight script |
| `.tmp/recon-20261022/rc1-p1-fresh-flags.txt` | Snapshot flags P1 sau toàn phiên |
| `.tmp/recon-20261022/rc1-tip030-replay.ps1` | Replay protocol (psql-loop) trên cluster healthy |
| `.tmp/recon-20261022/rc1-e2e-assert.txt` | HTTP E2E 16/16 PASS (fresh) |
| `.tmp/postgres-canonical-f3458b63da.log` | Wedge incident forensics (0xC0000142 trace) |
| `MANDATORY_PG_PASS` output (transcript) | 54/54 PG integration pass |

Báo cáo cũ giữ nguyên; đây là file báo cáo mới duy nhất được tạo.

**Final verdict: `LOCAL_ACCEPTANCE_PASS_WITH_BLOCKERS` — Production cutover `NO-GO`.**
