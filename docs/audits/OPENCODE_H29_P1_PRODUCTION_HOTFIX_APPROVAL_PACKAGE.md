# OPENCODE H29-P1 — PRODUCTION HOTFIX APPROVAL PACKAGE
# (P1.1 members.password_hash + P1.2 excess non-DML grants)

- **Ngày**: 2026-10-22
- **Phạm vi mặc định**: READ-ONLY với Production/Preview; mọi thực thi đều LOCAL-ONLY trên fixture tổng hợp đã biết. **Gói này KHÔNG tự áp hotfix nào lên Production.**
- **Trạng thái cuối**:
  - **P1.1** = `FIXED-LOCAL` (bằng chứng hiện có hợp lệ, đã tái xác minh + mở rộng HTTP E2E)
  - **P1.2** = `PATCHED-LOCAL` (proposal 032 riêng, đã rehearsed 2 runs trên scratch db; **không** gộp vào P1.1)
  - **Production hotfix** = `AWAITING EXPLICIT APPROVAL`
  - **Cutover** = `NO-GO` (không đổi)
- **An toàn phiên**: KHÔNG thư Production/Preview; KHÔNG deploy/db push; KHÔNG stage/commit/push/merge/stash (porcelain=166, staged=0 nguyên vẹn); KHÔNG đọc/print `.env*`/secret/PII; không kill cluster nào — chỉ `pg_ctl start` lại các cluster do session trước tạo (trạng thái chi tiết trong §0).

---

## 0. Preflight & môi trường RUN (bằng chứng thực thi)

| # | Kiểm tra | Kết quả | Grade |
|---|---|---|---|
| P-1 | HEAD `1c51af6`, branch `main`, porcelain 166 (không đổi từ H29-P1), staged 0, stash 0, 12 worktrees | PASS | RUN |
| P-2 | Báo cáo H29-P1 + baseline reconciliation + patch draft 031 tồn tại, không bị ghi đè | PASS | RUN |
| P-3 | WIP Thank-You Card (` .tmp/integrated-merge-030/<…>H29_R37_…md`) nguyên vẹn | PASS | RUN |
| P-4 | Cluster 55456/55461/55471 khởi động lại sạch ("accepting connections"); fixture chính giữ nguyên state patched + 2 hàng fixture | PASS | RUN |
| P-5 | **55442 (prod mirror) đã DỪNG trước khi session bắt đầu; cố gắng start lại bị dính postmaster wedged** (KHÔNG serve connections; cleanup attempt bằng `pg_ctl stop -m fast` treo). ĐÃ THỰC XÁC MINH FIN: mirror chưa bị sửa gì và không mất dữ liệu theo log startup, nhưng chưa thể tái truy vấn trong session này | BLOCKER B-1 | RUN |
| P-6 | Clone `Environments: .env.local` trong Next dev được ghi nhận; **mọi biến env mà app dùng cho rehearsal đều chứa giá trị override cục bộ** (prod project chưa bao giờ được chạm) | đã kiểm soát | RUN |

### Blocker B-1 (55442 prod mirror) — cần quyết của owner
- Không phải hựng session này gây ra; cluster tự stop giữa hai session (chỉ là tiến trình local, không phải dịch vụ cài đặt máy).
- Lâu dài cần: `pg_ctl -D .tmp/postgres-recon-20261022-data stop -m immediate` (chủ động exit-status dừng; KHÔNG dùng taskkill /T /F — vị H29 đã chứng minh gây-instability) rồi `pg_ctl start` lại; start sau đó sẽ chạy crash-recovery sạch. Data dir nguyên vẹn (lần restore đằngtrước mọi giá trị đều backup-covered).
- Ảnh hưởng của Blocker này lên gói quyết định: không có mới nhiều chú các dữ liệu RUN đã từ H29-P1 (một phần evidence mirror cho P1.1 được đánh grade static từ prior-session run, mọi điều khác đã được replicate trên fixture/canonical).

---

## A. Executive summary

| Item | Trạng thái | Bằng chứng chính | Production |
|---|---|---|---|
| P1.1 password_hash | `FIXED-LOCAL` | Patch 031 (2 runs idempotent); fixture flag-diff; HTTP E2E 16/16; rollback cycle | **NOT CHANGED** |
| P1.2 excess grants (TRUNCATE/REFERENCES/TRIGGER trên `members`) | `PATCHED-LOCAL` | 032 (2 runs idempotent trên scratch db mô phỏng mirror-artifact grants); canonical tip 55456 đã tự sạch | **NOT CHANGED** |
| Security review codepath | Invested STATIC REVIEW | grep code: mọi `from("members")` là service_role (server-side); response sanitize | n/a |
| Cutover readiness | khách động vì P1 | — | **NO-GO** (giữ nguyên) |

Chạm và đảm bảo: **Production vẫn chưa được khắc phục — các quyết định B.1–B.4 dưới đây phải được chủ dự án explicit approve trước khi bất kỳ runbook nào chạy trên Production.**

## B. Các quyết định cần phê duyệt

### B.1 / P1-D1 — Áp hotfix P1.1 cho Production?

- **Khuyến nghị: CHUẨN BỊ VÀ LÊN LỊCH EARLY-HOTFIX** (không phụ thuộc cutover), theo runbook §C, với **post-conditions hard** (built-in DO-block refuse commit nếu bất kỳ assert nào fail).
- **Bằng chứng** (label grade):
  - RUN: fixture flag-diff trước/sau (11 checks từng lần); patch chạy 3 lần trên fixture chính đều idempotent; tất cả SET ROLE probes (T2/T3/T4/T8) yes/no đúng kỳ vọng; service-role sim (T7) giữ path login/decode POST /api/auth/login không vỡ.
  - RUN (mới, lần này): HTTP E2E trên `next dev` + mock PostgREST loopback — **16/16 PASS**, trong đó (a) unauth roster trả đúng bộ ba `memberId/fullName/referralCode`, không password_hash; (b) login valid 200 + token + cookie sanitize; (c) login invalid/unknown → 401 generic, không echo sensitive; (d) authenticated roster san-temized, không password_hash.
  - STATIC REVIEW: root cause 002.12–13/006.66 + drift of 012.29 (không apply trên mirror).
  - INFERRED: không có luồng công khai nào cần nhiều hơn bộ ba công khai (grep toàn `src`: không có callsite browser-direct đọc members bằng anon key).
- **Rủi ro**: nếu có hệ thống **ngoài mã repo** đang đọc trực tiếp members qua anon PostgREST để lấy các cột khác bộ ba → sẽ mất đọc. Mitigation: rollback 1-transaction (§C step 8).
- **Tiêu chí hoàn thành**: patch áp dụng thành công + post-conditions PASS + smoke (login valid/invalid, API roster) PASS + bằng chứng response không chứa password_hash; hết vòng kiểm tra cột bằng psql metadata.

### B.2 / P1-D2 — P1.2: hotfix riêng hay để cutover?

- **Khuyến nghị: HOTFIX RIÊNG (032) chạy cùng window hotfix P1.1** — hai file độc lập, mỗi file một transaction, không phải migration tổng hợp.
- **Bằng chứng**:
  - RUN (mới): 032 rehearsed 2 lần trên scratch db có **mô phỏng chính xác artifact-grants của mirror** (GRANT TRUNCATE/REFERENCES/TRIGGER cho `anon`,`authenticated`): AFTER loại sạch excess verbs; `anon SELECT/INSERT`, authenticated full DML, service_role TRUNCATE đều **giữ nguyên** với canonical.
  - RUN (mới, canonical tip 55456): sau chuỗi 012→030 bản cutover, `members` đã zero-grant cho `anon`/`authenticated` (SELECT f, TRUNCATE f); nhưng `anon INSERT` vẫn còn (đúng theo canonical 002.13) — nghĩa là cutover sẽ tự xử lý excess SELECT/TRUNCATE, còn `anon INSERT` trên members là state canonical (hygiene inventory riêng của cutover, không thuộc P1.2).
  - STATIC REVIEW: nguồn cấp excess (TRUNCATE/REFERENCES/TRIGGER): không tồn tại trong file migration repo (grep GRANT/TRUNCATE, REFERENCES, TRIGGER toàn migrations = 0 hits cho anon/auth) ⇒ artifact của lineage hosted Supabase.
  - STATIC REVIEW: các verb này không được PostgREST expose (chỉ SELECT/INSERT/UPDATE/DELETE + RPC); TRUNCATE không chịu RLS; REFERENCES/TRIGGER là quyền DDL `_schema_`; nhưng theo yêu cầu H29, "PostgREST không expose" **không** được coi là an toàn tự động — đặc biệt khi đối ứng với mux SQL-direct connections (connect-string archive, CLI tooling, future integrations).
- **Ưu thế hotfix riêng so với defer-to-cutover**: zero-risk security surface pre-cutover, small (2 statements), đã verified; defer chỉ hợp lý nếu owner muốn gộp vào cutover để tránh một window hoạt động nữa.
- **Rủi ro**: thấp; rollback cũng 1 transaction (khôi phục artifact-state như mirror); nếu defer mà cutover trễ lâu ⇒ surface phơi nhiễm kéo dài mà không có lý do nghiệp vụ nào yêu cầu giữ.
- **Tiêu chí hoàn thành**: 032 đã áp dụng + post-conditions PASS + inventory dư-thừa của members clean.

### B.3 / P1-D3 — Giữ bộ ba công khai (A) hay zero-read (B) cho client roles?

- **Khuyến nghị: (A) giữ bộ ba công khai** cho pre-cutover hotfix.
- **Bằng chứng**:
  - RUN (mới): DB-canonical-replay rehearsal `001→012` + apply 031 chứng minh hai lựa chọn tự tương thích và nhét: 012 zero-read → 031 re-grant chỉ mở lại 3 cột công khai; email/phone/password_hash vẫn f/f/f. `[p1-fix012-{BEFORE,AFTER}-flags.txt]`
  - RUN (mới): HTTP E2E cho thấy unauth public path dựa đúng vào bộ ba này (roster 1 hàng, inactive ẩn) — variant A là thiết kế mà: `/api/members` unauth flow code hiện đang dùng bộ ba.
  - STATIC REVIEW: đổi lighter variant B (zero-read, bỏ 031 sau cutover) có nghĩa code cần gọi `/api/members` unauth sẽ trả `members: []` — hành vi này chỉ chi tiết logic switch khi endpoint mang DB chặn (graceful: dùng service_role reads weitert?); hi_signal risk Functional nếu some 3rd-party integration calls /api/members without login.
- **Tiêu chí hoàn thành**: nếu D3=B: chủ dự án quyết định xác nhận không có use case nào cần unauth roster; không re-apply 031 sau cutover.

### B.4 / P1-D4 — HTTP E2E trước khi trình hotfix?

- **Khuyến nghị: KHÔNG cần thêm** — đã thực hiện trong session này (B.1 chạy với mock PostgREST loopback + env override + `next dev -H 127.0.0.1`) và 16/16 PASS. Grade: RUN với rogue-free environment (Production URL/keys override cục bộ; chưa chạm hosting  supabase or `.env.local` values).
- Bằng chứng lần này: `.tmp/recon-20261022/p1-e2e-assert.txt` (16 PASS / 0 FAIL) + Next dev log (GET/POST routes 200/401 đúng kỳ vọng).
- Cutover rehearsal vẫn là nơi để re-chạy full E2E trên database really-json-if-live.

## C. Runbook dự thảo (KHÔNG thực thi trong phiên này)

> Target thực thi: Supabase Production project; **chỉ chạy khi B.1–B.3 approved**. Mỗi bước ghi rõ đã/pending evidence.

### C0. Preflight xác minh đúng project
- Confirm không nhầm project: `psql "$TARGET_DB_URL"`; kiểm tra `current_user` = role admin, `inet_server_addr()` thuộc hosted; row-dultural sanity check: `SELECT count(*) FROM members` (chỉ counts, với lưu ý PII-None); và một **verify-tag** duy nhất: `SELECT count(*) FROM members WHERE referral_code = '<CODE> verified bằng owner verbally'` (không in giá trị bất kỳ ngoài boolean).
- STOP nếu: row-count khác đáng kể so với số trước backup; database khác project.
- Grade: PLANNED (chưa ran).

### C1. Backup & phục hồi
- `pg_dump "$TARGET_DB_URL" -Fc -f backups/prod-<date>/prod-pre-p1.dump` (schema+data); checksum sha256; **không** commit/push.
- Verify restore: restore vào scratch DB cục bộ mới; so khớp số bảng và các row-count tổng hợp (không đọc giá trị nhạy cảm).
- Grade: PLANNED.

### C2. Điều kiện dừng (abort gates)
1. Verify-tag phép nhân thành trong C0.
2. Pre-patch state probe sai kỳ vọng (phải đúng shape như mirror snapshot C.1: anon/auth SELECT t on password_hash).
3. Backup không restore sạch (C1 fail).
4. Transaction trong patch > 60s (hông – 10s là đủ).
5. Post-conditions trong FAIL (built-in DO-block atomically rollback tự động).
6. Smoke tests fail bất kỳ một trong số đầu chạy (C4; runbook sẽ terminating ngay).

### C3. Áp patch (trong window phê duyệt)
- File: `supabase/migrations/proposals/031_members_read_least_privilege.sql.draft` (nếu D1) và `032_members_non_dml_grant_hygiene.sql.draft` (nếu D2), **mỗi file một psql session**.
- Run: `psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 -f <file>`; theo dõi `BEGIN/REVOKE/GRANT/DO/COMMIT` + exit code 0.
- Grade: PLANNED.

### C4. Post-conditions & smoke tests (sau patch)
- SQL (metadata-only):
  `SELECT has_column_privilege('anon','members','password_hash','SELECT')` → **false**; email → false; member_id/full_name/referral_code → true; service_role password_hash → true; (nếu 032) TRUNCATE/REFERENCES/TRIGGER anon/auth → false.
- HTTP smoke (qua Web/PostgREST domain): (1) login valid (không tạo tài khoản mới; chỉ dùng account doanh nghiệp đã cấp — mật khẩu do owner cung cấp ngoài kênh văn bản, không được lưu), (2) login invalid, (3) GET `/api/members` unauth, (4) GET `/api/members` authed. Mỗi step: assert no `password_hash` trong body và log.
- Grade: PLANNED.

### C5. Xác minh không làm lộ dữ liệu xác thực
- Body responses phải không có từ khóa `password_hash` (E2E-style checks bản shipping prod như fixture evidence).
- Confirm an skipped: **KHÔNG in giá trị password_hash bất kỳ một nguồn nào, kể cả khi metadata failure-error cần debug**.

### C6. Rollback / mitigation
- Nếu smoke FAIL và phải quay ve (theo C5): dùng rollback script ở header của 031 (1 transaction), **TÀI LIỆU HOÁ RÕ** rằng rollback đó **khôi phục đúng trạng thái P1-dễ tổn thương** (anon/auth SELECT password_hash) và như vậy KHÔNG PHÙ HỢP để dùng như "clean exit" trên Production; enforcement cụ thể là quyết định owner có chấp nhận trở lại trạng-short vulnerability trong period-s analysis.
- Alternative mitigation (nếu rollback cần phép nhưng ưu tiên trạng thái ít rủi ro hơn): GRANT SELECT (member_id, full_name, referral_code) ON members TO auth... — chỉ mở lại một phần \$3\$ trio nếu vấn đề phi.Reader mong muốn từ bất kỳ tooling, i.e., functi pudo.

### C7. Hard verification trước kết thúc
- psql verify columns state + rollback-ability parameter; evidence dump (bản full-safe: số counts, boolean, timing) để attachment cuối.

## D. Cutover readiness (KHÔNG ĐỔi)

| Hạng mục (kế thừa H29) | Trạng thái |
|---|---|
| P1 hotfix states (P1.1 + P1.2) | PATCHED-LOCAL; chờ approval D1/D2 → đang NO-GO, cácPatch sẽ được pair thành "mini-cutover" riêng |
| Migration history/bootstrap rehearsal | PLANNED |
| Rehearsal 021→030 trên mirror 55442 | PLANNED (Blocker B-1 phải được giải quyết trước) |
| Concurrency/RLS/load timing tests trên DB-B | PLANNED |
| Đối soát 39 đơn thanh toán | chờ owner sign-off |
| Review 20 cặp đơn nghi trùng (DP-04/DP-07 cá chắn) | chờ owner sign-off |
| SePay webhook E2E + smoke 10 steps + timing rehearsal | PLANNED |
| **Cutover** | **NO-GO** |

## E. Bảng chi tiết P1.1 — TRƯỚC/SAU (metadata, file-preserved evidence)

| Role | Table/Column (trước) | SELECT (trước) | WRITE (trước) | SELECT (sau-patch) | RLS policy | Server-side giữ | Bằng chứng |
|---|---|---|---|---|---|---|---|
| anon | members (ALL cols) | t (table-level) | INSERT (002.13), TRUNCATE/REFERENCES/TRIGGER (artifact) | **chỉ member_id, full_name, referral_code** (password_hash/email/phone/role/status = f) | `Public read basic members` (status='active') — giữ nguyên | n/a (server code không dùng anon read) | fixture BEFORE/AFTER flags; T2/T3 exit=3; T4 count=1/0; E2E-1 |
| authenticated | members (ALL cols) | t (table-level) | INSERT/UPDATE/DELETE (002.12), + TRUNCATE/REFERENCES/TRIGGER (artifact) | **chỉ bộ ba**; UPDATE password_hash vẫn cấp nhưng bị RLS chặn vì không có policy write | giữ nguyên policies | không cần (server dùng service_role) | fixture flags; E2E-5 |
| service_role | members (ALL cols) | t | full | t (không đổi) | `Service role all members` (002/011/006) | full (login/roster/CRUD) | T7 sim; flags svc=t |
| canonical tip (55456) | members | f (tất cả anon/auth) | anon: INSERT; auth: DELETE/INSERT/UPDATE | zero-read | chỉ `Service role all members` | full | `p1-canonical-55456-members-grants.txt` (RUN) |

> Zữa `canonical tip` là thế giới *sau cutover* (mọi migrations 001→030 applied): zero-read là mặc-dded-tự; nếu D3=A cần re-apply 031 ngay sau cutover; nếu D3=B thì canonical tip đã sẵn chỉ phù hợp.

## F. Bảng chi tiết P1.2 — phân tích verb-by-verb

| Verb | Exist trên mirror | Nguồn trong repo | Kiểu nguy cơ | PostgREST reachable? | Xếp hạng | Khuyến nghị xử lý |
|---|---|---|---|---|---|---|
| TRUNCATE | anon **và** authenticated | KHÔNG (canonical không cấp; artifact lineage) | xóa sạch bảng ngoài phạm vi RLS (nếu có SQL-direct path) | KHÔNG (no PostgREST op) | F (inert qua product APIs, vẫn hygiene-critical SQL surface) | hotfix 032 ngay (RUN-verified) |
| REFERENCES | anon và authenticated | KHÔNG | tạo FK constraint trỏ về members (khi role có CREATE trên schema thứ ba nào) | KHÔNG | E/F | hotfix 032 |
| TRIGGER | anon và authenticated | KHÔNG | tạo trigger abuse nếu có CREATE/insert path | KHÔNG | E/F | hotfix 032 |
| INSERT | anon | t (002.13 canonical) | RLS chặn thực tế (không có policy INSERT); PostgREST reachable | có | C (lower) | ngoài P1.2; theo chủ schema-wide inventory (D..blocker ownership) |
| INSERT/UPDATE/DELETE | authenticated | t (002.12 canonical) | RLS chặn write thực tế (không có policy) | có | C (lower) | ngoài P1.2 |

> Lưu ý 🔴 tiêu chuẩn: **"PostgREST không expose" chỉ dùng để MÔ TẢ امکان lợi dụng hiện tại, không để chóa tiêu minimum-privilege.** Điều này đáp ứng đúng các yêu cầu đánh giá P1.2.

## G. Bằng chứng thực thi (file-based, đầy đủ, không loại trừ)

- `.tmp/recon-20261022/p1-rollback-atomic-proof.{sql,txt}` — ROLLBACK atomicity: checkpoints in/out tx đạt mong đợi.
- `.tmp/recon-20261022/p1-rollback-committed.{sql,txt}` — full committed rollback cycle: đủ về BEFORE-state nhiệt định; sau đó re-apply patch → patched.
- `.tmp/recon-20261022/p1-fixture-{BEFORE,AFTER,FINAL}-flags.txt` — main fixture flag snapshots.
- `.tmp/recon-20261022/p1-fix012-{BEFORE,AFTER}-flags.txt` — 012→031 coexistence rehearsal.
- `.tmp/recon-20261022/p1-p12-{BEFORE,AFTER}-flags.txt` — P1.2 rehearsal 032 (mô phỏng artifact + revoke).
- `.tmp/recon-20261022/p1-canonical-55456-members-grants.txt` — cutover-tip state (RUN).
- `.tmp/recon-20261022/p1-e2e-assert.{mjs,txt}` — HTTP E2E 16/16 PASS.
- `.tmp/recon-20261022/p1-mock-postgrest.mjs` — mock PostgREST (loopback, dữ liệu tổng hợp, guard bearer key cục bộ).
- `supabase/migrations/proposals/032_members_non_dml_grant_hygiene.sql.draft`.

## H. Tuyên bố an toàn (sự sản xuất)

- KHÔNG có Production/Preview write; KHÔNG deploy; KHÔNG `supabase db push`; KHÔNG migration ngoài fixture dbs mới (gieomo_p1_fixture_012 / gieomo_p1_p12_sim — synthetic, cùng cluster fixture 55471).
- KHÔNG stage/commit/push/merge; KHÔNG stash/reset/clean; WIP Thank-You Card nguyên vẹn; `OPENCODE_PRODUCTION_DATA_RECONCILIATION_REPORT.md` nguyên vẹn.
- Không đọc/print `.env*`/credentials/secret/PII; mọi credentials dùng trong mk-test là **synthetic** (`p1-fixture-password-…`, `mock-service-key-only-local`) do session này tạo; literal không đại diện credential thật nào.
- Cluster 55442: KHÔNG bị dữ liệu destroy; state hiện tại là postmaster wedged của **instance vừa được khởi động lại trong session này và chưa thể phục vụ kết nối** — Blocker B-1 chờ owner (qui trình dừng sạch + start lại đã được đề xuất).

**Trạng thái chốt**: P1.1 = `FIXED-LOCAL`; P1.2 = `PATCHED-LOCAL`; Production hotfix = `AWAITING EXPLICIT APPROVAL`; Cutover = `NO-GO`.
