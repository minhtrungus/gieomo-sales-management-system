# GIEO MƠ — HƯỚNG DẪN BẢO TRÌ & CẤU TRÚC DỰ ÁN (MAINTENANCE GUIDE)

> **Dự án**: Website bán hàng gây quỹ Gieo Mơ — Mầm Mơ  
> **Tech Stack**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + Supabase  
> **Cập nhật gần nhất**: September 2026  

---

## 📂 1. CẤU TRÚC THƯ MỤC CHI TIẾT (FOLDER ARCHITECTURE)

```
gieomo-sales-management-system/
├── public/                      # Chứa tài nguyên tĩnh (Hình ảnh, Icons, Banner)
│   ├── favicon.ico
│   └── images/
│       ├── products/            # Ảnh sản phẩm (Pouch, Tote, Kẹp tóc...)
│       ├── sponsors/            # Logo nhà tài trợ
│       └── banners/             # Ảnh nền Hero, Campaign
│
├── src/                         # Toàn bộ mã nguồn chính của ứng dụng
│   ├── app/                     # Next.js 15 App Router (Routes & Pages)
│   │   ├── layout.tsx           # Root layout (Metadata, Google Fonts, Global CSS)
│   │   ├── page.tsx             # Trang chủ (Homepage / Landing page gây quỹ)
│   │   ├── globals.css          # CSS thiết kế hệ thống (Mầm Mơ design tokens)
│   │   │
│   │   ├── (Storefront)/        # Luồng khách hàng công khai
│   │   │   ├── products/        # Danh mục sản phẩm (/products)
│   │   │   │   └── [slug]/      # Trang chi tiết sản phẩm (/products/[slug])
│   │   │   ├── combos/          # Trang các Set Combo tiết kiệm (/combos)
│   │   │   ├── cart/            # Trang Giỏ hàng (/cart)
│   │   │   ├── checkout/        # Trang Thanh toán (/checkout)
│   │   │   ├── order/
│   │   │   │   └── success/     # Trang Đặt hàng thành công & VietQR (/order/success)
│   │   │   ├── track/           # Trang Tra cứu tiến độ đơn hàng (/track)
│   │   │   └── faq/             # Trang Hỏi đáp thường gặp (/faq)
│   │   │
│   │   └── admin/               # Luồng Quản trị Ban tổ chức (Admin CMS)
│   │       ├── layout.tsx       # Admin layout (Sidebar + Navigation header)
│   │       ├── login/           # Trang Đăng nhập Quản trị (/admin/login)
│   │       ├── dashboard/       # Trang Tổng quan Doanh số & Đơn hàng (/admin/dashboard)
│   │       ├── orders/          # Trang Quản lý danh sách đơn hàng (/admin/orders)
│   │       │   ├── [id]/        # Trang Chi tiết & Đổi trạng thái đơn hàng (/admin/orders/[id])
│   │       │   └── create/      # Trang Nhập đơn hộ cho khách (/admin/orders/create)
│   │       ├── products/        # Trang Quản lý Sản phẩm (/admin/products)
│   │       │   └── new/         # Trang Thêm sản phẩm mới (/admin/products/new)
│   │       ├── combos/          # Trang Quản lý Set Combo (/admin/combos)
│   │       ├── inventory/       # Trang Kiểm kho & Cảnh báo tồn kho (/admin/inventory)
│   │       ├── customers/       # Trang Quản lý thông tin Khách hàng (/admin/customers)
│   │       ├── payments/        # Trang Duyệt thanh toán VietQR (/admin/payments)
│   │       ├── vouchers/        # Trang Quản lý Mã giảm giá (/admin/vouchers)
│   │       ├── members/         # Trang Quản lý Thành viên & Referral (/admin/members)
│   │       ├── reports/         # Trang Báo cáo doanh thu & Lợi nhuận (/admin/reports)
│   │       └── settings/        # Trang Cài đặt thông tin hệ thống (/admin/settings)
│   │
│   ├── components/              # Thư viện React Components tái sử dụng
│   │   ├── ui/                  # Design System UI Elements
│   │   │   ├── Button.tsx       # Nút bấm chuẩn brand (primary, outline, loading)
│   │   │   ├── Input.tsx        # Ô nhập liệu có validation & error state
│   │   │   ├── Select.tsx       # Ô chọn dropdown
│   │   │   ├── Badge.tsx        # Thẻ trạng thái (Status, Product tag)
│   │   │   ├── Card.tsx         # Khung nội dung
│   │   │   ├── Drawer.tsx       # Khung trượt (Slide-over panel)
│   │   │   ├── Modal.tsx        # Hộp thoại popup / Confirm dialog
│   │   │   ├── Toast.tsx        # Thông báo ngắn tự ẩn
│   │   │   ├── States.tsx       # Trạng thái EmptyState, LoadingState, ErrorState
│   │   │   ├── MoneyDisplay.tsx # Định dạng hiển thị tiền VNĐ chuẩn (e.g. 85.000đ)
│   │   │   └── index.ts         # Central export point
│   │   │
│   │   ├── layout/              # Components khung giao diện
│   │   │   ├── Navbar.tsx       # Thanh điều hướng đầu trang công khai
│   │   │   └── Footer.tsx       # Chân trang công khai
│   │   │
│   │   ├── cart/                # Components liên quan Giỏ hàng
│   │   │   └── CartDrawer.tsx   # Mini giỏ hàng trượt xem nhanh
│   │   │
│   │   ├── products/            # Components liên quan Sản phẩm
│   │   │   └── ProductCard.tsx  # Thẻ xem nhanh sản phẩm
│   │   │
│   │   └── admin/               # Components riêng cho luồng Admin
│   │       ├── AdminSidebar.tsx # Thanh menu điều hướng admin
│   │       └── AdminHeader.tsx  # Header quản trị & nút chuyển đổi nhanh
│   │
│   ├── lib/                     # Utilities & Logic chung
│   │   ├── constants.ts         # Hằng số hệ thống, nhãn trạng thái (Vietnamese labels)
│   │   ├── utils.ts             # Hàm format tiền tệ, gom class Tailwind (cn helper)
│   │   ├── validations/
│   │   │   └── schemas.ts       # Zod schemas kiểm tra dữ liệu form (Checkout, Product, Order)
│   │   ├── data/
│   │   │   └── mockData.ts      # Dữ liệu mẫu (Sản phẩm, Combo, Vouchers, Đơn hàng)
│   │   └── supabase/            # Client Supabase kết nối Database
│   │       ├── client.ts        # Client-side Supabase instance
│   │       ├── server.ts        # Server-side Supabase instance
│   │       └── admin.ts         # Service role Supabase instance (Bảo mật cao)
│   │
│   ├── store/                   # Quản lý State toàn cục (State Management)
│   │   └── cart.ts              # Zustand store lưu giỏ hàng (Persist vào LocalStorage)
│   │
│   └── types/                   # Khai báo TypeScript Types
│       └── database.ts          # Định nghĩa kiểu dữ liệu khớp 100% với PostgreSQL schema
│
├── supabase/                    # Cấu hình & Script Database PostgreSQL
│   ├── migrations/
│   │   └── 001_initial_schema.sql # Tạo toàn bộ bảng, Enums, Index, RLS Policies
│   └── seed.sql                 # Script nạp dữ liệu mẫu ban đầu
│
├── .env.example                 # File mẫu cấu hình biến môi trường
├── next.config.ts               # Cấu hình Next.js (Turbopack, Image domains)
├── package.json                 # Khai báo dependencies
└── tsconfig.json                # Cấu hình TypeScript compiler
```

---

## 🛠️ 2. QUY TRÌNH BẢO TRÌ NỘI DUNG & SẢN PHẨM

### A. Thêm hoặc cập nhật Sản phẩm mới
1. Váo mục **Admin ➔ Sản phẩm ➔ Thêm sản phẩm mới** (`/admin/products/new`).
2. Nhập thông tin: Tên sản phẩm, Slug (tự động tạo), Giá bán, Giá so sánh, Giá vốn (để hệ thống tính lợi nhuận gây quỹ).
3. Thêm các **Phân loại (Variants)**: Tên phân loại (VD: Màu hồng, Màu xanh), Mã SKU, Số lượng tồn kho.
4. Chọn danh mục và bật trạng thái **"Đang bán (Active)"**.

### B. Thêm hoặc quản lý Mã giảm giá (Vouchers)
1. Vào mục **Admin ➔ Mã giảm giá** (`/admin/vouchers`).
2. Định nghĩa Mã (Code - e.g. `GIEOMO10`), Loại giảm (Phần trăm `%` hoặc Số tiền cố định `đ`), Giá trị đơn hàng tối thiểu áp dụng.

### C. Quản lý Đơn hàng & Xác nhận Thanh toán VietQR
1. Khi khách hàng chuyển khoản ngân hàng qua mã VietQR, giao dịch sẽ được ghi nhận tại mục **Admin ➔ Duyệt thanh toán** (`/admin/payments`).
2. Ban tổ chức kiểm tra ứng dụng Ngân hàng, nhấn nút **"Duyệt"** để cập nhật trạng thái đơn hàng sang `Đã thanh toán (paid)`.
3. Cập nhật tiến độ giao hàng tại mục **Admin ➔ Quản lý đơn hàng** (`/admin/orders`) theo các nấc:
   - `Chờ xác nhận` ➔ `Đã xác nhận` ➔ `Đang chuẩn bị` ➔ `Đang giao` ➔ `Hoàn thành`.

---

## 🔒 3. NGUYÊN TẮC BẢO TRÌ AN TOÀN (PRODUCTION SAFETY RULES)

1. **Không trust dữ liệu từ Frontend**: Giá sản phẩm, số tiền tổng, mã giảm giá và phí ship luôn được tính toán lại phía Server-side để tránh tấn công sửa đổi giá từ client.
2. **Stock không bao giờ được âm**: Mọi thao tác trừ kho khi khách đặt hàng phải đảm bảo tính Atomic (Nguyên tố) trong Postgres SQL.
3. **Bảo vệ Secrets Key**: Không bao giờ commit file `.env.local` chứa `SUPABASE_SERVICE_ROLE_KEY` lên Git repository công khai.
