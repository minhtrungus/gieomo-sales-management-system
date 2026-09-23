"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";
import { getStoredOrders, getStoredSettings } from "@/lib/data/orderStore";
import type { Order } from "@/types/database";
import { Copy, Check, ExternalLink, Download } from "lucide-react";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get("code") || "GM-369817";
  const paymentMethod = searchParams.get("payment") || "banking";
  const urlAmount = Number(searchParams.get("amount") || "110000");

  const [settings, setSettings] = useState(() => getStoredSettings());
  const [order, setOrder] = useState<Order | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

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
    accountNumber: settings.bankNumber || "03456789999",
    accountHolder: settings.bankHolder || "CLB MAM MO GIEO MO",
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

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-center">
      {/* Celebration Icon */}
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-soft-green text-emerald-950 font-extrabold text-4xl shadow-md animate-bounce">
        🎉
      </div>

      <div className="space-y-2">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
          Đặt hàng thành công!
        </h1>
        <p className="text-gray-600 text-sm sm:text-base">
          Cảm ơn bạn đã đồng hành cùng <strong>Gieo Mơ</strong>. Mối nhân duyên này mang lại thật nhiều giá trị tốt đẹp!
        </p>
      </div>

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
                    ? `${order.address_detail}, ${order.district}, ${order.province}`
                    : order?.delivery_type === "pickup_point"
                    ? `Nhận tại điểm hẹn: ${order.address_detail}`
                    : "Tự đến lấy tại văn phòng BTC Mầm Mơ"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `${order?.recipient_name || order?.buyer_name} - ${order?.recipient_phone || order?.buyer_phone} - ${order?.address_detail}, ${order?.district}, ${order?.province}`,
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

            {/* Collapsible Bank Details — Secondary */}
            <details className="group rounded-2xl border border-[#F0E5D8] bg-[#FFFDF9] overflow-hidden">
              <summary className="p-4 cursor-pointer flex items-center justify-between text-xs font-bold text-[#5C4D44] hover:bg-[#FFF8EE] transition-colors list-none">
                <span>🏦 Xem chi tiết thông tin chuyển khoản thủ công</span>
                <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 pt-0 space-y-3 text-xs border-t border-[#F0E5D8]">
                <div className="pt-3">
                  <span className="text-gray-500 block">Ngân hàng:</span>
                  <span className="font-bold text-gray-900 text-sm">{bankAccount.bankName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Số tài khoản:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-extrabold text-emerald-900 text-base">{bankAccount.accountNumber}</span>
                    <button type="button" onClick={() => handleCopy(bankAccount.accountNumber, "stk")} className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-[#BFE9C3] text-gray-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors">
                      {copiedItem === "stk" ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedItem === "stk" ? "Đã chép" : "Chép"}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block">Chủ tài khoản:</span>
                  <span className="font-bold text-gray-900">{bankAccount.accountHolder}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Số tiền cần chuyển:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-extrabold text-emerald-950 text-base">{finalAmount.toLocaleString("vi-VN")}đ</span>
                    <button type="button" onClick={() => handleCopy(String(finalAmount), "amount")} className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-[#BFE9C3] text-gray-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors">
                      {copiedItem === "amount" ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedItem === "amount" ? "Đã chép" : "Chép"}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block">Nội dung chuyển khoản (Bắt buộc):</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 inline-block">{bankAccount.transferMemo}</span>
                    <button type="button" onClick={() => handleCopy(bankAccount.transferMemo, "memo")} className="px-2 py-0.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors">
                      {copiedItem === "memo" ? <Check className="w-3 h-3 text-red-700" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedItem === "memo" ? "Đã chép" : "Chép"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </details>

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
                    <span>✓ Tôi đã chuyển khoản xong — Xác nhận thanh toán</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-900">
            <span className="font-bold block text-sm">🚚 Thanh toán COD khi nhận hàng:</span>
            <p className="mt-1">
              Đơn hàng sẽ được nhân viên đóng gói và chuyển tới bạn sớm nhất. Vui lòng giữ liên lạc điện thoại khi nhân viên giao hàng gọi nhé!
            </p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
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
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
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

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-12 md:py-16">
        <Suspense fallback={<div className="text-center py-12">Đang tải thông tin đơn hàng...</div>}>
          <OrderSuccessContent />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
