import type { Order } from "@/types/database";

/**
 * Escapes HTML characters to prevent HTML/XSS injection in emails.
 */
export function escapeHtml(str?: string | null): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates brand-styled HTML email for Order Confirmation
 */
export function generateOrderConfirmationHtml(
  order: Order,
  customSettings?: { contactPhone?: string; contactEmail?: string }
): string {
  const hotline = escapeHtml(customSettings?.contactPhone || "0123 456 789");
  const contactMail = escapeHtml(customSettings?.contactEmail || "gieomo@mammo.vn");
  const formattedAmount = (order.final_amount || 0).toLocaleString("vi-VN");
  const formattedSubtotal = (order.subtotal || 0).toLocaleString("vi-VN");
  const formattedShipping = (order.shipping_fee || 0).toLocaleString("vi-VN");
  const discountRow = order.discount_amount
    ? `<tr><td style="padding: 8px 0; color: #2D6338; font-weight: bold;">Giảm giá:</td><td style="padding: 8px 0; text-align: right; color: #2D6338; font-weight: bold;">-${order.discount_amount.toLocaleString("vi-VN")}đ</td></tr>`
    : "";

  const buyerName = escapeHtml(order.buyer_name || "bạn");
  const recipientName = escapeHtml(order.recipient_name || order.buyer_name || "Khách hàng");
  const recipientPhone = escapeHtml(order.recipient_phone || order.buyer_phone || "");
  const orderCode = escapeHtml(order.order_code);
  const addressDetail = escapeHtml(order.address_detail);
  const district = escapeHtml(order.district);
  const province = escapeHtml(order.province);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Xác nhận đơn hàng #${orderCode} - Gieo Mơ</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FFF8EE; color: #342A24;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 24px; border: 1px solid #F0E5D8; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
    <!-- Header -->
    <div style="background-color: #1B3622; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">🌱 Gieo Mơ — Mầm Mơ</h1>
      <p style="margin: 6px 0 0 0; color: #BFE9C3; font-size: 13px;">Gom từng mảnh nhỏ, dệt thành yêu thương</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #16381D; font-weight: 800;">
        Cảm ơn bạn ${buyerName} đã gieo mơ cùng chúng mình!
      </h2>
      <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #5C4D44;">
        Đơn hàng <strong>#${orderCode}</strong> của bạn đã được ghi nhận trên hệ thống gây quỹ của Mầm Mơ. 100% lợi nhuận từ sản phẩm sẽ được chuyển thành sách vở và dụng cụ học tập cho các em nhỏ vùng cao.
      </p>

      <!-- Order Summary Card -->
      <div style="background-color: #FFFDF9; border: 1px solid #F0E5D8; border-radius: 16px; padding: 18px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr>
            <td style="padding: 6px 0; color: #7E7068;">Mã đơn hàng:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; font-family: monospace; font-size: 14px; color: #1B3622;">#${orderCode}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7E7068;">Phương thức:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: 600;">${order.payment_method === "banking" ? "Chuyển khoản VietQR" : "Tiền mặt khi nhận (COD)"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #7E7068;">Trạng thái thanh toán:</td>
            <td style="padding: 6px 0; text-align: right; font-weight: bold; color: ${order.payment_status === "paid" ? "#2D6338" : "#E2884E"};">
              ${order.payment_status === "paid" ? "✓ Đã thanh toán" : "⏳ Chờ chuyển khoản"}
            </td>
          </tr>
          <tr style="border-top: 1px dashed #E0D3C5;">
            <td style="padding: 8px 0 4px 0; color: #7E7068;">Tiền hàng:</td>
            <td style="padding: 8px 0 4px 0; text-align: right; font-weight: 600;">${formattedSubtotal}đ</td>
          </tr>
          ${discountRow}
          <tr>
            <td style="padding: 4px 0; color: #7E7068;">Phí vận chuyển:</td>
            <td style="padding: 4px 0; text-align: right; font-weight: 600;">${formattedShipping}đ</td>
          </tr>
          <tr style="border-top: 1px solid #D0C3B5;">
            <td style="padding: 10px 0 4px 0; font-size: 15px; font-weight: 800; color: #16381D;">Tổng cộng:</td>
            <td style="padding: 10px 0 4px 0; text-align: right; font-size: 16px; font-weight: 800; color: #1B3622;">${formattedAmount}đ</td>
          </tr>
        </table>
      </div>

      <!-- Shipping Destination -->
      <div style="background-color: #F8F6F2; border-radius: 14px; padding: 14px 18px; margin-bottom: 24px; font-size: 12px; color: #5C4D44; line-height: 1.5;">
        <strong style="color: #231B16; display: block; margin-bottom: 4px;">📍 Địa chỉ nhận hàng:</strong>
        ${recipientName} • ${recipientPhone}<br/>
        ${addressDetail}${district ? `, ${district}` : ""}${province ? `, ${province}` : ""}
      </div>

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://gieomo.store/track?code=${encodeURIComponent(order.order_code)}" style="display: inline-block; background-color: #BFE9C3; color: #16381D; font-weight: 800; font-size: 13px; padding: 12px 28px; border-radius: 30px; text-decoration: none; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
          Theo dõi tiến độ đơn hàng ➔
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #FFF8EE; padding: 18px 24px; text-align: center; border-top: 1px solid #F0E5D8; font-size: 11px; color: #7E7068;">
      Nếu bạn có câu hỏi hoặc cần hỗ trợ khẩn, liên hệ với Mầm qua Hotline: <strong>${hotline}</strong> hoặc email <a href="mailto:${contactMail}" style="color: #2D6338; font-weight: bold;">${contactMail}</a>.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates brand-styled HTML email for Payment Received confirmation
 */
export function generatePaymentReceivedHtml(order: Order): string {
  const formattedAmount = (order.final_amount || 0).toLocaleString("vi-VN");
  const buyerName = escapeHtml(order.buyer_name || "bạn");
  const orderCode = escapeHtml(order.order_code);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Xác nhận đã thanh toán #${orderCode} - Gieo Mơ</title>
</head>
<body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FFF8EE; color: #342A24;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 24px; border: 1px solid #BFE9C3; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
    <!-- Header -->
    <div style="background-color: #2D6338; padding: 28px 24px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800;">✓ ĐÃ THANH TOÁN THÀNH CÔNG</h1>
      <p style="margin: 6px 0 0 0; color: #BFE9C3; font-size: 13px;">Dự án Gieo Mơ — Mầm Mơ</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="margin: 0 0 12px 0; font-size: 17px; color: #16381D; font-weight: 800;">
        Chào ${buyerName}, Mầm Mơ đã nhận được thanh toán!
      </h2>
      <p style="margin: 0 0 18px 0; font-size: 13px; line-height: 1.6; color: #5C4D44;">
        Số tiền <strong>${formattedAmount}đ</strong> cho đơn hàng <strong>#${orderCode}</strong> đã được xác nhận vào tài khoản ngân hàng của dự án. Ban Hậu Cần đang tiến hành đóng gói các sản phẩm handmade để giao tới bạn trong thời gian sớm nhất.
      </p>

      <div style="text-align: center; margin: 24px 0;">
        <a href="https://gieomo.store/track?code=${encodeURIComponent(order.order_code)}" style="display: inline-block; background-color: #2D6338; color: #ffffff; font-weight: 800; font-size: 13px; padding: 12px 28px; border-radius: 30px; text-decoration: none;">
          Xem tiến độ chuẩn bị hàng ➔
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #FFF8EE; padding: 16px 24px; text-align: center; border-top: 1px solid #F0E5D8; font-size: 11px; color: #7E7068;">
      Cảm ơn bạn đã luôn tin tưởng và đồng hành cùng các em nhỏ vùng cao! 🌱
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function generatePaymentReminderHtml(order: Order): string {
  const buyerName = escapeHtml(order.buyer_name || "bạn");
  const orderCode = escapeHtml(order.order_code);
  const amount = Number(order.final_amount || 0).toLocaleString("vi-VN");
  const trackingUrl = `https://gieomo.store/track?code=${encodeURIComponent(order.order_code)}`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Nhắc thanh toán ${orderCode}</title></head>
<body style="margin:0;padding:24px;background:#FFF8EE;color:#342A24;font-family:Montserrat,Arial,sans-serif"><div style="max-width:580px;margin:auto;overflow:hidden;border:1px solid #F0E5D8;border-radius:24px;background:#fff"><div style="background:#1B3622;padding:24px;text-align:center;color:#fff"><h1 style="margin:0;font-size:20px">🌱 Gieo Mơ — Mầm Mơ</h1></div><div style="padding:28px 24px"><h2 style="color:#16381D;font-size:17px">Chào ${buyerName}, đơn ${orderCode} đang chờ thanh toán</h2><p style="font-size:13px;line-height:1.65">Hệ thống chưa ghi nhận khoản thanh toán <strong>${amount}đ</strong> cho đơn hàng này. Nếu bạn đã chuyển khoản, vui lòng không chuyển thêm và liên hệ Gieo Mơ để chúng mình đối soát.</p><p style="text-align:center;margin-top:24px"><a href="${trackingUrl}" style="display:inline-block;border-radius:999px;background:#BFE9C3;padding:12px 24px;color:#16381D;text-decoration:none;font-weight:800">Kiểm tra trạng thái đơn</a></p></div><div style="border-top:1px solid #F0E5D8;background:#FFF8EE;padding:16px 24px;font-size:11px;color:#7E7068">Đây là lời nhắc thủ công từ đội ngũ Gieo Mơ. Nếu bạn đã thanh toán, hãy bỏ qua email này và gửi mã giao dịch để được kiểm tra.</div></div></body></html>`;
}
