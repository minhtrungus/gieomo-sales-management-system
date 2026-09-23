# GIẢI PHÁP QUẢN LÝ 2 KHO HÀNG (MULTI-WAREHOUSE ARCHITECTURE & ADVISORY)

> **Dự án**: Website bán hàng gây quỹ Gieo Mơ — Mầm Mơ  
> **Chủ đề**: Tư vấn & Đề xuất phương án vận hành khi hàng nằm ở 2 kho khác nhau  

---

## 1. Bản chất vấn đề khi có 2 kho hàng

Trong các chiến dịch bán hàng gây quỹ của câu lạc bộ tình nguyện, việc tồn tại **2 kho hàng** thường xuất hiện trong 2 ngữ cảnh thực tế:

| Tình huống thực tế | Mô tả đặc điểm | Thách thức chính |
|---|---|---|
| **Tình huống 1: Kho Địa lý** | Ví dụ: Kho Trung tâm (Quận 3/Quận 10) và Kho Điểm trường / Xưởng sản xuất (Thủ Đức / Bình Dương). | Nếu khách đặt 1 đơn gồm 2 món ở 2 kho khác nhau ➔ Phải gom hàng hoặc ship 2 chuyến ➔ Tốn chi phí vận chuyển. |
| **Tình huống 2: Kho Kênh bán** | Ví dụ: Kho Online (dành cho đơn giao bưu điện) và Kho Offline (dành cho bàn trực tại điểm hẹn). | Cần phân bổ hạn ngạch (quota) để tránh tình trạng khách online đặt hết hàng mà bàn trực lại không có sẵn. |

---

## 2. Có bị khó không? Đánh giá độ phức tạp kỹ thuật & vận hành

- **Về mặt Kỹ thuật (Code/Database)**: **Không khó**. Chỉ cần bổ sung bảng `warehouses` hoặc trường định danh kho trên sản phẩm/biến thể.
- **Về mặt Vận hành (Hậu cần / Thành viên)**: **Dễ nhầm lẫn** nếu quy trình phức tạp. Vì đội ngũ dự án là các bạn tình nguyện viên, quy trình càng nhiều bước thì tỷ lệ đóng nhầm hàng, giao trễ càng cao.

---

## 3. Ba phương án kiến trúc & Lời khuyên cho Mầm Mơ

### ⭐ Phương án A: Gắn nhãn kho xuất trên sản phẩm (Khuyên dùng — Đơn giản & Hiệu quả nhất)

- **Cách hoạt động**:
  - Mỗi sản phẩm hoặc set quà được quy định trước là do Kho nào chịu trách nhiệm lưu trữ và xuất hàng.
  - Ví dụ:
    - *Túi Canvas, Pouch vải, Set Combo*: Kho A (Trụ sở Mầm Mơ).
    - *Kẹp tóc, Bookmark len, Phụ kiện thủ công*: Kho B (Cơ sở xưởng / KTX).
  - Trên màn hình chi tiết đơn hàng của Admin, hệ thống hiển thị rõ nhãn: `[Xuất từ: Kho A]` hoặc `[Xuất từ: Kho B]`.
- **Ưu điểm**:
  - Không làm phức tạp luồng thanh toán của khách hàng.
  - Thành viên phụ trách kho nào chỉ cần lọc danh sách đơn của kho đó để gom hàng.
  - Không cần sửa cấu trúc cơ sở dữ liệu lớn.

---

### Phương án B: Phân bổ Kho theo Điểm nhận hàng (Địa bàn)

- **Cách hoạt động**:
  - Khi khách chọn **Nhận tại điểm tập kết**:
    - Nếu khách chọn *Điểm ĐH Kinh Tế (Quận 10)* hoặc *Trụ sở Quận 3* ➔ Điều phối từ **Kho Trung tâm**.
    - Nếu khách chọn *Điểm KTX ĐHQG (Thủ Đức)* ➔ Điều phối từ **Kho Thủ Đức**.
  - Trước mỗi tuần chiến dịch, Ban Hậu cần chuyển trước một lượng hàng dự phòng (buffer stock) về từng kho điểm nhận.
- **Ưu điểm**:
  - Tiết kiệm 100% phí ship lẻ tẻ.
  - Khách đến điểm nhận là có hàng ngay mà không cần chờ vận chuyển từ kho chính sang.

---

### Phương án C: Quản trị tồn kho đa kho hoàn chỉnh (WMS Đa kho)

- **Mô hình Database**:
  ```sql
  -- Bảng danh sách các kho hàng
  CREATE TABLE warehouses (
    warehouse_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,      -- VD: 'KHO_Q3', 'KHO_THU_DUC'
    name TEXT NOT NULL,             -- Tên kho
    address TEXT,                   -- Địa chỉ kho
    manager_member_id UUID REFERENCES members(member_id)
  );

  -- Bảng tồn kho của từng biến thể tại từng kho
  CREATE TABLE warehouse_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES warehouses(warehouse_id),
    variant_id UUID REFERENCES product_variants(variant_id),
    stock_quantity INT NOT NULL DEFAULT 0,
    UNIQUE(warehouse_id, variant_id)
  );
  ```
- **Khi nào nên dùng?**:
  - Khi quy mô đơn hàng vượt quá 1.000 đơn/chiến dịch.
  - Khi có quản lý kho chuyên trách kiểm kê xuất nhập tồn hàng ngày bằng mã vạch.

---

## 4. Lộ trình triển khai khuyến nghị cho Ban Tổ Chức

1. **Giai đoạn Hiện tại (Chiến dịch Gieo Mơ 2026)**:
   - Áp dụng **Phương án A & B**: Dùng chung tổng kho, gắn nhãn vị trí tập kết và điều phối hàng trước về các **Điểm nhận hàng (Pickup Points)** đã được cấu hình trong trang Admin.
   - Các đơn giao tận nơi (Home Delivery) được đóng gói và gửi tập trung từ 1 kho chính để tối ưu chi phí thu gom bưu tá của Viettel Post / GHTK.
2. **Giai đoạn Mở rộng**:
   - Khi chiến dịch triển khai đồng thời tại 2 thành phố (Hà Nội & TP.HCM), kích hoạt mô hình Đa kho hoàn chỉnh (Phương án C) để hệ thống tự động định tuyến đơn hàng về kho gần khách nhất.
