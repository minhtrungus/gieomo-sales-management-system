# 🛠️ GIEO MƠ — HƯỚNG DẪN DÀNH CHO THÀNH VIÊN & QUẢN TRỊ VIÊN (ADMIN)

Tài liệu này hướng dẫn chi tiết quy trình vận hành, quản lý bán hàng, kiểm soát kho và cấu hình nhận diện thương hiệu cho **Thành viên Mầm Mơ** và **Quản trị viên (Admin)** trên hệ thống **Gieo Mơ**.

---

## 🔐 1. ĐĂNG NHẬP & PHÂN QUYỀN HỆ THỐNG

### Đăng nhập Portal (`/admin/login`)
1. Truy cập đường dẫn: `/admin/login` (hoặc bấm nút "Quản trị" dưới chân trang).
2. Nhập Email và Mật khẩu được cấp bởi Ban Tổ Chức (BTC Mầm Mơ).
3. **Phân quyền hệ thống**:
   - **Admin (Ban Quản Trị)**: Toàn quyền truy cập Dashboard, Doanh thu, Cài đặt hệ thống, Quản lý kho, Phê duyệt thanh toán.
   - **Member / Seller (Thành viên Gây quỹ)**: Theo dõi doanh số cá nhân, mã giới thiệu (Referral Code), nhập đơn hộ cho khách hàng.

---

## 📊 2. TỔNG QUAN DASHBOARD (`/admin/dashboard`)

Trang Dashboard giúp BTC nắm bắt nhanh chỉ số vận hành real-time:
- **Doanh thu tổng**: Tổng số tiền gây quỹ thu được.
- **Tổng số đơn hàng**: Đếm số đơn theo từng trạng thái (Mới, Đã thanh toán, Đã giao).
- **Cảnh báo tồn kho**: Danh sách sản phẩm sắp hết hàng (stock <= 10).
- **Bảng xếp hạng Referral**: Top các thành viên Mầm Mơ có doanh số giới thiệu xuất sắc nhất.
- **Phím tắt thao tác nhanh**: Tạo đơn mới, kiểm kho, xác nhận VietQR.

---

## 📦 3. QUẢN LÝ ĐƠN HÀNG & 3 TRẠNG THÁI ĐẮC THÙ (`/admin/orders`)

Hệ thống Gieo Mơ tách biệt rõ ràng 3 luồng trạng thái để đảm bảo tính chính xác và an toàn tài chính:

### 1. Trạng thái Đơn hàng (`order_status`)
- `pending`: Đơn mới tạo, chờ xử lý.
- `processing`: Đơn đã được xác nhận, đang đóng gói.
- `completed`: Đơn hoàn tất, giao thành công.
- `cancelled`: Đơn bị hủy (sẽ tự động hoàn trả số lượng vào kho - **Stock Restoration**).

### 2. Trạng thái Thanh toán (`payment_status`)
- `unpaid`: Chưa thanh toán.
- `paid`: Đã xác nhận khớp tiền (Qua VietQR auto-match hoặc Admin duyệt tay).
- `refunded`: Đã hoàn tiền cho khách.

### 3. Trạng thái Giao hàng (`delivery_status`)
- `pending`: Chưa giao cho đơn vị vận chuyển.
- `shipping`: Đã giao cho shipper/bưu tá.
- `delivered`: Shipper đã giao thành công cho khách.

---

## ✍️ 4. TÍNH NĂNG NHẬP ĐƠN HỘ (`/admin/orders/create`)

Dành cho Thành viên/BTC nhận đơn trực tiếp qua Fanpage, tin nhắn hoặc sự kiện offline:
1. Vào mục **Nhập đơn hộ** (`/admin/orders/create`).
2. Chọn Thành viên phụ trách (để ghi nhận chỉ số gây quỹ).
3. Nhập thông tin người nhận (Họ tên, SĐT, Địa chỉ).
4. Chọn sản phẩm, số lượng, mã giảm giá.
5. Chọn phương thức thanh toán & Đặt hàng. Hệ thống tự động khấu trừ kho ngay lập tức (**Atomic Stock Deduction**).

---

## 🏷️ 5. QUẢN LÝ SẢN PHẨM, SET COMBO & KHO HÀNG

### Quản lý Sản phẩm & Biến thể (`/admin/products`)
- Thêm mới (`/admin/products/new`) & Chỉnh sửa sản phẩm.
- Thiết lập giá bán, giá vốn (cost price) để tính toán lợi nhuận gây quỹ thực tế.
- Tùy chỉnh danh mục & tải ảnh sản phẩm.

### Quản lý Set Combo (`/admin/combos`)
- Ghép nhiều sản phẩm lẻ thành Set Combo quà tặng gây quỹ.
- Cấu hình giá ưu đãi cho Combo. Khi khách mua Combo, kho của các sản phẩm thành phần sẽ tự động được trừ tương ứng.

### Kiểm kê & Điều chỉnh kho (`/admin/inventory`)
- Theo dõi số lượng tồn kho từng SKU/Biến thể.
- Thực hiện **Nhập kho / Xuất kho / Kiểm kê** với ghi chú rõ ràng.
- Nguyên tắc cốt lõi: **Stock không bao giờ âm**, mọi thao tác kho đều được lưu lịch sử audit log.

---

## 💳 6. XÁC NHẬN THANH TOÁN & VOUCHER

### Phê duyệt VietQR & Ngân hàng (`/admin/payments`)
- Danh sách các giao dịch chuyển khoản VietQR.
- Khớp mã đơn hàng và số tiền thực nhận với Sao kê ngân hàng.
- Bấm nút **"Xác nhận thanh toán"** để cập nhật `payment_status = paid`.

### Quản lý Mã giảm giá (`/admin/vouchers`)
- Tạo mã voucher giảm giá cố định (VNĐ) hoặc giảm theo phần trăm (%).
- Cấu hình hạn mức áp dụng (Ví dụ: Giảm 20k cho đơn từ 150k).
- Theo dõi số lượt đã sử dụng.

---

## 🤝 7. THÀNH VIÊN & REFERRAL TRACKING (`/admin/members`)

- Quản lý danh sách thành viên Mầm Mơ tham gia chiến dịch gây quỹ.
- Mỗi thành viên sở hữu một **Mã giới thiệu (Referral Code)** duy nhất.
- Báo cáo chi tiết tổng số đơn hàng và tổng giá trị gây quỹ mà thành viên đóng góp.

---

## 🎨 8. CẤU HÌNH NHẬN DIỆN THƯƠNG HIỆU & HỆ THỐNG (`/admin/settings`)

Trong trang **Cài đặt hệ thống**, Quản trị viên có thể tùy chỉnh toàn bộ giao diện và bộ nhận diện thương hiệu:

1. **Bảng màu nhận diện (Palette Selector)**:
   - Thay đổi màu chủ đạo: **Soft Green (`#BFE9C3`)**, Powder Blue, Warm Orange, Butter Yellow, Soft Pink.
2. **Cover Đổi Màu (Dynamic Cover Color)**:
   - Tùy chọn tông màu Cover Header theo chiến dịch (Mùa thu pastel, Giáng sinh handmade, Gây quỹ trường học...).
3. **Favicon & Avatar Thương Hiệu (Favicon & Avt)**:
   - Tải lên / Cập nhật đường dẫn logo mầm cây Favicon (`favicon.ico`).
   - Cập nhật Avatar đại diện BTC Mầm Mơ hiển thị trên toàn hệ thống.
4. **Cấu hình Vận chuyển & VietQR**:
   - Cài đặt phí giao hàng cố định (mặc định 25.000đ) & hạn mức miễn phí vận chuyển (mặc định 200.000đ).
   - Số tài khoản ngân hàng & Tên chủ tài khoản nhận VietQR.

---

*Hệ thống Gieo Mơ — Đơn giản, An toàn, Ấm áp & Hiệu quả! 🌾*
