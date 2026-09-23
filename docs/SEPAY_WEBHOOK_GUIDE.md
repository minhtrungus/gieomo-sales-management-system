# HƯỚNG DẪN TÍCH HỢP TỰ ĐỘNG DUYỆT THANH TOÁN QUA SEPAY WEBHOOK

> **Dự án**: Website bán hàng gây quỹ Gieo Mơ — Mầm Mơ  
> **Giải pháp**: Tích hợp cổng bắt biến động số dư ngân hàng SePay (my.sepay.vn)  
> **Endpoint nhận Webhook**: `POST /api/webhook/sepay`  

---

## 1. Cơ chế hoạt động tự động (Workflow)

```
[Khách đặt hàng trên Website] 
       ↓ (Tạo đơn hàng GM-369817)
[Khách quét VietQR thanh toán trên điện thoại]
       ↓ (Chuyển khoản thành công vào STK MBBank của Mầm Mơ)
[SePay phát hiện biến động số dư]
       ↓ (Gọi HTTP POST kèm thông tin giao dịch)
[Webhook Endpoint: /api/webhook/sepay]
       ↓ (Trích xuất mã đơn "GM-369817" từ nội dung chuyển khoản)
[Hệ thống tự động chuyển Trạng thái Đơn hàng]
       ├── payment_status: "pending" ➔ "paid" (Đã thanh toán)
       └── order_status: "pending" ➔ "confirmed" (Đã xác nhận)
```

---

## 2. Hướng dẫn từng bước cấu hình trên SePay (Step-by-Step)

### Bước 1: Đăng ký & Kết nối tài khoản Ngân hàng
1. Truy cập [https://my.sepay.vn](https://my.sepay.vn) và đăng ký tài khoản.
2. Tại thanh menu bên trái, chọn **Tài khoản ngân hàng** ➔ **Thêm tài khoản**.
3. Chọn ngân hàng của Ban Tổ Chức (VD: MBBank, Vietcombank, TPBank...).
4. Đăng nhập ứng dụng ngân hàng theo hướng dẫn bảo mật của SePay để cấp quyền nhận biến động số dư.

### Bước 2: Cấu hình Webhook Endpoint
1. Trong trang quản trị SePay, vào mục **Tích hợp Webhook** ➔ **Tạo Webhook mới**.
2. Điền thông tin cấu hình:
   - **Tên Webhook**: `Website Gieo Mơ - Tự động duyệt đơn`
   - **URL nhận Webhook**: `https://your-domain.vercel.app/api/webhook/sepay` *(Thay bằng tên miền thật của website trên Vercel)*
   - **Kiểu dữ liệu**: `JSON`
   - **Phương thức**: `POST`
   - **Sự kiện kích hoạt**: `Tiền vào (amountIn > 0)`
3. Nhấn **Lưu cấu hình**.

### Bước 3: Lấy API Key và lưu vào biến môi trường
1. Tại SePay, vào mục **Cài đặt API** để sao chép chuỗi **API Key** (Token bí mật).
2. Mở file `.env.local` trong source code dự án (hoặc cấu hình tại Vercel Environment Variables):
   ```env
   # SePay Webhook Secret API Key
   SEPAY_API_KEY=sepay_live_xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. Khởi động lại server hoặc Redeploy Vercel để biến môi trường có hiệu lực.

---

## 3. Cấu trúc dữ liệu SePay gửi về Webhook

Khi có khách chuyển khoản, SePay sẽ gửi một payload JSON có định dạng như sau đến `/api/webhook/sepay`:

```json
{
  "id": 1234567,
  "gateway": "MBBank",
  "transactionDate": "2026-09-23 15:30:00",
  "accountNumber": "03456789999",
  "subAccount": null,
  "amountIn": 110000,
  "amountOut": 0,
  "accumulated": 5420000,
  "code": null,
  "transactionContent": "GM-369817 ung ho du an mam mo",
  "referenceNumber": "FT262669817",
  "body": "Nội dung tin nhắn SMS / biến động App"
}
```

### Cách hệ thống xử lý:
1. Xác thực header `Authorization: Apikey <SEPAY_API_KEY>`.
2. Trích xuất mã đơn hàng từ `transactionContent` bằng biểu thức chính quy Regex: `GM-[0-9]{4,8}`.
3. Tìm kiếm đơn hàng trong cơ sở dữ liệu Supabase:
   - Cập nhật `payment_status` thành `paid`.
   - Nếu đơn đang ở trạng thái `pending`, tự động đẩy lên `confirmed`.
   - Lưu vết lịch sử `internal_note` kèm mã giao dịch ngân hàng.
4. Trả về `200 OK` cho SePay xác nhận đã xử lý hoàn tất.

---

## 4. Hướng dẫn Test thử Webhook (Sandbox Test)

Để kiểm tra xem Webhook có hoạt động không trước khi chạy chiến dịch thực tế:

### Cách 1: Sử dụng công cụ Test của SePay
1. Trong SePay Dashboard ➔ Webhook ➔ Nhấn nút **Gửi thử nghiệm (Test)**.
2. Chọn mẫu dữ liệu **Tiền vào**, điền nội dung giao dịch là một mã đơn hàng mẫu trên web (VD: `GM-369817`).
3. Nhấn **Gửi Webhook**.
4. Kiểm tra lịch sử gửi nhận trên SePay: Nếu trả về mã **HTTP 200** kèm phản hồi `{"success": true, ...}` là thành công!

### Cách 2: Sử dụng cURL từ máy tính
Chạy lệnh terminal sau để giả lập giao dịch chuyển khoản:

```bash
curl -X POST http://localhost:3000/api/webhook/sepay \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey your_sepay_api_key" \
  -d '{
    "id": 999999,
    "gateway": "MBBank",
    "amountIn": 110000,
    "transactionContent": "GM-369817 chuyen tien",
    "referenceNumber": "TEST12345"
  }'
```

---

## 5. Những câu hỏi thường gặp (FAQ)

**Q: Nếu khách quên ghi mã đơn hàng trong nội dung chuyển khoản thì sao?**  
*A*: Trên trang thanh toán và trang thành công, website đã tạo sẵn **Mã QR VietQR chuẩn NAPAS**. Khi khách dùng app ngân hàng quét mã QR, app sẽ tự động điền sẵn chính xác số tiền và cú pháp `GM-XXXXXX`. Trường hợp khách tự gõ tay và quên ghi mã đơn, quản trị viên vẫn có thể vào mục **Admin ➔ Xác nhận thanh toán** để bấm duyệt thủ công bằng tay với 1 chạm.

**Q: SePay có hỗ trợ tài khoản ngân hàng cá nhân không?**  
*A*: Có, SePay hỗ trợ cả tài khoản cá nhân lẫn tài khoản tổ chức/câu lạc bộ của hầu hết các ngân hàng phổ biến tại Việt Nam (MBBank, Vietcombank, TPBank, VPBank, ACB, Techcombank...).
