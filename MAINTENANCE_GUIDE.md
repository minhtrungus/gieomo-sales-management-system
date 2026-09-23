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
│   │       ├── pickup-points/   # Trang Quản lý Điểm nhận hàng (/admin/pickup-points)
│   │       ├── messages/        # Hộp thư tin nhắn liên hệ từ khách (/admin/messages)
│   │       ├── vouchers/        # Trang Quản lý Mã giảm giá (/admin/vouchers)
│   │       ├── members/         # Trang Quản lý Thành viên & Referral (/admin/members)
│   │       ├── reports/         # Trang Báo cáo doanh thu & Lợi nhuận (/admin/reports)
│   │       └── settings/        # Trang Cài đặt thông tin hệ thống & Đổi mật khẩu (/admin/settings)
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

### A. Thêm hoặc cập nhật Sản phẩm & Tách mô tả tự động (Auto-Parse)
1. Vào mục **Admin ➔ Sản phẩm ➔ Thêm sản phẩm mới** (`/admin/products/new`).
2. Nhập thông tin: Tên sản phẩm, Slug (tự động tạo), Giá bán, Giá vốn (để hệ thống tính lợi nhuận gây quỹ).
3. **Mẹo viết mô tả tự tách nội dung**: Bạn có thể viết mô tả có các đề mục `## Kích thước`, `## Chất liệu`, `## Ý nghĩa`, hệ thống website sẽ tự động tách thành các Tab đẹp mắt cho khách hàng trên trang chi tiết sản phẩm.

### B. Thêm hoặc quản lý Mã giảm giá (Vouchers) Công khai & Riêng tư
1. Vào mục **Admin ➔ Mã giảm giá** (`/admin/vouchers`).
2. Thiết lập chế độ hiển thị:
   - **Công khai**: Hiện nút gợi ý trên trang thanh toán cho khách chọn nhanh.
   - **Riêng tư**: Chỉ khách hàng có mã và nhập chính xác mới được áp dụng.

### C. Quản lý Điểm nhận hàng (Pickup Points)
1. Vào mục **Admin ➔ Điểm nhận hàng** (`/admin/pickup-points`).
2. Thêm hoặc cập nhật: Tên điểm nhận, Địa chỉ, Thành viên trực điểm, SĐT Hotline và Hướng dẫn vị trí bàn trực (VD: *Bàn trực sảnh B1 đối diện thang máy, gọi hotline trước 5 phút*).
3. Khách hàng khi chọn hình thức "Nhận tại điểm tập kết" sẽ thấy chi tiết thông tin này.

### D. Quản lý Tin nhắn liên hệ từ khách
1. Khách gửi liên hệ từ trang `/contact` sẽ đổ về **Admin ➔ Hộp thư liên hệ** (`/admin/messages`).
2. Quản trị viên có thể xem nội dung, SĐT khẩn, bấm gọi điện hoặc bấm "Soạn email trả lời".

### E. Tự động duyệt Thanh toán VietQR qua SePay Webhook
1. Đọc hướng dẫn chi tiết tại [docs/SEPAY_WEBHOOK_GUIDE.md](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/docs/SEPAY_WEBHOOK_GUIDE.md).
2. Khi khách chuyển khoản đúng cú pháp `GM-XXXXXX`, SePay sẽ gọi Webhook về `/api/webhook/sepay` và tự động cập nhật đơn sang `Đã thanh toán (paid)` mà không cần duyệt thủ công.

### F. Kết nối gửi Email thông báo qua Resend
1. Đọc hướng dẫn chi tiết tại [docs/RESEND_EMAIL_GUIDE.md](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/docs/RESEND_EMAIL_GUIDE.md).
2. Khi khách gửi liên hệ từ `/contact`, hệ thống tự động bắn email thông báo cho Ban Quản Trị qua dịch vụ Resend.

---

## 📚 TÀI LIỆU CHUYÊN SÂU ĐÍNH KÈM
* **Tích hợp SePay Webhook**: [`docs/SEPAY_WEBHOOK_GUIDE.md`](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/docs/SEPAY_WEBHOOK_GUIDE.md)
* **Kết nối Resend Email**: [`docs/RESEND_EMAIL_GUIDE.md`](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/docs/RESEND_EMAIL_GUIDE.md)
* **Cẩm nang Quản trị & Điều phối 2 Kho**: [`docs/MULTI_WAREHOUSE_GUIDE.md`](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/docs/MULTI_WAREHOUSE_GUIDE.md)

---

## 🔒 3. NGUYÊN TẮC BẢO MẬT & AN TOÀN VẬN HÀNH

1. **Bảo mật tra cứu đơn hàng**: Trang `/track` chỉ cho phép tra cứu bằng **Mã đơn hàng chính xác (GM-...)** hoặc xem lịch sử trên chính thiết bị đó. Đã loại bỏ hoàn toàn tính năng tìm kiếm bằng tên hoặc SĐT để tránh lộ thông tin đơn hàng cho người khác.
2. **Che số điện thoại (Phone Masking)**: Khi hiển thị thông tin tra cứu đơn, số điện thoại được che 3 số ở giữa (VD: `0901***567`) nhằm bảo vệ tối đa dữ liệu cá nhân.
3. **Ghi chú nội bộ tách biệt**: `internal_note` của đơn hàng chỉ hiển thị trong trang Admin cho Ban Tổ Chức điều phối, không bao giờ gửi ra trang tra cứu công khai của khách.
4. **Không trust dữ liệu từ Frontend**: Giá sản phẩm, số tiền tổng, mã giảm giá và phí ship luôn được tính toán lại phía Server-side.
5. **Stock không bao giờ được âm**: Mọi thao tác trừ kho khi khách đặt hàng phải đảm bảo tính Atomic trong Postgres SQL.
6. **Bảo vệ Secrets Key**: Không bao giờ commit file `.env.local` chứa `SUPABASE_SERVICE_ROLE_KEY` hoặc `SEPAY_API_KEY` lên Git repository công khai.
