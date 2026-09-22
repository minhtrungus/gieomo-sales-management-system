# 🌿 Gieo Mơ — Hệ Thống Bán Hàng Gây Quỹ Mầm Mơ

> **Slogan**: *"Little Pieces, Bigger Dreams"* — Những mảnh ghép nhỏ, một giấc mơ lớn.  
> **Concept**: *"Mầm khám phá thế giới may vá"*  
> **Tech Stack**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + Zustand + Zod + Supabase + Vercel  

---

## 📚 TÀI LIỆU HƯỚNG DẪN DỰ ÁN (PROJECT DOCUMENTATION)

Để quản trị, vận hành và triển khai hệ thống Gieo Mơ, vui lòng tham khảo các tài liệu chi tiết sau:

1. 📖 [**SETUP_AND_DEPLOYMENT_GUIDE.md**](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/SETUP_AND_DEPLOYMENT_GUIDE.md)  
   - Hướng dẫn cài đặt local môi trường Next.js.  
   - Hướng dẫn kết nối Database Supabase (SQL Script, API Keys, Buckets).  
   - Hướng dẫn Đưa web lên Vercel.  
   - **Danh sách file Hình ảnh (Assets) cần chuẩn bị & Thư mục bỏ qua (Gitignore)**.

2. 🛠️ [**MAINTENANCE_GUIDE.md**](file:///c:/Users/MT/Workspaces/gieomo-sales-management-system/MAINTENANCE_GUIDE.md)  
   - Hướng dẫn bảo trì & Giải thích chi tiết cấu trúc toàn bộ Folder/File trong dự án.  
   - Quy trình cập nhật sản phẩm, tạo voucher, duyệt VietQR, kiểm kho.  
   - Nguyên tắc bảo mật dữ liệu (Server-side price calculation, Stock atomic update).

---

## 🚀 QUY TRÌNH KHỞI CHẠY LẠI DỰ ÁN (QUICK START)

```bash
# Cài đặt dependencies
npm install

# Tạo file môi trường
cp .env.example .env.local

# Khởi chạy dev server
npm run dev

# Kiểm tra type-check và build thử
npm run build
```

---

## 🎨 TÍNH NĂNG CHÍNH

### 🛍️ Public Storefront dành cho Khách hàng:
- **Trang chủ (`/`)**: Banner chiến dịch, Sản phẩm nổi bật, Câu chuyện tác động xã hội, Set Combo, Khách hàng nói gì, FAQ, Footer.
- **Trang Sản phẩm (`/products`)**: Bộ lọc danh mục, tìm kiếm từ khóa, sắp xếp giá, hiển thị sản phẩm chuẩn responsive.
- **Chi tiết Sản phẩm (`/products/[slug]`)**: Bộ sưu tập ảnh, chọn phân loại (Màu sắc/Kích thước), tăng giảm số lượng, thêm giỏ / mua ngay.
- **Giỏ hàng (`/cart`)**: Tính tổng tiền, áp mã giảm giá (`GIEOMO10`, `WELCOME20K`), tính phí ship (Miễn phí từ 200k).
- **Thanh toán (`/checkout`)**: Điền thông tin giao tận nơi / nhận tại điểm, thanh toán **VietQR** tự động.
- **Xác nhận đơn (`/order/success`)**: Mã đơn `GM-XXXXXX`, tạo mã QR ngân hàng tự động điền nội dung.
- **Tra cứu đơn (`/track`)**: Thanh tiến trình 5 bước vận chuyển trực quan.

### 🛡️ Admin Portal dành cho Ban Tổ Chức (`/admin`):
- **Dashboard (`/admin/dashboard`)**: Tổng doanh số, đơn mới, duyệt tiền thực thu, cảnh báo kho sắp hết.
- **Nhập đơn hộ (`/admin/orders/create`)**: Form nhập đơn riêng dành cho BTC hỗ trợ khách qua Fanpage.
- **Quản lý Sản phẩm & Kho (`/admin/products`, `/admin/inventory`)**: Cập nhật giá vốn, tồn kho theo SKU.
- **Báo cáo Lợi nhuận (`/admin/reports`)**: Thống kê doanh thu, chi phí và lợi nhuận dòng đóng góp dự án Mầm Mơ.
