"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState, useEffect, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { getStoredOrders, getStoredSettings, getStoredVouchers, DEFAULT_SETTINGS, type SiteSettings } from "@/lib/data/orderStore";
import type { Order, Voucher } from "@/types/database";
import { Copy, Check, ExternalLink, Download, Share2, Sparkles, Gift } from "lucide-react";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get("code") || "GM-369817";
  const paymentMethod = searchParams.get("payment") || "banking";
  const urlAmount = Number(searchParams.get("amount") || "110000");

  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS);
  const [order, setOrder] = useState<Order | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

  // Social Share Card states
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [hidePriceOnCard, setHidePriceOnCard] = useState(false);
  const shareQuote = "Tôi vừa cùng Mầm Mơ gieo một giấc mơ cho trẻ em khó khăn 🌱";

  useEffect(() => {
    setSettings(getStoredSettings());
    const handleUpdate = () => setSettings(getStoredSettings());
    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  useEffect(() => {
    const orders = getStoredOrders();
    const found = orders.find((o) => o.order_code === orderCode);
    if (found) {
      setOrder(found);
    }
  }, [orderCode]);

  const finalAmount = order ? order.final_amount : urlAmount;

  const bankAccount = {
    bankName: settings.bankName || "Ngân hàng MB Bank (Quân Đội)",
    accountNumber: settings.bankNumber || "0888670637",
    accountHolder: settings.bankHolder || "NGUYEN THI TRUC HAN",
    transferMemo: orderCode,
  };

  // VietQR Napas247 Dynamic QR Code with exact amount and order memo
  const vietQrUrl =
    settings.qrMode === "upload" && settings.qrImageUrl
      ? settings.qrImageUrl
      : `https://img.vietqr.io/image/MB-${bankAccount.accountNumber}-compact2.png?amount=${finalAmount}&addInfo=${orderCode}&accountName=${encodeURIComponent(bankAccount.accountHolder)}`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(label);
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setProofImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmPaymentSubmit = () => {
    setHasConfirmedPayment(true);
    setIsConfirmModalOpen(false);
  };

  // Check gift voucher eligibility
  const giftVoucher = useMemo(() => {
    const vouchers = getStoredVouchers().filter((v) => v.status === "active" && v.is_gift_voucher);
    return vouchers.find((v) => finalAmount >= (v.gift_min_order_value || 0)) || null;
  }, [finalAmount]);

  // Generate and download High-Res 9:16 Social Story PNG (1080 x 1920)
  const handleDownloadShareCard = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background Gradient (warm pastel cream)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1920);
    bgGrad.addColorStop(0, "#FAF6F0");
    bgGrad.addColorStop(0.5, "#FFFDF9");
    bgGrad.addColorStop(1, "#EBF7EE");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Decorative Borders
    ctx.strokeStyle = "#BFE9C3";
    ctx.lineWidth = 14;
    ctx.strokeRect(40, 40, 1000, 1840);

    // Dashed inner sewing border
    ctx.strokeStyle = "#16381D";
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 12]);
    ctx.strokeRect(65, 65, 950, 1790);
    ctx.setLineDash([]);

    // Header Tag
    ctx.fillStyle = "#BFE9C3";
    ctx.beginPath();
    ctx.roundRect(340, 120, 400, 70, 35);
    ctx.fill();

    ctx.fillStyle = "#16381D";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🌱 TẠP HÓA GIEO MƠ", 540, 165);

    // Subtitle
    ctx.fillStyle = "#7E7068";
    ctx.font = "italic 24px sans-serif";
    ctx.fillText("Dự Án Gây Quỹ Thiện Nguyện Của Mầm Mơ", 540, 230);

    // Decorative Floral / Sparkle Icon
    ctx.fillStyle = "#2D6338";
    ctx.font = "50px sans-serif";
    ctx.fillText("🧵 ✨ 🌿", 540, 305);

    // Main Quote Box
    ctx.fillStyle = "#16381D";
    ctx.beginPath();
    ctx.roundRect(90, 360, 900, 300, 40);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 38px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("“ Tôi vừa cùng Mầm Mơ", 540, 470);
    ctx.fillText("gieo một giấc mơ", 540, 530);
    ctx.fillText("cho trẻ em khó khăn 🌱 ”", 540, 590);

    // Certificate Card Container
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.roundRect(110, 720, 860, 840, 36);
    ctx.fill();
    ctx.strokeStyle = "#F0E5D8";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Certificate Title
    ctx.fillStyle = "#A89B92";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("CHỨNG NHẬN NGƯỜI GIEO MẦM", 540, 790);

    // Customer Name
    const customerName = order?.buyer_name || "Bạn đọc hảo tâm";
    ctx.fillStyle = "#231B16";
    ctx.font = "bold 52px sans-serif";
    ctx.fillText(customerName, 540, 865);

    // Order Code & Date
    ctx.fillStyle = "#2D6338";
    ctx.font = "bold 28px monospace";
    ctx.fillText(`MÃ ĐƠN HÀNG: ${orderCode}`, 540, 925);

    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}`;
    ctx.fillStyle = "#7E7068";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Ngày gieo duyên: ${dateStr}`, 540, 970);

    // Horizontal Divider
    ctx.strokeStyle = "#F0E5D8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(170, 1020);
    ctx.lineTo(910, 1020);
    ctx.stroke();

    // Products List
    ctx.fillStyle = "#5C4D44";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("SẢN PHẨM ĐÓNG GÓP:", 170, 1075);

    const orderItems = order?.items && order.items.length > 0
      ? order.items
      : [{ item_name_snapshot: "Sản phẩm may thủ công Mầm Mơ", quantity: 1 }];

    ctx.font = "28px sans-serif";
    ctx.fillStyle = "#231B16";
    let curY = 1130;
    orderItems.slice(0, 4).forEach((it: any) => {
      const name = it.item_name_snapshot || it.product_name_snapshot || "Sản phẩm";
      const truncated = name.length > 32 ? name.slice(0, 30) + "..." : name;
      ctx.fillText(`• ${truncated}`, 170, curY);
      ctx.textAlign = "right";
      ctx.fillText(`x${it.quantity}`, 910, curY);
      ctx.textAlign = "left";
      curY += 54;
    });

    // Contribution Amount (if not hidden)
    if (!hidePriceOnCard) {
      ctx.fillStyle = "#FAF6F0";
      ctx.beginPath();
      ctx.roundRect(170, 1370, 740, 90, 20);
      ctx.fill();

      ctx.fillStyle = "#7E7068";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Số tiền đóng góp quỹ:", 200, 1425);

      ctx.fillStyle = "#16381D";
      ctx.font = "bold 36px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${finalAmount.toLocaleString("vi-VN")}đ`, 880, 1427);
    }

    // Footer Mission Statement
    ctx.fillStyle = "#2D6338";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("100% Lợi Nhuận Dành Cho Trẻ Em Khó Khăn 🌱", 540, 1640);

    ctx.fillStyle = "#7E7068";
    ctx.font = "22px sans-serif";
    ctx.fillText("Từng món quà nhỏ trao đi là thêm cơ hội đến trường cho các em.", 540, 1685);

    ctx.fillStyle = "#16381D";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("gieomo.vn  •  fb.com/mammo.project", 540, 1750);

    // Download trigger
    const link = document.createElement("a");
    link.download = `The-Mua-Hang-Gieo-Mo-${orderCode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const isPaid = order?.payment_status === "paid" || hasConfirmedPayment;

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-center">
      {/* Status Header */}
      {paymentMethod === "banking" && !isPaid ? (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-100 text-amber-900 font-extrabold text-4xl shadow-md animate-pulse">
            💳
          </div>
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold mb-1 whitespace-nowrap">
              ⏳ ĐANG CHỜ CHUYỂN KHOẢN VIETQR
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
              Đơn hàng đang chờ thanh toán
            </h1>
            <p className="text-gray-600 text-sm sm:text-base max-w-lg mx-auto text-balance">
              Vui lòng quét mã VietQR bên dưới để hoàn tất giao dịch. Sau khi nhận được chuyển khoản, hệ thống sẽ tự động xác nhận đặt hàng thành công!
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-soft-green text-emerald-950 font-extrabold text-4xl shadow-md animate-bounce">
            🎉
          </div>
          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-[#E6F7EC] text-[#1B5E20] text-xs font-extrabold mb-1 whitespace-nowrap">
              ✓ ĐÃ XÁC NHẬN ĐƠN HÀNG
            </div>
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
              Đặt hàng thành công!
            </h1>
            <p className="text-gray-600 text-sm sm:text-base text-balance">
              Cảm ơn bạn đã đồng hành cùng <strong>Gieo Mơ</strong>. Mối nhân duyên này mang lại thật nhiều giá trị tốt đẹp!
            </p>
          </div>
        </>
      )}

      {/* Summary Box */}
      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs text-left space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
          <div>
            <span className="text-xs text-gray-500 font-medium block">Mã đơn hàng của bạn:</span>
            <span className="font-heading font-extrabold text-2xl text-emerald-950 tracking-wider font-mono">
              {orderCode}
            </span>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs text-gray-500 font-medium block">Tổng tiền thanh toán:</span>
            <MoneyDisplay amount={finalAmount} className="text-2xl font-extrabold text-emerald-950" />
          </div>
        </div>

        {/* Customer & Shipping Information Display */}
        <div className="p-4 rounded-2xl bg-[#FFFDF9] border border-[#F0E5D8] space-y-3">
          <h3 className="font-heading font-bold text-sm text-[#231B16] flex items-center gap-2 pb-2 border-b border-[#F0E5D8]">
            <span>📦</span> Thông tin nhận hàng & Người đặt:
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">Họ tên người nhận:</span>
              <span className="font-bold text-gray-900 text-sm">
                {order?.recipient_name || order?.buyer_name || "Khách hàng"}
              </span>
            </div>

            <div>
              <span className="text-gray-500 block">Số điện thoại:</span>
              <span className="font-bold text-[#16381D] text-sm font-mono">
                {order?.recipient_phone || order?.buyer_phone || "Đang cập nhật"}
              </span>
            </div>

            <div className="sm:col-span-2 space-y-1 pt-1 border-t border-gray-100">
              <span className="text-gray-500 block">Địa chỉ nhận hàng:</span>
              <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white border border-[#F0E5D8]">
                <span className="font-semibold text-gray-800 text-xs">
                  {order?.delivery_type === "home_delivery"
                    ? `${order.address_detail}, ${order.province}`
                    : order?.delivery_type === "pickup_point"
                    ? `Nhận tại điểm hẹn: ${order.address_detail}`
                    : (order?.address_detail || "Giao qua tay thành viên Mầm Mơ")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `${order?.recipient_name || order?.buyer_name} - ${order?.recipient_phone || order?.buyer_phone} - ${order?.address_detail}, ${order?.province}`,
                      "address"
                    )
                  }
                  className="shrink-0 px-2 py-1 rounded-lg bg-gray-50 hover:bg-[#BFE9C3] text-gray-700 hover:text-[#16381D] border border-gray-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Sao chép địa chỉ"
                >
                  {copiedItem === "address" ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedItem === "address" ? "Đã chép" : "Chép"}</span>
                </button>
              </div>
            </div>

            {order?.introducer_info && (
              <div className="sm:col-span-2 pt-1">
                <span className="text-gray-500 block">Người quen / Nguồn giới thiệu:</span>
                <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full bg-[#BFE9C3] text-[#16381D] font-bold text-[11px]">
                  🌱 {order.introducer_info}
                </span>
              </div>
            )}

            {order?.customer_note && (
              <div className="sm:col-span-2 pt-1">
                <span className="text-gray-500 block">Ghi chú cho Mầm Mơ:</span>
                <p className="italic text-gray-700 text-xs bg-white p-2 rounded-xl border border-gray-100 mt-1">
                  &ldquo;{order.customer_note}&rdquo;
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Instructions if Banking */}
        {paymentMethod === "banking" ? (
          <div className="space-y-4 pt-2">
            {/* QR Code — Primary, Top, Large */}
            <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-white border-2 border-[#BFE9C3] text-center shadow-sm">
              <p className="text-sm font-extrabold text-emerald-950 mb-3">
                📱 Quét mã QR để chuyển khoản ngay
              </p>
              <p className="text-xs text-gray-600 mb-4 max-w-sm">
                Mã QR đã tự động điền đúng <strong>{finalAmount.toLocaleString("vi-VN")}đ</strong> và nội dung <strong>{orderCode}</strong>. Chỉ cần mở App ngân hàng → quét mã.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vietQrUrl}
                alt="VietQR Chuyển khoản đúng số tiền"
                className="w-56 sm:w-64 h-auto object-contain rounded-xl shadow-sm border border-gray-100"
              />
              <div className="pt-3 flex items-center gap-3">
                <a
                  href={vietQrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-emerald-800 hover:underline inline-flex items-center gap-1"
                >
                  <span>Mở ảnh QR to hơn</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={vietQrUrl}
                  download={`QR-${orderCode}.png`}
                  className="text-xs font-bold text-gray-600 hover:underline inline-flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải ảnh QR</span>
                </a>
              </div>
              <span className="text-[10px] text-gray-400 mt-2">
                Hỗ trợ mọi App ngân hàng: MB, VCB, Momo, Techcombank, ACB, TPBank...
              </span>
            </div>

            {/* Direct Bank Details — Always Visible & Open, Only Memo is Copyable */}
            <div className="rounded-2xl border border-[#F0E5D8] bg-[#FFFDF9] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0E5D8]">
                <span className="font-bold text-[#5C4D44] text-xs">🏦 Thông tin chuyển khoản thủ công:</span>
                <span className="text-[11px] text-gray-400">MB Bank (Quân Đội)</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-gray-500 block">Ngân hàng:</span>
                  <span className="font-bold text-gray-900 text-xs">{bankAccount.bankName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Chủ tài khoản:</span>
                  <span className="font-bold text-gray-900 text-xs">{bankAccount.accountHolder}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Số tài khoản:</span>
                  <span className="font-mono font-bold text-emerald-950 text-sm">{bankAccount.accountNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Số tiền cần chuyển:</span>
                  <span className="font-extrabold text-emerald-950 text-sm">{finalAmount.toLocaleString("vi-VN")}đ</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#F0E5D8]">
                <span className="text-gray-600 font-bold block mb-1">
                  Nội dung chuyển khoản (Bắt buộc):
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200 text-sm tracking-wider inline-block">
                    {bankAccount.transferMemo}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(bankAccount.transferMemo, "memo")}
                    className="px-3 py-1.5 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95 shadow-2xs"
                  >
                    {copiedItem === "memo" ? <Check className="w-3.5 h-3.5 text-red-700" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedItem === "memo" ? "Đã chép mã" : "Sao chép mã"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                  💡 <em>Quét mã QR là cách nhanh và chuẩn xác nhất, App ngân hàng sẽ tự điền STK, số tiền và nội dung đơn cho bạn.</em>
                </p>
              </div>
            </div>

            {/* Customer Payment Confirmation CTA */}
            <div className="pt-4 border-t border-gray-100">
              {hasConfirmedPayment ? (
                <div className="p-4 rounded-2xl bg-[#E6F7EC] border border-[#A5D6A7] text-xs text-[#1B5E20] flex items-center justify-center gap-2 font-bold animate-in fade-in">
                  <span className="text-base">✅</span>
                  <span>Đã ghi nhận bạn chuyển khoản thành công! Ban Tổ Chức đang đối soát giao dịch và chuẩn bị đơn hàng cho bạn.</span>
                </div>
              ) : (
                <div className="space-y-2 text-center">
                  <p className="text-xs text-[#7E7068]">
                    Sau khi quét mã hoặc chuyển tiền xong trên App ngân hàng, bạn vui lòng bấm nút bên dưới để BTC tiến hành xác nhận ngay:
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsConfirmModalOpen(true)}
                    className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-sm shadow-sm border border-[#9ed4a3] transition-all active:scale-95 cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <span>✓ Tôi đã chuyển khoản xong - Xác nhận thanh toán</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* POST-CHECKOUT GIFT VOUCHER BOX */}
      {giftVoucher && (
        <div className="bg-linear-to-r from-amber-50 via-emerald-50 to-amber-50 rounded-3xl p-6 border-2 border-amber-300 shadow-sm text-left space-y-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl animate-bounce">🎁</span>
            <div>
              <h3 className="font-heading font-extrabold text-base text-emerald-950">
                Món quà tri ân đặc biệt từ Mầm Mơ dành cho bạn!
              </h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                Vì bạn đã gieo mầm đơn hàng trên {(giftVoucher.gift_min_order_value || 0).toLocaleString("vi-VN")}đ, Mầm Mơ xin gửi tặng bạn voucher cho lần mua tiếp theo:
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/90 border border-amber-200">
            <div className="flex items-center gap-3">
              <span className="font-mono font-extrabold text-base text-amber-700 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-300 tracking-wider">
                {giftVoucher.code}
              </span>
              <span className="text-xs text-gray-700 font-bold">
                {giftVoucher.discount_type === "freeship"
                  ? "Miễn phí vận chuyển toàn quốc"
                  : giftVoucher.discount_type === "percentage"
                  ? `Giảm ngay ${giftVoucher.discount_value}%`
                  : `Giảm ngay ${giftVoucher.discount_value.toLocaleString("vi-VN")}đ`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => handleCopy(giftVoucher.code, "gift_voucher")}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs self-end sm:self-auto"
            >
              {copiedItem === "gift_voucher" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedItem === "gift_voucher" ? "Đã sao chép" : "Sao chép mã quà"}</span>
            </button>
          </div>
        </div>
      )}

      {/* SOCIAL SHARE CARD & STORY SECTION */}
      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
          <div>
            <h3 className="font-heading font-extrabold text-base text-emerald-950 flex items-center gap-2">
              <span>🌱</span>
              <span>Thẻ mua hàng gây quỹ &amp; Lan tỏa cùng Mầm Mơ</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5 italic">
              &ldquo;{shareQuote}&rdquo;
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer self-start sm:self-auto">
            <input
              type="checkbox"
              checked={hidePriceOnCard}
              onChange={(e) => setHidePriceOnCard(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            <span>Ẩn giá tiền trên thẻ</span>
          </label>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          Hãy cùng chia sẻ tấm thẻ chứng nhận ấm áp này lên Story Instagram hoặc Facebook để lan tỏa thông điệp gây quỹ yêu thương tới bạn bè nhé!
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            className="px-4 py-3 rounded-2xl bg-cream hover:bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-2xs"
          >
            <span>👁️ Xem trước thẻ Story</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadShareCard}
            className="px-4 py-3 rounded-2xl bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all border border-[#9ed4a3] active:scale-98 shadow-2xs"
          >
            <Download className="w-4 h-4" />
            <span>Tải thẻ Story (PNG)</span>
          </button>

          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://mammo.vn")}&quote=${encodeURIComponent(shareQuote)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 rounded-2xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-2xs"
          >
            <span>f Chia sẻ Facebook</span>
          </a>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
        <Link href={`/track?code=${orderCode}`} className="w-full sm:w-auto">
          <Button variant="outline" size="lg" fullWidth>
            🔍 Tra cứu tiến độ đơn hàng
          </Button>
        </Link>
        <Link href="/" className="w-full sm:w-auto">
          <Button variant="primary" size="lg" fullWidth>
            🌱 Về trang chủ
          </Button>
        </Link>
      </div>

      {/* MODAL: XEM TRƯỚC THẺ CHIA SẺ STORY */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-left max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📸</span>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Thẻ mua hàng gây quỹ Mầm Mơ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Story Card Mockup Container */}
            <div
              id="story-card-mockup"
              className="relative p-6 rounded-3xl bg-linear-to-b from-[#FFFDF9] via-[#FAF6F0] to-[#EAF7ED] border-4 border-dashed border-[#BFE9C3] shadow-md space-y-4 text-center overflow-hidden"
            >
              <div className="inline-block px-3 py-1 rounded-full bg-soft-green text-emerald-950 font-bold text-[11px] uppercase tracking-wider">
                🌱 TẠP HÓA GIEO MƠ • MẦM MƠ
              </div>

              <div className="p-3.5 rounded-2xl bg-white/90 border border-emerald-100 shadow-2xs space-y-1">
                <p className="font-heading font-bold text-xs text-gray-500 uppercase">
                  Chứng nhận người gieo mầm
                </p>
                <h4 className="font-heading font-extrabold text-lg text-emerald-950">
                  {order?.buyer_name || "Bạn đọc hảo tâm"}
                </h4>
                <p className="text-[11px] font-mono text-emerald-700 font-bold">
                  Mã đơn: {orderCode}
                </p>
              </div>

              {/* Quote */}
              <div className="p-4 rounded-2xl bg-emerald-900 text-white space-y-1.5 shadow-sm">
                <span className="text-lg">✨</span>
                <p className="font-heading font-extrabold text-sm sm:text-base leading-snug">
                  &ldquo;{shareQuote}&rdquo;
                </p>
              </div>

              {/* Items summary */}
              <div className="text-left text-xs bg-white/80 p-3 rounded-2xl border border-gray-200/60 space-y-1">
                <span className="text-[10.5px] font-bold text-gray-500 block uppercase">Sản phẩm ủng hộ:</span>
                <div className="divide-y divide-gray-100 max-h-24 overflow-y-auto">
                  {(order?.items && order.items.length > 0 ? order.items : [{ item_name_snapshot: "Sản phẩm may thủ công Mầm Mơ", quantity: 1 }]).map((it: any, idx: number) => (
                    <div key={idx} className="py-1 flex justify-between items-center text-[11.5px]">
                      <span className="truncate pr-2 font-medium text-gray-800">• {it.item_name_snapshot || it.product_name_snapshot}</span>
                      <span className="font-bold text-gray-600 shrink-0">x{it.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount if not hidden */}
              {!hidePriceOnCard && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-emerald-100 text-xs">
                  <span className="text-gray-500 font-medium">Số tiền đóng góp quỹ:</span>
                  <span className="font-extrabold text-emerald-950 text-sm">{finalAmount.toLocaleString("vi-VN")}đ</span>
                </div>
              )}

              <p className="text-[10px] text-gray-500 italic">
                100% lợi nhuận chuyển đổi thành tập vở, dụng cụ học tập cho trẻ em khó khăn.
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hidePriceOnCard}
                  onChange={(e) => setHidePriceOnCard(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <span>Ẩn giá tiền trên thẻ</span>
              </label>

              <button
                type="button"
                onClick={handleDownloadShareCard}
                className="px-4 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer border border-[#9ed4a3]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải ảnh PNG</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: XÁC NHẬN ĐÃ CHUYỂN KHOẢN */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 border border-[#F0E5D8] shadow-2xl space-y-4 animate-in zoom-in-95 text-left">
            <div className="flex items-center justify-between border-b border-[#F0E5D8] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">💳</span>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  Xác nhận đã thanh toán VietQR
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#7E7068] leading-relaxed">
              Bạn xác nhận đã chuyển khoản <strong>{finalAmount.toLocaleString("vi-VN")}đ</strong> cho đơn hàng <strong>{orderCode}</strong>?
            </p>

            {/* Proof image upload input */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-[#342A24] block">
                Ảnh biên lai chuyển khoản (Tùy chọn):
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#BFE9C3] file:text-[#16381D] hover:file:bg-[#aee0b3] cursor-pointer"
              />
              {proofImage && (
                <div className="mt-2 relative w-24 h-24 rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proofImage} alt="Biên lai" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#F0E5D8]">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Chưa, kiểm tra lại
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentSubmit}
                className="px-5 py-2.5 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#16381D] font-extrabold text-xs shadow-xs border border-[#9ed4a3] transition-all cursor-pointer"
              >
                Đã chuyển khoản xong ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 max-w-4xl py-12 md:py-16">
        <Suspense fallback={<div className="text-center py-12">Đang tải thông tin đơn hàng...</div>}>
          <OrderSuccessContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
