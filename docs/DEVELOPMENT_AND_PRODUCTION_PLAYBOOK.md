# THE SOFTWARE DEVELOPMENT & PRODUCTION PLAYBOOK
## *A Battle-Tested Engineering Framework for High-Reliability, Secure Web Applications*
### *From Inception to Production Verification and Post-Launch Operations*

---

## MỤC LỤC

1. [Triết lý cốt lõi & Giới thiệu](#1-triết-lý-cốt-lõi--giới-thiệu)
2. [Tái dựng Quy trình Thực tế (Real-World Case Flow)](#2-tái-dựng-quy-trình-thực-tế-real-world-case-flow)
3. [Case Study: Phân tích Toàn bộ Lỗ hổng & Bài học Thực chiến](#3-case-study-phân-tích-toàn-bộ-lỗ-hổng--bài-học-thực-chiến)
4. [Universal Development Lifecycle (Quy trình Phát triển Tổng quát)](#4-universal-development-lifecycle-quy-trình-phát-triển-tổng-quát)
5. [3 Cấp độ Thay đổi Kỹ thuật (Three Tiers of Change Management)](#5-3-cấp-độ-thay-đổi-kỹ-thuật-three-tiers-of-change-management)
6. [Quy trình An toàn Thay đổi & Phân tích Tác động (Change Safety Workflow)](#6-quy-trình-an-toàn-thay-đổi--phân-tích-tác-động-change-safety-workflow)
7. [Bảng Ma trận Kiểm thử theo Rủi ro (Risk-Based Testing Matrix)](#7-bảng-ma-trận-kiểm-thử-theo-rủi-ro-risk-based-testing-matrix)
8. [Nguyên tắc Thẩm định Thực chứng: "Evidence > Claim"](#8-nguyên-tắc-thẩm-định-thực-chứng-evidence--claim)
9. [Quy chuẩn Thay đổi Cơ sở Dữ liệu & RLS Security](#9-quy-chuẩn-thay-đổi-cơ-sở-dữ-liệu--rls-security)
10. [Quy trình Ứng phó Sự cố Production (Incident Response & Recovery)](#10-quy-trình-ứng-phó-sự-cố-production-incident-response--recovery)
11. [Bộ Checklists Toàn diện Tái sử dụng (Universal Checklists)](#11-bộ-checklists-toàn-diện-tái-sử-dụng-universal-checklists)
12. [Mẫu Đánh giá An ninh Tiêu chuẩn (Security Review Template)](#12-mẫu-đánh-giá-an-ninh-tiêu-chuẩn-security-review-template)
13. [Master Prompt Tái sử dụng cho Coding AI Agents](#13-master-prompt-tái-sử-dụng-cho-coding-ai-agents)
14. [The Engineer's Rules (20 Nguyên tắc Vàng của Kỹ sư Phần mềm)](#14-the-engineers-rules-20-nguyên-tắc-vàng-của-kỹ-sư-phần-mềm)

---

## 1. Triết lý cốt lõi & Giới thiệu

Tài liệu này được đúc kết từ toàn bộ chu trình phát triển, kiểm thử, thẩm định an ninh, xử lý race condition, tái cấu trúc cơ sở dữ liệu và triển khai thực tế của hệ thống thương mại điện tử gây quỹ **Gieo Mơ**.

Mục tiêu của Playbook không chỉ dừng lại ở việc tổng kết một dự án cụ thể, mà nhằm **tiêu chuẩn hóa phương pháp tư duy và quy trình kỹ thuật thành một cẩm nang tác chiến** có thể mang sang áp dụng cho bất kỳ dự án phần mềm nào trong môi trường doanh nghiệp.

### Ba tiên đề cốt lõi:
1. **Evidence > Claims (Bằng chứng vượt trên Lời khẳng định)**: Một bản báo cáo, một câu trả lời của AI hay một commit pass build không đồng nghĩa với việc phần mềm đã an toàn và chạy đúng. Mọi trạng thái `READY` hoặc `PASS` bắt buộc phải đi kèm log kiểm thử, lệnh tái lập, mã phản hồi thực tế và đối soát dữ liệu trên môi trường thật.
2. **Fail Closed & Zero Trust (Mặc định Khóa & Không tin cậy Client)**: Mọi dữ liệu đến từ frontend (giá, mã giảm giá, số lượng tồn, vai trò người dùng, tệp tải lên) đều có thể bị can thiệp. Backend và Cơ sở dữ liệu là hai chốt chặn phòng thủ độc lập và tối thượng.
3. **Risk-Calibrated Velocity (Tốc độ tỷ lệ thuận với mức độ kiểm soát rủi ro)**: Tránh overengineering bằng cách phân loại rủi ro chính xác: Thay đổi nhỏ cần xác minh nhanh, thay đổi tài chính/kho/bảo mật cần kiểm thử hồi quy toàn diện.

---

## 2. Tái dựng Quy trình Thực tế (Real-World Case Flow)

Nhìn lại quá trình xây dựng hệ thống Gieo Mơ, quy trình thực tế đã diễn ra qua 17 bước tuần tự và chặt chẽ:

```text
  [1. Requirements & Business Logic Formulation]
                        ↓
  [2. Architecture & Tech Stack Selection (Next.js App Router + Supabase + Tailwind)]
                        ↓
  [3. Initial Implementation (Storefront, Cart, Checkout, Admin CMS)]
                        ↓
  [4. Phase 1: Security Audit & Critical Remediation (P0.1 - P0.8)]
                        ↓
  [5. Phase 2: Security Regression & Full API Audit (BUG-01 -> BUG-10)]
                        ↓
  [6. Database RLS Lockdown & Column-Level Privilege Review]
                        ↓
  [7. Server-Side Cryptographic & Session Hardening (PBKDF2 + HMAC Signatures)]
                        ↓
  [8. Inventory Race Condition & Atomic Operations Design (PostgreSQL RPC)]
                        ↓
  [9. Webhook & Payment Integration Idempotency (SePay Automation)]
                        ↓
  [10. Privacy & PII Masking Implementation]
                        ↓
  [11. Magic-Byte File Signature & Upload Hardening]
                        ↓
  [12. End-to-End Functional & Responsive Testing]
                        ↓
  [13. Production Build & Static Page Generation Validation]
                        ↓
  [14. Phase 3: Production Database Verification (Live SQL Querying)]
                        ↓
  [15. Phase 4: Final Production Readiness & Concurrency Testing]
                        ↓
  [16. Phase 5: Final Hardening, Idempotency & Backup Strategy]
                        ↓
  [17. Go-Live Sign-Off & Post-Launch Monitoring Setup]
```

---

## 3. Case Study: Phân tích Toàn bộ Lỗ hổng & Bài học Thực chiến

Dưới đây là bảng tổng hợp các bài học sâu sắc từ các nhóm lỗi đã được bóc tách và giải quyết trong dự án:

### Nhóm 1: Xác thực & Quản lý Phiên (Authentication & Session)
* **Vấn đề**: Tồn tại tài khoản backdoor/fallback hardcoded (`admin@gieomo.store`, `GieoMo@2026`) khi DB rỗng; Session secret có fallback tĩnh dạng hardcode string.
* **Root Cause**: Kỹ sư để lại fallback credentials phục vụ dev/test cục bộ nhưng không loại bỏ khi lên production.
* **Fix**: Xóa 100% credential hardcode. Triển khai băm PBKDF2 (SHA-512 với salt ngẫu nhiên). Session HMAC secret bắt buộc phải đọc từ biến môi trường, nếu thiếu sẽ `fail closed` (ném Runtime Error).
* **Bài học**: **Tuyệt đối không để "cửa hậu" (backdoor) hay chuỗi fallback tĩnh trong mã nguồn.**

### Nhóm 2: Phân quyền API (API Authorization & IDOR)
* **Vấn đề**: Các endpoint `/api/admin/notifications`, `/api/members/presence`, `/api/orders` (PATCH) cho phép truy cập mà không kiểm tra session admin hoặc chỉ kiểm tra lỏng lẻo.
* **Root Cause**: Lầm tưởng đặt route dưới tiền tố `/api/admin/` là mặc định được Next.js bảo vệ.
* **Fix**: Tạo middleware helper `requireAdmin(request)` và `requireAuth(request)` thực hiện xác thực chữ ký HMAC và giải mã payload server-side trước khi xử lý bất kỳ logic nào.
* **Bài học**: **Đường dẫn URL không phải là phân quyền. Mọi endpoint nhạy cảm phải chủ động kiểm tra quyền ở cấp độ máy chủ.**

### Nhóm 3: Rò rỉ Thông tin Cá nhân (PII Exposure & Enumeration)
* **Vấn đề**: `GET /api/orders?phone=090...` cho phép bất kỳ ai biết số điện thoại của người khác truy vấn toàn bộ lịch sử mua hàng, địa chỉ nhà và số tiền.
* **Root Cause**: Thiết kế API tra cứu quá dễ dãi để phục vụ tính năng "Tra cứu theo SĐT".
* **Fix**: Yêu cầu bắt buộc phải có đồng thời cả `order_code` và `phone` khớp nhau mới cho phép tra cứu, hoặc nếu tra cứu qua đường link trực tiếp thì áp dụng thuật toán Masking (`Ng*** A**`, `090****567`, `***, Quận 1`).
* **Bài học**: **Không bao giờ cho phép truy vấn PII chỉ bằng 1 định danh duy nhất có thể đoán (dễ brute-force).**

### Nhóm 4: Toàn vẹn Dữ liệu & Race Condition (Concurrency & TOCTOU)
* **Vấn đề**: Trừ kho theo mô hình: `SELECT stock -> check if stock >= qty -> UPDATE stock`. Khi 2 khách đặt hàng đồng thời, cả 2 đều thấy còn 1 sản phẩm và cùng trừ, dẫn đến overselling (tồn kho âm hoặc bán vượt).
* **Root Cause**: Time-of-Check to Time-of-Use (TOCTOU) không có khóa (lock) hoặc atomic update.
* **Fix**: Chuyển sang câu lệnh Atomic có điều kiện trong PostgreSQL:
  ```sql
  UPDATE product_variants SET stock = stock - qty WHERE variant_id = $1 AND stock >= qty;
  ```
  Kết hợp hàm PostgreSQL `SECURITY DEFINER` và cơ chế hoàn tác (Rollback) tự động nếu đơn hàng đa sản phẩm bị hụt một món bất kỳ.
* **Bài học**: **Mọi thao tác thay đổi số dư, kho hàng, voucher phải là Atomic Operation cấp Database.**

### Nhóm 5: Độc lập Cơ sở Dữ liệu & RLS Bypass (Supabase PostgREST)
* **Vấn đề**: RLS có policy `USING (true)` cho phép anon user gọi trực tiếp Supabase REST API để lấy toàn bộ `members.password_hash` và `orders`.
* **Root Cause**: RLS chỉ lọc theo hàng (Row), không lọc theo cột (Column). Khi mở quyền `SELECT` cho anon, toàn bộ các cột nhạy cảm đều bị phơi bày.
* **Fix**: `REVOKE SELECT ON members FROM anon, authenticated;`. Chuyển toàn bộ thao tác đọc dữ liệu nhạy cảm về Backend API sử dụng `service_role`.
* **Bài học**: **Bảo mật database độc lập với bảo mật backend. Không mở quyền SELECT trên các bảng có chứa mật khẩu/secrets.**

### Nhóm 6: Tải tệp lên & Magic Bytes Validation
* **Vấn đề**: Endpoint upload ảnh chỉ kiểm tra đuôi file và header `Content-Type` do client gửi lên. Kẻ tấn công có thể đổi tên mã độc HTML/SVG/PHP thành `.jpg` để vượt qua bộ lọc.
* **Root Cause**: Tin tưởng metadata từ phía Client.
* **Fix**: Đọc trực tiếp byte header của file (Magic Bytes: `FF D8 FF` cho JPEG, `89 50 4E 47` cho PNG...) và quét nội dung phòng chống chèn mã nhúng `<script`, `<svg`, `<?php`.
* **Bài học**: **Luôn xác thực nội dung nhị phân (Binary Magic Bytes) thực tế của tệp tin.**

---

## 4. Universal Development Lifecycle (Quy trình Phát triển Tổng quát)

Quy trình 7 bước áp dụng cho bất kỳ dự án phần mềm nào:

```text
┌─────────────────────────────────────────────────────────────┐
│ PHASE 0: REQUIREMENT & THREAT MODELING                      │
│ - Xác định ranh giới dữ liệu (Trust Boundaries)            │
│ - Định nghĩa Data Contracts, Flow Diagrams & State Machines │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 1: SECURE IMPLEMENTATION                              │
│ - Xây dựng Core Feature theo nguyên tắc Zero Trust         │
│ - Tính toán toàn bộ Giá trị / Phí / Giảm giá Server-Side   │
│ - Tách biệt Database Access Layer                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 2: SECURITY & ISOLATION AUDIT                         │
│ - Kiểm tra AuthN / AuthZ ở từng Endpoint                   │
│ - Kiểm tra RLS / Database Permissions / Secret Leakage      │
│ - Thẩm định Magic Bytes Upload & HTML Escaping              │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 3: DATA INTEGRITY & CONCURRENCY                       │
│ - Thiết kế Atomic Decrement / Increment                    │
│ - Chống Race Condition / Double Submission                 │
│ - Đảm bảo Idempotency cho Webhook & Payment                │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 4: COMPREHENSIVE VERIFICATION                         │
│ - Negative Testing (Gửi dữ liệu sai, phá hoại)              │
│ - Multi-Breakpoint Responsive & Browser Testing             │
│ - Build & Type-Check Verification                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 5: PRODUCTION DEPLOYMENT & MIGRATION VERIFICATION     │
│ - Áp dụng Migrations lên Production Database                │
│ - Xác minh Live Database State qua câu lệnh SQL             │
│ - Cấu hình Environment Variables (Không sót Secret)         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ PHASE 6: POST-LAUNCH OBSERVABILITY & DISASTER RECOVERY      │
│ - Monitoring Logs (Vercel, Database, Webhooks)              │
│ - Đối soát dữ liệu (Reconciliation)                         │
│ - Chiến lược Backup Snapshot & Rollback sẵn sàng            │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 3 Cấp độ Thay đổi Kỹ thuật (Three Tiers of Change Management)

Không phải mọi thay đổi đều cần quy trình thẩm định 5 bước. Cần chia rõ 3 cấp độ:

### Level 1: Thay đổi Thấp (Low-Risk / UI-Only)
* **Phạm vi**: Sửa nội dung text, typo, banner tĩnh, CSS style, màu sắc không ảnh hưởng layout form.
* **Quy trình tối thiểu**: `npm run type-check` $\rightarrow$ Test hiển thị trên màn hình Desktop + Mobile $\rightarrow$ Merge & Deploy.
* **Không cần**: Chạy lại kiểm thử API hồi quy, không cần migration.

### Level 2: Thay đổi Trung bình - Cao (High-Risk / Logic & API)
* **Phạm vi**: Thêm/sửa API endpoint, sửa logic tính tiền/giảm giá, sửa logic checkout, thêm cột vào database, sửa middleware phân quyền.
* **Quy trình bắt buộc**: 
  1. Phân tích tác động (Impact Analysis).
  2. Viết Unit/Integration Test cho kịch bản đúng và kịch bản sai (Negative Test).
  3. Kiểm tra Authorization (Anonymous/Member/Admin).
  4. Chạy `npm run build` và kiểm thử End-to-End luồng liên quan.

### Level 3: Thay đổi Nghiêm trọng / Sự cố An ninh (Critical / Incident)
* **Phạm vi**: Lộ secret, rò rỉ dữ liệu khách hàng, lỗi thanh toán/webhook không nhận tiền, lỗi overselling/âm kho, hỏng RLS.
* **Quy trình bắt buộc**: 
  1. Kích hoạt quy trình Ứng phó Sự cố (Containment $\rightarrow$ Patch $\rightarrow$ Live DB Verification $\rightarrow$ Post-Mortem).
  2. Bắt buộc kiểm tra trực tiếp trạng thái Database trên Production trước khi mở lại hệ thống.

---

## 6. Quy trình An toàn Thay đổi & Phân tích Tác động (Change Safety Workflow)

Khi nhận yêu cầu sửa đổi một tính năng đang chạy, hãy tuân thủ sơ đồ 8 bước sau để không bao giờ "sửa chỗ này hỏng chỗ khác":

```text
[Yêu cầu Thay đổi]
       │
       ▼
[1. Impact Analysis] ────► Liệt kê tất cả các file, API, DB table và UI liên quan
       │
       ▼
[2. Identify Side-Effects] ──► Đặt câu hỏi: "Thay đổi này có ảnh hưởng luồng Checkout,
       │                       Payment hay Quyền Admin không?"
       ▼
[3. Local Implementation] ──► Sửa code theo nguyên tắc Incremental Change (Không rewrite ồ ạt)
       │
       ▼
[4. Targeted Testing] ────► Test trực tiếp tính năng vừa sửa (Happy path + Edge cases)
       │
       ▼
[5. Regression Testing] ──► Test các tính năng xung quanh (Ví dụ: sửa Voucher thì phải test
       │                    lại Checkout và Tính tổng tiền)
       ▼
[6. Build & Type Check] ──► Chạy "npm run type-check" và "npm run build"
       │
       ▼
[7. Staging / Verification] ─► Xác minh trên Staging hoặc qua lệnh SQL kiểm chứng
       │
       ▼
[8. Production Monitor] ──► Theo dõi log trong 30 phút đầu sau deploy
```

---

## 7. Bảng Ma trận Kiểm thử theo Rủi ro (Risk-Based Testing Matrix)

| Loại thay đổi | Mức rủi ro | Bộ kiểm thử Tối thiểu (Minimum Tests) | Kiểm thử Hồi quy Toàn diện? |
| :--- | :---: | :--- | :---: |
| **Thay đổi Text / Ảnh / Typography** | **Low** | Visual check + Responsive | ❌ Không |
| **Thay đổi CSS / Layout Grid** | **Low - Med** | Breakpoints: 320px, 390px, 768px, 1440px | ❌ Không |
| **Thêm Component UI Form** | **Medium** | Form validation + Error state + Loading state | ⚠️ Chỉ luồng liên quan |
| **Thay đổi API Route / Controller** | **High** | Auth check (Anon/Member/Admin) + Invalid payloads | ✅ Có (API Regression) |
| **Sửa Database Migration / RLS** | **Very High** | Run migration + Live SQL inspect + PostgREST test | ✅ Có (Full DB Audit) |
| **Sửa Logic Tính tiền / Voucher** | **Critical** | Zero subtotal + Min order + Max discount cap + Negative price | ✅ Bắt buộc |
| **Sửa Quản lý Tồn kho / Variant** | **Critical** | Concurrency race (stock = 1) + Rollback multi-items | ✅ Bắt buộc |
| **Sửa Auth / Session Token** | **Critical** | Wrong pass + Expired token + Tampered HMAC signature | ✅ Bắt buộc |
| **Sửa Webhook Thanh toán** | **Critical** | Replay webhook + Short amount + Invalid signature/API key | ✅ Bắt buộc |

---

## 8. Nguyên tắc Thẩm định Thực chứng: "Evidence > Claim"

Khi làm việc độc lập hoặc làm việc cùng AI Coding Agents, **tuyệt đối không chấp nhận câu trả lời "Tính năng đã hoạt động tốt" hoặc "Đã sửa xong" nếu không có bằng chứng kỹ thuật.**

### Tiêu chuẩn một bằng chứng hợp lệ (Verification Artifact):
Mọi kết quả kiểm thử phải có cấu trúc:
1. **Lệnh thực thi hoặc Endpoint**: (Ví dụ: `POST /api/webhook/sepay` hoặc `npm run build`).
2. **Payload / Input đầu vào**: (Ví dụ: `{ amountIn: 50000, final_amount: 100000 }`).
3. **Kết quả kỳ vọng (Expected)**: (Ví dụ: `HTTP 200, status not changed to paid`).
4. **Kết quả thực tế (Actual)**: (Mã HTTP, Response Body, Database Record).
5. **Trạng thái**: `PASS` hoặc `FAIL`. Nếu chưa chạy trên môi trường thật thì ghi rõ `UNVERIFIED`.

---

## 9. Quy chuẩn Thay đổi Cơ sở Dữ liệu & RLS Security

### A. RLS Best Practices
1. **Mặc định Bật RLS**: Mọi bảng tạo mới trong PostgreSQL phải có ngay lệnh:
   ```sql
   ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;
   ```
2. **Không dùng `USING (true)` cho bảng nhạy cảm**: Tuyệt đối không cấp quyền `SELECT` công khai cho bảng chứa thông tin khách hàng, đơn hàng, cấu hình mật hoặc tài khoản người dùng.
3. **Phân quyền cấp Cột (Column Protection)**: RLS chỉ lọc dòng. Nếu cần bảo vệ cột (như `password_hash`), hãy thu hồi quyền `SELECT` của `anon` và `authenticated` trên toàn bảng và chỉ cho phép Backend truy cập qua `service_role`.

### B. Hàm Atomic & Safe Concurrency
Khi xử lý biến động số dư hoặc tồn kho:
* Luôn sử dụng `SECURITY DEFINER` cẩn trọng: Đặt `SET search_path = public;` để tránh search_path injection.
* Luôn xác thực tham số đầu vào (`quantity > 0`).
* Luôn thu hồi quyền `EXECUTE` từ `PUBLIC`, `anon`, `authenticated` nếu hàm chỉ phục vụ logic nội bộ của máy chủ backend.

---

## 10. Quy trình Ứng phó Sự cố Production (Incident Response & Recovery)

```text
[PHÁT HIỆN SỰ CỐ]
       │
       ▼
[1. Đánh giá Mức độ] ──► P0 (Cháy hệ thống/Lộ dữ liệu) | P1 (Lỗi nghiệp vụ nặng) | P2/P3
       │
       ▼
[2. Cách ly (Containment)] ──► Tạm đóng endpoint, chặn IP tấn công hoặc bật bảo trì
       │
       ▼
[3. Bảo lưu Bằng chứng] ──► Lưu log lỗi, snapshot database trước khi can thiệp
       │
       ▼
[4. Sửa chữa / Rollback] ──► Rollback về commit an toàn gần nhất HOẶC chạy Hotfix
       │
       ▼
[5. Xác minh Thực tế] ────► Chạy script kiểm chứng SQL / API test
       │
       ▼
[6. Phân tích Nguyên nhân] ──► Viết báo cáo Root Cause Analysis (RCA) & Bổ sung Test Case
```

### Phân loại mức độ sự cố:
* **P0 (Blocker / Critical)**: Lộ dữ liệu cá nhân, thất thoát tiền, sửa được giá/tồn kho tùy ý, hệ thống sập hoàn toàn $\rightarrow$ **Xử lý ngay lập tức trong 15 phút**.
* **P1 (High)**: Một tính năng chính bị hỏng (khách không đặt hàng được, webhook không nhận), không có workaround $\rightarrow$ **Xử lý trong vòng 1-2 giờ**.
* **P2 (Medium)**: Lỗi giao diện gây khó chịu nhưng vẫn hoàn tất giao dịch được $\rightarrow$ **Xử lý trong ngày**.
* **P3 (Low)**: Lỗi thẩm mỹ nhỏ, typo text $\rightarrow$ **Đưa vào đợt release tiếp theo**.

---

## 11. Bộ Checklists Toàn diện Tái sử dụng (Universal Checklists)

### Checklist 1: Trước khi viết Code (Before Coding)
* [ ] Đã hiểu rõ yêu cầu nghiệp vụ và các trường hợp biên (Edge Cases).
* [ ] Đã xác định ranh giới bảo mật (Ai được xem? Ai được sửa?).
* [ ] Đã thiết kế cấu trúc dữ liệu và quan hệ bảng (Database Schema).
* [ ] Đã xác định các dịch vụ bên ngoài (Payment, Email, Storage).

### Checklist 2: Trước khi Tạo Pull Request / Merge (Before Merge)
* [ ] `npm run type-check` vượt qua 100% không có lỗi type.
* [ ] `npm run build` tạo bundle sạch sẽ, không có warning nghiêm trọng.
* [ ] Không còn `console.log` chứa thông tin nhạy cảm, không có credential hardcoded.
* [ ] Đã escape toàn bộ dữ liệu người dùng trước khi render vào HTML/Email.
* [ ] File upload đã có kiểm tra Magic Bytes.
* [ ] Các hàm trừ tiền/kho đã sử dụng Atomic Operations.

### Checklist 3: Trước khi Phát hành lên Production (Pre-Release)
* [ ] Toàn bộ Migration SQL đã được chạy trên Production Database.
* [ ] Đã kiểm tra RLS trên Production: Không có policy nào mở quyền nguy hiểm.
* [ ] Biến môi trường trên Hosting (Vercel/Cloud) đã điền đầy đủ và chính xác.
* [ ] Key của Admin Session Secret và Webhook ApiKey đã được tạo ngẫu nhiên $\ge 32$ ký tự.
* [ ] Đã có bản Backup Snapshot mới nhất của Database.

### Checklist 4: Sau khi Phát hành (Post-Release)
* [ ] Chạy Smoke Test luồng chính: Trang chủ $\rightarrow$ Giỏ hàng $\rightarrow$ Đặt thử 1 đơn test.
* [ ] Kiểm tra Webhook thanh toán phản hồi `200 OK`.
* [ ] Kiểm tra Đăng nhập Admin và hiển thị Dashboard.
* [ ] Theo dõi Realtime Logs trong 30 phút đầu tiên.

---

## 12. Mẫu Đánh giá An ninh Tiêu chuẩn (Security Review Template)

Dùng mẫu này khi thực hiện Audit định kỳ hoặc trước các đợt phát hành lớn:

```markdown
# BÁO CÁO ĐÁNH GIÁ AN NINH HỆ THỐNG

## 1. Thông tin Chung
* **Dự án**: [Tên dự án]
* **Môi trường**: Production / Staging
* **Commit Hash**: [Hash]
* **Người thực hiện**: [Tên Kỹ sư / Agent]
* **Ngày đánh giá**: [YYYY-MM-DD]

## 2. Phạm vi Đánh giá (Scope)
* [ ] Authentication & Session Management
* [ ] Authorization & Access Control (RBAC/IDOR)
* [ ] Secrets Management & Environment Isolation
* [ ] API Route Security & Negative Testing
* [ ] Database Row Level Security (RLS) & Column Grants
* [ ] Concurrency, Race Conditions & Atomic Operations
* [ ] Input Validation, HTML Injection & Stored XSS
* [ ] File Upload & Magic-Byte Signature Verification
* [ ] Payment Flow & Webhook Idempotency

## 3. Danh sách Phát hiện (Findings)
| ID | Lỗ hổng | Mức độ | File / Endpoint | Root Cause | Đề xuất Khắc phục |
| :--- | :--- | :---: | :--- | :--- | :--- |
| SEC-01 | ... | P0/P1/P2/P3 | ... | ... | ... |

## 4. Bằng chứng Thực nghiệm (Evidence)
* **Test Case**: ...
* **Input**: ...
* **Expected**: ...
* **Actual Output**: ...

## 5. Kết luận Cuối cùng (Final Verdict)
* [ ] ✅ **READY FOR PRODUCTION** (Tất cả rào chắn đã pass có bằng chứng)
* [ ] ⚠️ **READY WITH KNOWN RISKS** (Chỉ còn rủi ro nhỏ đã được ghi nhận)
* [ ] ❌ **BLOCKED** (Còn lỗi P0/P1 hoặc chưa verify Database)
```

---

## 13. Master Prompt Tái sử dụng cho Coding AI Agents

Khi bắt đầu một dự án mới hoặc giao nhiệm vụ sửa lỗi cho AI Agent (Cursor, Claude Code, GitHub Copilot, Antigravity), hãy sao chép nguyên văn prompt chỉ thị sau:

```text
Bạn là Senior Full-Stack Software Engineer & Lead Security Architect.
Nhiệm vụ của bạn là thực hiện công việc kỹ thuật trên codebase này với kỷ luật phần mềm và độ tin cậy cấp doanh nghiệp.

NGUYÊN TẮC BẮT BUỘC:
1. ĐỌC VÀ HIỂU TRƯỚC KHI SỬA: Không bao giờ sửa code ngay khi chưa đọc code thực tế và phân tích nguyên nhân gốc rễ (Root Cause).
2. PHÂN TÍCH TÁC ĐỘNG (IMPACT ANALYSIS): Trước khi chỉnh sửa, liệt kê tất cả các component, API, Database table và luồng nghiệp vụ có thể bị ảnh hưởng.
3. FAIL CLOSED & ZERO TRUST: Không bao giờ tin tưởng dữ liệu từ Client (giá tiền, giảm giá, số lượng, role). Mọi phép tính toán tài chính và phân quyền phải được enforce 100% Server-side.
4. BẢO VỆ DỮ LIỆU & CONCURRENCY: Mọi thao tác biến động kho/số dư phải là Atomic. Chống tuyệt đối Race Condition và Double Submission.
5. KHÔNG HARDCODE SECRETS / CREDENTIALS: Không để lại tài khoản backdoor, fallback password hay chuỗi secret tĩnh trong code.
6. THẨM ĐỊNH THỰC CHỨNG (EVIDENCE > CLAIMS): 
   - Không được tuyên bố "Đã sửa xong" hay "PASS" nếu chỉ dựa vào việc đọc code.
   - Luôn chạy Type-check, Build và cung cấp bằng chứng kiểm thử thực tế (Input, Output, HTTP Status, Database State).
7. AN TOÀN PRODUCTION: Không tự ý chạy destructive SQL trên Database Production. Mọi migration phải kèm theo SQL kiểm chứng an toàn.
```

---

## 14. The Engineer's Rules (20 Nguyên tắc Vàng của Kỹ sư Phần mềm)

1. **Never trust client input.** (Mọi thứ gửi từ trình duyệt đều có thể bị giả mạo).
2. **Never expose secrets to the client bundle.** (Không có secret nào an toàn nếu nằm trong file JS gửi về trình duyệt).
3. **Authentication is not Authorization.** (Đăng nhập thành công không có nghĩa là có quyền sửa đơn của người khác).
4. **Database security is application security.** (Nếu mở RLS `USING (true)`, ứng dụng của bạn không hề có bảo mật).
5. **Always calculate prices and discounts server-side.** (Client chỉ hiển thị, Server mới là nơi quyết định số tiền).
6. **Stock operations must be atomic.** (Trừ kho phải thực hiện bằng câu lệnh điều kiện cấp Database, không dùng SELECT rồi UPDATE).
7. **Idempotency is mandatory for webhooks and payments.** (Cùng một giao dịch gửi lại 10 lần chỉ được ghi nhận đúng 1 lần).
8. **Fail closed by default.** (Nếu thiếu Secret hoặc cấu hình sai, hệ thống phải dừng lại và báo lỗi, không được chạy tiếp với giá trị mặc định thiếu an toàn).
9. **A successful build does not equal a bug-free release.** (Build pass chỉ chứng minh cú pháp đúng, không chứng minh nghiệp vụ an toàn).
10. **Evidence > Claims.** (Một log test thực tế có giá trị hơn 1000 lời khẳng định "Code đã chuẩn").
11. **Do not create backdoors for convenience.** (Sự tiện lợi khi dev là lỗ hổng chết người khi lên Production).
12. **Always validate file magic bytes.** (Đuôi file `.jpg` không chứng minh nội dung bên trong là ảnh).
13. **Sanitize and escape all user content before rendering.** (Chống XSS và HTML Injection từ cấp độ gốc).
14. **Mask sensitive PII in public-facing interfaces.** (Số điện thoại, địa chỉ, email của khách hàng không bao giờ được trả về nguyên bản trong API tra cứu công khai).
15. **Incremental changes beat mass rewrites.** (Sửa đúng trọng tâm, kiểm soát bán kính tác động, tránh đập đi xây lại làm hỏng các tính năng cũ).
16. **Every database migration must have a verification query.** (Chạy migration xong phải có câu lệnh SELECT đối soát trạng thái).
17. **Always have a rollback strategy.** (Trước khi bấm Deploy, phải biết chính xác cách quay lại phiên bản cũ nếu gặp sự cố).
18. **Isolate keys and responsibilities.** (Key ký session cookie tách biệt hoàn toàn với Key quản trị database).
19. **Log with context, but never log sensitive credentials.** (Ghi log đủ để debug lỗi nhưng tuyệt đối không in password, token, session secret ra log).
20. **Take extreme ownership of the system.** (Kỹ sư phần mềm xuất sắc không chỉ viết code chạy được, mà tạo ra hệ thống an toàn, bền bỉ và đáng tin cậy trong mọi hoàn cảnh).

---
*Tài liệu được biên soạn và chuẩn hóa bởi Đội ngũ Kỹ thuật Gieo Mơ — Mầm Mơ Project.*
