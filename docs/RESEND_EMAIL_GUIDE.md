# HƯỚNG DẪN KẾT NỐI VÀ CẤU HÌNH GỬI EMAIL QUA RESEND

> **Dự án**: Website bán hàng gây quỹ Gieo Mơ — Mầm Mơ  
> **Giải pháp**: Tích hợp dịch vụ email chuyên nghiệp Resend ([resend.com](https://resend.com))  
> **Mục đích**: 
> 1. Tự động chuyển tiếp tin nhắn khách hàng từ form `/contact` về hòm thư Ban Quản Trị.  
> 2. Gửi thông báo đơn hàng mới / xác nhận thanh toán (Tùy chọn mở rộng).

---

## 1. Giới thiệu & Tại sao chọn Resend?

* **Gói Free hào phóng**: Hỗ trợ gửi **3.000 emails/tháng** (tối đa **100 emails/ngày**) — hoàn toàn miễn phí và đủ đáp ứng nhu cầu các chiến dịch gây quỹ của Mầm Mơ.
* **Tối ưu cho Next.js & Vercel**: Khởi tạo bằng API REST tiêu chuẩn hoặc SDK chính thức `@resend/node`, không bị chặn cổng SMTP như các giải pháp gửi mail truyền thống.
* **Tỷ lệ vào Inbox cao**: Hỗ trợ xác thực tên miền đầy đủ qua DKIM, SPF, DMARC.
* **Dashboard trực quan**: Dễ dàng theo dõi lịch sử gửi, trạng thái email (Delivered, Bounced, Opened).

---

## 2. Quy trình gửi thông báo qua Resend (Workflow)

```
[Khách gửi tin nhắn tại trang /contact]
       ↓ (Điền họ tên, email, SĐT, nội dung)
[API Endpoint: POST /api/contact]
       ├── 1. Lưu tin nhắn vào cơ sở dữ liệu (Supabase / Local Store)
       └── 2. Kiểm tra có RESEND_API_KEY không?
              ↓ (Có API Key)
       [Resend API: POST https://api.resend.com/emails]
              ↓
       [Hòm thư Ban Quản Trị: ADMIN_NOTIFICATION_EMAIL]
              └── Nhận email kèm nút bấm "Trả lời qua email" hoặc "Gọi điện"
```

---

## 3. Các bước thiết lập từng bước (Step-by-Step)

### Bước 1: Đăng ký tài khoản Resend
1. Truy cập [https://resend.com](https://resend.com) và chọn **Get Started**.
2. Đăng nhập nhanh bằng tài khoản Google hoặc GitHub của Ban Tổ Chức.

---

### Bước 2: Tạo API Key bí mật
1. Sau khi đăng nhập, tại menu bên trái, chọn **API Keys** (hoặc truy cập [https://resend.com/api-keys](https://resend.com/api-keys)).
2. Nhấn nút **Create API Key**.
3. Điền các trường:
   * **Name**: `gieomo-prod` (hoặc tên dự án bạn muốn).
   * **Permission**: `Full access` (hoặc `Sending access`).
   * **Domain**: Chọn `All domains` (hoặc domain bạn đã cấu hình).
4. Nhấn **Add**.
5. **Sao chép mã API Key** hiển thị trên màn hình (dạng `re_xxxxxxxxxxxxxxxxxxxxxxxxxx`).  
   *(Lưu ý: Mã này chỉ xuất hiện 1 lần duy nhất, hãy lưu cẩn thận vào ghi chú an toàn).*

---

### Bước 3: Cấu hình biến môi trường trên Website

Mở file `.env.local` ở máy tính của bạn (khi chạy thử) hoặc cấu hình trong mục **Environment Variables** trên Vercel:

```env
# ========================================================
# CẤU HÌNH EMAIL RESEND
# ========================================================

# 1. API Key lấy từ Resend (Bắt buộc)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 2. Email Admin nhận thông báo khi có tin nhắn mới
ADMIN_NOTIFICATION_EMAIL=gieomo@mammo.vn

# 3. Email người gửi hiển thị (Xem chi tiết ở Bước 4)
# Nếu chưa có Domain riêng, dùng email mặc định:
RESEND_FROM_EMAIL="Gieo Mơ Website <onboarding@resend.dev>"

# Khi đã xác minh Domain riêng (VD: mammo.vn):
# RESEND_FROM_EMAIL="Gieo Mơ <lienhe@mammo.vn>"
```

> ⚠️ **Lưu ý bảo mật**: Không bao giờ commit file `.env.local` chứa khóa `RESEND_API_KEY` lên GitHub công khai!

---

### Bước 4: Lựa chọn chế độ gửi: Thử nghiệm (Sandbox) vs Tên miền riêng (Production)

Resend có 2 chế độ hoạt động:

#### Cách 1: Chế độ Thử nghiệm nhanh (Testing / Sandbox) — Không cần có tên miền
* **Tên miền người gửi**: Giữ nguyên `onboarding@resend.dev`.
* **Ràng buộc của Resend**: Ở chế độ này, Resend **chỉ cho phép gửi đến chính địa chỉ email mà bạn dùng để đăng ký tài khoản Resend**.
* 👉 **Cách dùng**: Cài đặt `ADMIN_NOTIFICATION_EMAIL` trùng với email bạn đăng ký Resend. Khi khách submit form, bạn sẽ nhận được thông báo ngay lập tức mà không cần cấu hình DNS.

#### Cách 2: Kết nối Tên miền riêng (Custom Domain) — Dành cho Production chính thức
Để gửi email đến bất kỳ ai (và gửi email xác nhận đơn hàng cho khách), bạn cần kết nối tên miền (ví dụ: `mammo.vn`):

1. Trong dashboard Resend, vào menu **Domains** ➔ Chọn **Add Domain**.
2. Nhập tên miền (khuyên dùng subdomain để bảo vệ danh tiếng email, ví dụ: `mail.mammo.vn` hoặc dùng trực tiếp `mammo.vn`).
3. Chọn khu vực server gần nhất: `ap-southeast-1` (Singapore) hoặc `us-east-1`.
4. Resend sẽ cung cấp cho bạn 3 bản ghi DNS:
   * **DKIM** (Loại `TXT` / `CNAME`)
   * **SPF** (Loại `TXT`)
   * **MX** (Loại `MX` — dùng để nhận phản hồi)
5. Truy cập trang quản trị tên miền của bạn (Cloudflare, Tenten, PA Việt Nam, Mắt Bão, v.v.), thêm đúng các bản ghi trên.
6. Quay lại Resend, nhấn nút **Verify DNS Records**. Quá trình xác thực thường mất từ 1 - 10 phút.
7. Khi trạng thái chuyển sang **Verified** (màu xanh lá):
   * Cập nhật `RESEND_FROM_EMAIL="Gieo Mơ <lienhe@mammo.vn>"` trong biến môi trường.

---

### Bước 5: Kiểm tra gửi thử (Testing)

1. Khởi động website:
   ```bash
   npm run dev
   ```
2. Mở trình duyệt và truy cập trang liên hệ: `http://localhost:3000/contact`.
3. Điền thử thông tin:
   * Họ tên: `Nguyễn Văn A`
   * Email: `nguyenvana@gmail.com`
   * Số điện thoại: `0901234567`
   * Lời nhắn: `Em muốn hỏi thăm về kích thước mẫu áo len Gieo Mơ...`
4. Nhấn **Gửi tin nhắn**.
5. **Kiểm tra kết quả**:
   * Kiểm tra hòm thư `ADMIN_NOTIFICATION_EMAIL` (kiểm tra cả thư mục Spam/Quảng cáo nếu gửi lần đầu).
   * Vào dashboard Resend tại tab **Emails** để xem log chi tiết của email vừa gửi.
   * Truy cập trang quản trị `/admin/messages` trên website để thấy tin nhắn đã được lưu trữ trong danh sách.

---

## 4. Mở rộng: Tích hợp Gửi Email Xác Nhận Đơn Hàng

Nếu muốn gửi email hóa đơn / xác nhận tự động cho khách khi đặt hàng hoặc sau khi Webhook SePay duyệt thanh toán thành công, bạn có thể gọi hàm gửi email tương tự:

```typescript
// Ví dụ hàm gửi email xác nhận đơn hàng
export async function sendOrderConfirmationEmail(order: any) {
  if (!process.env.RESEND_API_KEY || !order.customer_email) return;

  const fromEmail = process.env.RESEND_FROM_EMAIL || "Gieo Mơ <onboarding@resend.dev>";

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [order.customer_email],
        subject: `[Gieo Mơ] Xác nhận đơn hàng #${order.order_code}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2d6338;">Cảm ơn bạn đã đồng hành cùng Gieo Mơ! 🌱</h2>
            <p>Mã đơn hàng của bạn: <strong>#${order.order_code}</strong></p>
            <p>Tổng thanh toán: <strong>${order.final_amount.toLocaleString("vi-VN")}đ</strong></p>
            <p>Bạn có thể tra cứu tiến độ đơn hàng bất kỳ lúc nào tại: 
              <a href="https://gieomo.vn/track?code=${order.order_code}">Tra cứu đơn hàng #${order.order_code}</a>
            </p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 13px; color: #666;">Dự án gây quỹ may vá vì cộng đồng Mầm Mơ.</p>
          </div>
        `,
      }),
    });
  } catch (error) {
    console.error("Lỗi gửi email xác nhận đơn hàng:", error);
  }
}
```

---

## 5. Xử lý các sự cố thường gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Lỗi 401 Unauthorized** | Mã `RESEND_API_KEY` chưa điền hoặc bị sai ký tự. | Kiểm tra lại file `.env.local` hoặc biến môi trường trên Vercel. Chắc chắn key bắt đầu bằng `re_`. |
| **Lỗi 403 Forbidden: "You can only send testing emails to your own email address"** | Đang dùng domain thử nghiệm `onboarding@resend.dev` nhưng gửi đến địa chỉ email khác với email đăng ký tài khoản Resend. | Điền `ADMIN_NOTIFICATION_EMAIL` trùng với email bạn đăng nhập Resend, hoặc xác minh Custom Domain riêng. |
| **Email gửi thành công nhưng không thấy trong Inbox** | Email bị phân loại vào mục Spam / Quảng cáo (Junk / Spam). | Kiểm tra hòm thư Rác/Spam, bấm "Không phải thư rác" (Not Spam) để các email sau vào thẳng hộp thư chính. |
| **Status trên Resend là "Queued" lâu** | Mạng hoặc kiểm duyệt nội dung của hệ thống mail. | Thường chỉ mất vài giây đến 1 phút, hãy làm mới (F5) trang Emails trên dashboard Resend. |

---

*Cần thêm hỗ trợ kỹ thuật? Tham khảo tài liệu chính thức tại [https://resend.com/docs](https://resend.com/docs).*
