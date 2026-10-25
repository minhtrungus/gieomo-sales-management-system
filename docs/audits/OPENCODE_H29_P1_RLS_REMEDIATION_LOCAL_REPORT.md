# OPENCODE H29-P1 — RLS REMEDIATION LOCAL REPORT
# members.password_hash least-privilege hotfix (LOCAL-ONLY rehearsal)

- **Ngày**: 2026-10-22
- **Trạng thái P1**: `FIXED-LOCAL` (patch được diễn tập khép kín trên fixture PostgreSQL cục bộ với dữ liệu tổng hợp; KHÔNG áp dụng lên Production, không áp dụng lên prod mirror 55442, không deploy, không `supabase db push`, không sửa dữ liệu nghiệp vụ).
- **Trạng thái cutover Production**: `NO-GO` (không đổi so với H29 — mọi điều kiện bắt buộc vẫn chưa được kiểm chứng/phê duyệt).
- **Không gian thao tác**: các cluster PostgreSQL cục bộ + một fixture mới `${repo}/.tmp/postgres-p1-fixture-data` (port 55471, chỉ bind `127.0.0.1`, dữ liệu 100% tổng hợp). Không có Production/Preview write, không git stage/commit/push/merge, không stash/reset/clean.

---

## 1. Tóm tắt điều hành

| # | Kết quả | Chi tiết |
|---|---------|----------|
| 1 | P1 được xác nhận bằng metadata (không đọc giá trị) | `anon` **và** `authenticated` đều có `SELECT` (bao phủ `password_hash`) trên `public.members` trên **cả** prod mirror 55442 lẫn fixture tái dựng 001–011. Nguyên nhân: `002.11–13` cấp rộng `GRANT … ON ALL TABLES` + default privileges, `006.66` tái cấp `GRANT SELECT … members TO anon, authenticated`, `011` chỉ tạo row-filter policy (RLS không bao giờ giới hạn cột), trong khi `012.11–30` (đoạn thu hồi) là drift-zone **không được áp dụng** trên mirror (theo H29_MIGRATION_LEDGER_FORENSICS). |
| 2 | Tìm thấy bổ sung (ngoài P1) | Trên prod mirror, `anon` còn có `INSERT/TRUNCATE/REFERENCES/TRIGGER` trên `members` (và `authenticated` có full DML). Qua PostgREST mọi write bị RLS chặn (không có policy write cho `anon`/`authenticated`), nhưng `TRUNCATE` **không chịu RLS** — ghi làm finding riêng, không trộn vào hotfix P1 để giữ patch tối thiểu và reversable; 027/028 sẽ thu hồi schema-wide khi cutover. |
| 3 | Đã viết patch + diễn tập | `supabase/migrations/proposals/031_members_read_least_privilege.sql.draft`: thu hồi table-level `SELECT` của `anon/authenticated` trên `members`, re-grant **column-level** bộ ba công khai `member_id, full_name, referral_code` (khớp định nghĩa 011), giữ nguyên toàn bộ quyền `service_role`. Patch có built-in post-conditions, idempotent (chạy 2 lần đều PASS trên fixture). |
| 4 | Test matrix P1 | 21/21 node regression tests (authPrimitives/authHygieneBatch4/authorizationPhase4) PASS; 11/11 SQL tests/trong hai nhóm snapshot-probe đạt kỳ vọng (chi tiết §5). |
| 5 | Luồng nghiệp vụ không hỏng (bằng chứng static + SQL sim) | Toàn bộ `from("members")` trong `src` nằm ở route handler server-side dùng `createAdminClient()` (service_role): `login/route.ts:26–40,82–87`, `members/route.ts:9–37,139–193,227–241`. Mọi response đều dùng explicit column list, không bao giờ trả `password_hash`. Probe service-role mô phỏng login-SELECT + UPDATE upgrade-password + admin DELETE đều OK trên fixture. |
| 6 | Ràng buộc an toàn được giữ nguyên | Cluster 55442/55456/55461 vẫn healthy; git: porcelain 166 (không đổi), 0 staged, 0 stash, 12 worktrees; WIP Thank-You card trong `.tmp/integrated-merge-030` nguyên vẹn; `OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md` không bị đụng; không đọc/print `.env*`; không in giá trị `password_hash`/PII. |

## 2. Bằng chứng nguyên nhân P1 (không chứa secret/PII)

### 2.1 Chuỗi cấp quyền trong migration history (file:line)

| File:line | Nội dung | Tác động tới members |
|---|---|---|
| `supabase/migrations/002_grant_permissions_and_rls.sql:11` | `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` | chuẩn (giữ) |
| `002:12` | `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated` | authenticated được SELECT toàn schema (gồm password_hash sau này) |
| `002:13` | `GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon` | **anon được SELECT toàn schema** |
| `002:23–24` | default privileges tương tự cho bảng tương lai | độ phủ tích lũy |
| `006:42` | `ADD COLUMN password_hash TEXT` | password_hash sinh sau ⇒ nằm trong tổ hợp SELECT rộng đã có |
| `006:66` | `GRANT SELECT ON TABLE public.members TO anon, authenticated` | tái cấp dương tính sau khi tạo cột |
| `011:96` | CREATE policy `Public read basic members` `USING (status='active')` | chỉ **row-filter** — RLS không giới hạn cột |
| `012:29` | `REVOKE SELECT ON public.members FROM anon, authenticated` | **chưa được áp dụng trên prod mirror** (drift zone H29 forensics) |

### 2.2 Trạng thái thực trên prod mirror 55442 (chỉ metadata)

- `has_column_privilege('anon','members','password_hash','SELECT')` = **true**
- `has_column_privilege('authenticated','members','password_hash','SELECT')` = **true**
- `has_column_privilege('anon','members', 'email/phone/role/status','SELECT')` = **true** (rộng hơn bộ ba công khai định nghĩa ở 011)
- Table grants trên mirror: `anon`: INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE; `authenticated`: full DML + REFERENCES/TRIGGER/TRUNCATE; `service_role`: full.
- Policies trên members: `Public read basic members` (SELECT, roles=public); `Service role all members` (ALL, service_role). RLS: `relrowsecurity = true`, `relforcerowsecurity = false`.
- **Không có view nào** trên members (grep CREATE VIEW: 0 kết quả) — không có kênh rỉ qua view.
- Kênh client công khai duy nhất là PostgREST với JWT `anon` ⇒ **P1 là rủi ro thực**: một request PostgREST với JWT `anon` có thể đọc `password_hash` của bất kỳ member nào đang `status='active'`.
- Runtime của logic nghiệp vụ: **không có** kênh browser trực tiếp SELECT members bằng anon key; state member ở browser đến từ `/api/members` (server-sanitized `member_id, full_name, referral_code`). ⇒ Thu hồi `anon`/`authenticated` không phá bất kỳ luồng UI/API nào (bằng chứng code).

## 3. GRANT / RLS / policy: trước và sau

### 3.1 Prod mirror 55442 — TRƯỚC (metadata)

| Chủ thể | SELECT password_hash | SELECT bảng | WRITE (grant-level) | Ghi chú |
|---|---|---|---|---|
| anon | **t** | t | INSERT/TRUNCATE (+REFERENCES/TRIGGER) | TRUNCATE vượt RLS |
| authenticated | **t** | t | INSERT/UPDATE/DELETE (+REFERENCES/TRIGGER) | UPDATE cột password_hash t (thực tế chặn bởi RLS vì không có policy write) |
| service_role | t | t | full | đúng thiết kế server |

### 3.2 Fixture 55471 — TRƯỚC vs SAU (file `p1-fixture-{BEFORE,AFTER}-flags.txt`)

| Flag | TRƯỚC | SAU | Mục tiêu |
|---|---|---|---|
| anon_table_sel (table-level) | t | **f** | f |
| anon_pwd_hash | t | **f** | f |
| anon_email / phone / role / status | t / t / t / t | **f / f / f / f** | f (least-priv) |
| anon_member_id / full_name / referral_code | t | **t / t / t** | t (giữ bộ ba 011) |
| auth_pwd_hash | t | **f** | f |
| auth_email | t | **f** | f |
| auth_member_id | t | **t** | t |
| auth_upd_pwd (column UPDATE) | t | t (giữ nguyên — ngoài P1 scope; thực tế chặn bởi RLS vì không có policy write cho authenticated) | t |
| svc_sel_pwd | t | **t** | t |
| anon INSERT/UPDATE/DELETE/TRUNCATE | t/f/f/f | t/f/f/f (không đổi — ngoài scope) | finding riêng |
| auth INSERT/UPDATE/DELETE | t/t/t | t/t/t (không đổi — ngoài scope) | finding riêng |
| policy `Public read basic members` | SELECT status='active' | **giữ nguyên** | row-filter bất biến |
| policy `Service role all members` | ALL | **giữ nguyên** | server path bất biến |
| RLS relrowsecurity | t | t | t |

> Lệch fixture↔mirror: replay 001–011 không sinh `TRUNCATE/REFERENCES/TRIGGER` cho `anon` trên members (đó là đặc thù dump hosted Supabase của mirror). Phần P1 (SELECT) test được; các quá-width write-grant là finding riêng (§7.2).

## 4. Patch đề xuất và lý do

- **File**: `supabase/migrations/proposals/031_members_read_least_privilege.sql.draft` (khu vực draft; **không** sửa migration lịch sử 001–030; **không** thuộc chuỗi canonical hiện thời — là hotfix-candidate chờ phê duyệt).
- **Hành vi**:
  1. `ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;` (no-op, đảm bảo state).
  2. `REVOKE SELECT ON TABLE public.members FROM anon, authenticated;` — đuôi table-level của hai role bị cắt sạch vào password_hash/email/phone/role/status.
  3. `GRANT SELECT (member_id, full_name, referral_code) ON public.members TO anon, authenticated;` — column-level đúng bộ ba tài liệu 011; PostgREST hiện đúng 3 cột cho vai trò client; row-filter `status='active'` mang policy 011 tiếp tục áp dụng (row-filter × column-filter).
  4. `GRANT ALL ON TABLE public.members TO service_role;` — re-assert bất biến server-path (đã có từ 002.11 + 006.65 + 011.109; re-assert giúp patch tự đủ khi chơi ghép cùng vài kịch bản replay).
  5. **Post-conditions DO … END**: transaction FAIL nếu (a) `anon`/`authenticated` còn đọc `password_hash`; (b) `anon` mất bộ ba công khai; (c) `service_role` mất `password_hash` SELECT (login sẽ hỏng); (d) `email` xuất hiện lại cho `anon` (chống phóng rộng quyền).
- **Nguyên lý least-privilege**: *không* thu hồi write-grant của `anon/authenticated` trong P1 (inert do RLS, chỉ ghi finding riêng §7.2); *không* đụng policy; *không* đổi thuật toán/định dạng/dữ liệu mật khẩu; *không* cấp thêm quyền nào cho role nào so với state trước.
- **Quan hệ với 012**: replay 001→030 chạy 012 trước rồi 031 sau: cả hai idempotent; kết quả cuối giữ *bộ ba công khai* (031 re-grant) trong khi 012 thu về zero-read cho `anon` — khác biệt có chủ đích. **Quyết định chủ dự án (P1-D3): (A) giữ bộ ba công khai sau cutover (khuyến nghị) hoặc (B) zero-read như 012 (bỏ cốt re-grant của 031 khi cutover).**
- **Quan hệ với 027/028**: không chồng lấn bảng (031 members vs 027/028 orders/customers/payments family + schema-wide revokes); replay cùng một cửa sổ cutover OK.

## 5. Kết quả test có thể tái lập

### 5.1 SQL-level trên fixture (hoàn toàn synthetic)

Command chuẩn: `psql --no-psqlrc -X --set=ON_ERROR_STOP=1 -h 127.0.0.1 -p 55471 -U p1_fixture_admin -d gieomo_p1_fixture -f <file>`.
Tiến trình/cluster do chính session này khởi tạo; sau evidence đã `pg_ctl stop -m fast` (evidence lưu file-based, không phụ thuộc cluster sống). Tái kiểm: `pg_ctl -D .tmp/postgres-p1-fixture-data -l .tmp/postgres-p1-fixture.log -o "-h 127.0.0.1 -p 55471" start` rồi chạy lại các SQL dưới. **Không mở rộng đọc lên mirror thật từ các lệnh test này.**

| # | Test | Kỳ vọng | Kết quả | Evidence |
|---|---|---|---|---|
| T0a | Setup fixture mới (port 55471, loopback) + bootstrap roles + replay 001–011 | thành công, không đụng 55442/55456/55461 | **PASS** ( Ready replayed=11 ) | `.tmp/recon-20261022/p1-fixture-setup.ps1` |
| T0b | Snapshot BEFORE trên fixture | `anon_pwd_hash` / `auth_pwd_hash` = true (tái hiện đúng P1) | t / t | `p1-fixture-BEFORE-flags.txt` |
| T1 | Áp dụng `031_…sql.draft` | PASS với post-conditions | **exit=0** (BEGIN/ALTER/REVOKE/GRANT/GRANT/DO/COMMIT) | đây |
| T2 | `SET ROLE anon; SELECT password_hash …` | exit ≠ 0 (permission denied) | **exit=3** | `p1-probe-t2-anon-pwd-hash.sql` |
| T3 | `SET ROLE anon; SELECT email …` | exit ≠ 0 | **exit=3** | `p1-probe-t3-anon-email.sql` |
| T4 | `SET ROLE anon; SELECT count(*) FROM members` (RLS row-filter) | count=1 (2 hàng trong DB; 1 hàng inactive bị RLS lọc) + `WHERE referral_code='P1FIXTURE'` → 0 | **1 / 0** | `p1-probe-t4-anon-trio.sql` |
| T5 | anon vẫn đọc bộ ba công khai (member_id/full_name/referral_code) | OK (không permission denied) | **PASS** | truyền ngầm trong T4 (query chỉ chớ các cột này) |
| T6 | authenticated mất đọc password_hash | post-condition trong T1 + flags AFTER | **PASS** (`auth_pwd_hash` = f) | `p1-fixture-AFTER-flags.txt` |
| T7 | service-role simulate login path: SELECT (login roster) + UPDATE password_hash (upgrade path) + DELETE admin (BEGIN…ROLLBACK) | SQL thành công | **exit=0** (login_query_row_found=t, roster_rows=2, UPDATE 1, DELETE 1, ROLLBACK) | `p1-probe-t7-service-role-sim.sql` |
| T8 | `anon` UPDATE (RLS phải chặn vì không có policy write) | exit ≠ 0 | **exit=3** | `p1-probe-t8-anon-update.sql` |
| T9 | Idempotent: chạy lại patch lần 2 | exit=0 | **exit=0** | đây |
| T10 | RLS độc lập với GRANT: policy tồn tại bất biến + row-filter vẫn hiển nhờ column-minuscule grant | =1 hàng cho anon; =2 hàng cho service_role | **PASS** | T4 + T7 |
| T11 | Không có privilege mới xuất hiện: diff BEFORE→AFTER chỉ gồm các thay đổi liệt kê ở §3.2 | không GRANT mới nào | **PASS** | so sánh `p1-fixture-{BEFORE,AFTER}-flags.txt` |

### 5.2 Node regression (mã auth/member targeted)

- Lệnh: `node --test tests/authPrimitives.test.ts tests/authHygieneBatch4.test.ts tests/authorizationPhase4.test.ts`
- Mock-based (không tới DB cluster); phù hợp vì patch P1 là SQL-only.
- **Kết quả: 21/21 pass, 0 fail, 0 skip** (B1–B6, A1..A5, P4-A1..A5 toàn cùng PASSED).
- Không chạy full suite (tránh tác động tới tiến trình/cụm khác — theo ràng buộc bài toán).

### 5.3 Cross-check static (không tuyên bố PASS với HTTP live)

- `POST /api/auth/login` trả về `memberId/email/fullName/role/referralCode/phone` — không có password_hash trong response.
- `GET /api/members`, `POST /api/members`, `DELETE /api/members` dùng explicit column list; password_hash chỉ được viết vào DB, không trả về client.
- Kết luận: Client không nhận password_hash (static proof; **không** xác minh bằng e2e live HTTP — ghi planned-only możliwe trong cutover rehearsal).

## 6. Regression risks và rollback plan

- **Rủi ro break server-side code**: không có — mọi server code dùng service_role (evidence grep code), service_role không bị đụng tới.
- **Rủi ro hệ thống bên ngoài** (không thuộc mã repo) đọc trực tiếp members qua anon PostgREST để lấy các cột khác bộ ba → sẽ mất đọc; rollback 1 lệnh dưới đây.
- **Rollback (reversal, một transaction)**:
  ```sql
  BEGIN;
  REVOKE SELECT (member_id, full_name, referral_code) ON public.members FROM anon, authenticated;
  GRANT  SELECT ON TABLE public.members TO anon, authenticated;
  COMMIT;
  ```
  Túc Ở trả về dữ liệu mặc định pre-hotfix; không đụng mật khẩu/song-song dữ liệu; chuẩn hóa: zero-data-rewrite.
- **Impact nếu defer hotfix lại cutover**: password_hash tiếp tục đọc được qua anon trong toàn khung cutover window; khuyến nghị áp hotfix **sớm, độc lập** của cutover (đã handy courtesy evidence `FIXED-LOCAL`).

## 7. Những phần chưa được kiểm chứng & finding bổ sung

1. **Mirror 55442 vẫn CHƯA áp patch** (ràng buộc LOCAL-ONLY; mirror chứa dữ liệu thật — cần approval run của owner trước khi chạm). Kịch bản áp + verify: chạy patch (hoặc 012-members-block hardened) và probe T2/T3/T7 đổi target 55442.
2. **Finding P1.2 (out-of-scope)**: prod mirror cho `anon` TRUNCATE/REFERENCES/TRIGGER trên `members` (và full DML của `authenticated`) — PostgREST-inert nhưng hygiene. Khoan đi kệ theo cutover; có thể là hotfix riêng nếu owner yêu cầu. Cũng nên inventory thực tế các write-grants cho toàn public schema (002.12–13 + default privileges) trước khi quyết định.
3. Không chạy `next dev` e2e login — chỉ SQL simulation của role path; planned-only còn thiếu (cutover rehearsal).
4. Không tái hiện admin POST/PUT sim trên fixture (chỉ DELETE sim); các path cùng service_role, và sử dụng khác INSERT cho fixture seed đã chạy OK (p1-fixture-seed-inactive).
5. Stale listener **55451** (PID 23276 phi tồn tại trong process list): host-local quirk, chỉ bind 127.0.0.1; không từ vệ và không đụng.

## 8. Checklist cutover readiness (cập nhật từ H29)

| Hạng mục (kế thừa H29) | Trạng thái sau session này |
|---|---|
| Drift 012 members-block → P1 password_hash | **FIXED-LOCAL** (patch ready + local evidence; chờ approval áp prod) |
| Inventory anon TRUNCATE/DML trên members + toàn schema | FINDING MỚI (P1.2) — chờ owner quyết hotfix riêng hay để 027/028 |
| Rehearsal 021→030 trên mirror 55442 | vẫn PLANNED (không chạy session này) |
| Bootstrap rehearsal (migration repair / init) | vẫn PLANNED |
| Non-skip PG concurrency trên DB-B | vẫn PLANNED |
| RLS hotfix verify trên môi trường 001→030-replayed | P1 đã verified trên fixture-only; verification trên DB-B hoàn chỉnh là PLANNED |
| Đối soát 39 đơn trả tiền + 20 cặp trùng | chờ owner sign-off (không đổi) |
| SePay webhook end-to-end | vẫn PLANNED |
| Timing rehearsal + 10 bước smoke | vẫn PLANNED |
| **CUTOVER** | **NO-GO** (không đổi) |

## 9. Quyết định cần chủ dự án phê duyệt

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| **P1-D1** | Áp `031_members_read_least_privilege` hotfix cho Production? | Có — sớm, độc lập với cutover |
| **P1-D2** | Finding P1.2: inventory + thu hồi write-grants dư của `anon/authenticated` trên toàn schema public? (làm hotfix riêng hay để 027/028 lo khi cutover) | Chạy inventory trước rồi quyết; nếu rehearsal xác nhận 027/028 xử lý đầy đủ thì để cho cutover |
| **P1-D3** | Sau cutover: giữ bộ ba công khai (A) hay zero-read theo 012 (B)? | A — không có luồng nào trong code cần nhiều hơn bộ ba công khai (evidence code); zero-read chặt hơn nhưng không có yêu cầu nghiệp vụ bắt buộc |
| **P1-D4** | Có cần e2e HTTP live login test trước thời điểm cutover? | Không bắt buộc; có thể nằm trong khác smoke-step#cutover |

### Ghi thử evidence bằng tệp (đầy đủ, không thu hẹp)

- PowerShell: `.tmp/recon-20261022/p1-fixture-setup.ps1` — exit 0, output "fixture: READY (… replayed=11)".
- SQL: `.tmp/recon-20261022/p1-fixture-snapshot[-flags].sql`, `p1-fixture-BEFORE-flags.txt`, `p1-fixture-AFTER-flags.txt`, `p1-fixture-AFTER-full.txt`, `p1-fixture-seed-inactive.sql`, `p1-probe-t{2,3,4,7,8}-*.sql`, tám và chính `supabase/migrations/proposals/031_members_read_least_privilege.sql.draft` (2 runs).
- Node: `node --test tests/authPrimitives.test.ts tests/authHygieneBatch4.test.ts tests/authorizationPhase4.test.ts` — pass=21, fail=0, skipped=0, duration_ms≈291.

## 10. Tuyên bố an toàn

- KHÔNG có Production/Preview write; KHÔNG deploy; KHÔNG `supabase db push`; KHÔNG đăng nhập production Supabase; KHÔNG transaction/thanh toán thực; KHÔNG merge/cancel đơn; KHÔNG backfill/ledger.
- KHÔNG đọc/print `.env*`, credentials; KHÔNG in giá trị `password_hash`/PII. Mọi output chỉ boolean/metadata/counts; literal `pbkdf2$fixture$…` trong SQL là giá trị **tổng hợp** do chính session tạo (không phải credential thật).
- KHÔNG stage/commit/push/merge; KHÔNG stash/reset/clean; WIP Thank-You Card (worktree `.tmp/integrated-merge-030`, branch preview/payment-replay-followup) nguyên vẹn; báo cáo `OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md` nguyên vẹn.
- Fixture cluster 55471 tạo/dùng/stop trong session này (`pg_ctl stop -m fast`), giữ nguyên data dir (synthetic) sau thu evidence; KHÔNG kill bất kỳ cluster/process đã tồn tại (55442/55456/55461 vẫn healthy "accepting connections").

**Trạng thái chốt**: P1 = `FIXED-LOCAL`; Cutover = `NO-GO`.
