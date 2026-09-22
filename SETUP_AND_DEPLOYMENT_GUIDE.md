# GIEO MƠ — HƯỚNG DẪN SETUP, KẾT NỐI SUPABASE, VERCEL & DỰ ÁN ASSETS (SETUP & DEPLOYMENT GUIDE)

> **Tài liệu hướng dẫn chi tiết dành cho Kỹ thuật viên & Ban quản trị dự án Gieo Mơ - Mầm Mơ**

---

## 🛠️ PHẦN 1: HƯỚNG DẪN CÀI ĐẶT CHẠY CỤC BỘ (LOCAL SETUP)

### 1. Yêu cầu môi trường
- **Node.js**: Phiên bản `18.x` hoặc `20.x` trở lên (Khuyến nghị 20+).
- **Trình quản lý gói**: `npm` (đi kèm Node.js).
- **Git**: Đã cài đặt trên máy.

### 2. Các lệnh khởi chạy
Mở Terminal/PowerShell tại thư mục mã nguồn dự án:

```bash
# 1. Cài đặt toàn bộ dependencies
npm install

# 2. Tạo file cấu hình môi trường cục bộ từ file mẫu
cp .env.example .env.local

# 3. Khởi chạy máy chủ phát triển (Development Server)
npm run dev
```
Truy cập trình duyệt tại địa chỉ: `http://localhost:3000`

---

## ⚡ PHẦN 2: KẾT NỐI VÀ THIẾT LẬP DATABASE SUPABASE

Supabase là hệ quản trị cơ sở dữ liệu PostgreSQL và Authentication miễn phí dành cho dự án.

### Bước 1: Tạo dự án trên Supabase
1. Truy cập [https://supabase.com](https://supabase.com) và đăng nhập bằng tài khoản GitHub.
2. Nhấn **"New Project"**, chọn Org và nhập:
   - **Name**: `gieomo-sales-management-system`
   - **Database Password**: Nhập mật khẩu an toàn (Lưu lại mật khẩu này).
   - **Region**: Chọn `Singapore (ap-southeast-1)` để tối ưu tốc độ tại Việt Nam.

3. **Cấu hình tùy chọn Data API Settings (Nếu Supabase hỏi khi khởi tạo)**:
   - `[✓]` **Enable Data API**: **TICK (BẬT)** — Bắt buộc để `@supabase/supabase-js` truy vấn được.
   - `[ ]` **Automatically expose new tables**: **KHÔNG TICK (TẮT)** — Kiểm soát quyền hạn thủ công qua SQL RLS.
   - `[✓]` **Enable automatic RLS**: **TICK (BẬT)** — Đảm bảo an toàn bảo mật dữ liệu khách hàng & kho hàng.

### Bước 2: Chạy khởi tạo Database Schema & Seed Data
1. Tại Supabase Dashboard, chọn mục **SQL Editor** từ menu bên trái.
2. Mở file [`supabase/migrations/001_initial_schema.sql`](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/supabase/migrations/001_initial_schema.sql) trong máy tính, dán toàn bộ nội dung vào SQL Editor và nhấn **RUN**.
3. Tiếp theo, mở file [`supabase/seed.sql`](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/supabase/seed.sql), dán vào SQL Editor và nhấn **RUN** để nạp dữ liệu danh mục & sản phẩm mẫu ban đầu.

### Bước 3: Tạo Storage Buckets chứa ảnh
1. Vào mục **Storage** ➔ Nhấn **"New Bucket"**.
2. Tạo 2 bucket công khai (Public bucket):
   - Bucket 1: `product-media` (Chứa ảnh sản phẩm)
   - Bucket 2: `content-media` (Chứa ảnh banner, nhà tài trợ)

### Bước 4: Cấu hình biến môi trường (API Keys)
1. Vào **Project Settings ➔ API** trên Supabase Dashboard.
2. Điền thông tin vào file `.env.local` của bạn:

```env
# URL dự án Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co

# Khóa Public Anon Key (Dùng cho Client-side)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Khóa Service Role Key (Dùng cho Server-side / Admin API - Bảo mật cao)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cấu hình địa chỉ trang web
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 🌐 PHẦN 3: ĐƯA WEB LÊN VERCEL (DEPLOYMENT TO VERCEL)

Vercel là hạ tầng đám mây tối ưu nhất cho ứng dụng Next.js.

### Bước 1: Khởi tạo & Đẩy code lên GitHub Repository
Mở Terminal tại thư mục dự án và chạy lần lượt các lệnh sau:

```bash
# 1. Khởi tạo kho Git cục bộ (Nếu chưa có)
git init

# 2. Đổi tên nhánh chính thành main
git branch -M main

# 3. Thêm tất cả các file vào Git (Tự động bỏ qua node_modules, .next, .env.local theo .gitignore)
git add .

# 4. Tạo commit đầu tiên
git commit -m "Complete Gieo Mo storefront and admin portal"

# 5. Tạo Repository mới trên GitHub (https://github.com/new)
# Sau khi tạo trên GitHub, dán link repository của bạn vào lệnh dưới (thay URL bằng link repo của bạn):
git remote add origin https://github.com/YOUR_USERNAME/gieomo-sales-management-system.git

# 6. Đẩy code lên GitHub
git push -u origin main
```

### Bước 2: Import dự án vào Vercel
1. Truy cập [https://vercel.com](https://vercel.com) và chọn **"Add New..." ➔ "Project"**.
2. Kết nối với tài khoản GitHub và chọn repository `gieomo-sales-management-system`.
3. Tại phần **Framework Preset**, chọn `Next.js`.

### Bước 3: Cấu hình Biến môi trường trên Vercel
Tại mục **Environment Variables** trên Vercel, điền 4 biến tương tự trong `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (Ví dụ: `https://gieomo.vn` hoặc `https://gieomo.vercel.app`)

Nhấn **"Deploy"**. Vercel sẽ tự động build và cấp tên miền công khai trong vòng 1-2 phút!

---

## 🎨 PHẦN 4: DANH SÁCH HÌNH ẢNH & ASSETS CẦN CUNG CẤP

Để trang web hiển thị chân thực và ấn tượng nhất, bạn cần chuẩn bị các file hình ảnh và bỏ đúng vào thư mục chỉ định bên dưới:

### Thư mục chứa hình ảnh: `public/images/`

| Đường dẫn file (`public/...`) | Kích thước khuyến nghị | Định dạng | Mô tả nội dung file |
|---|---|---|---|
| `/images/products/pouch-mam-mo-1.jpg` | `800x800 px` | JPG / WebP | Ảnh chụp sản phẩm Pouch Mầm Mơ (Mặt trước) |
| `/images/products/pouch-mam-mo-2.jpg` | `800x800 px` | JPG / WebP | Ảnh chụp sản phẩm Pouch Mầm Mơ (Mặt nghiêng/bên trong) |
| `/images/products/kep-toc-1.jpg` | `800x800 px` | JPG / WebP | Ảnh sản phẩm Kẹp tóc Nút Áo Mầm |
| `/images/products/tote-gieo-mo-1.jpg` | `800x800 px` | JPG / WebP | Ảnh sản phẩm Túi Tote Canvas Gieo Mơ |
| `/images/products/bo-kim-chi-1.jpg` | `800x800 px` | JPG / WebP | Ảnh sản phẩm Bộ Kim Chỉ Mini |
| `/images/products/sticker-pack-1.jpg` | `800x800 px` | JPG / WebP | Ảnh bộ Sticker Pack Mầm Mơ |
| `/images/products/combo-starter.jpg` | `800x800 px` | JPG / WebP | Ảnh đại diện Set Combo Starter Kit |
| `/images/sponsors/sponsor-1.png` | `400x200 px` | PNG (Nền trong) | Logo Nhà tài trợ / Đối tác đồng hành |
| `/images/hero-mam-illustration.png` | `1200x800 px` | PNG | Key Visual nhân vật **Mầm** kẹp tóc nút áo chui ra từ pouch |

> 💡 **Mẹo tối ưu**: Nên chuyển đổi ảnh sang định dạng `.webp` và dung lượng `< 200KB` cho mỗi ảnh để trang web tải nhanh hơn.

---

## 📁 PHẦN 5: QUY ĐỊNH VỀ THƯ MỤC CẦN BỎ / BỎ QUA (GITIGNORE)

Các thư mục dưới đây **TUYỆT ĐỐI KHÔNG COMMIT** hoặc đẩy lên Git repo (Đã được cấu hình tự động trong `.gitignore`):

1. **`node_modules/`**: Thư mục chứa các thư viện cài đặt. Vercel sẽ tự động tải khi build.
2. **`.next/`**: Thư mục chứa file build tạm thời của Next.js.
3. **`.env.local`**: File chứa các chìa khóa bảo mật bí mật (Secret keys).
4. **`*.tsbuildinfo`**: File bộ nhớ đệm biên dịch TypeScript.
