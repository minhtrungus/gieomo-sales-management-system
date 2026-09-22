"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { MoneyDisplay } from "@/components/ui/MoneyDisplay";
import { Button } from "@/components/ui/Button";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderCode = searchParams.get("code") || "GM-260901";
  const paymentMethod = searchParams.get("payment") || "banking";
  const amount = Number(searchParams.get("amount") || "145000");

  const [hasConfirmedPayment, setHasConfirmedPayment] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

  const bankAccount = {
    bankName: "Ngân hàng MB Bank (Quân Đội)",
    accountNumber: "03456789999",
    accountHolder: "CLB MAM MO GIEO MO",
    transferMemo: orderCode,
  };

  const vietQrUrl = `https://img.vietqr.io/image/MB-${bankAccount.accountNumber}-compact.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(bankAccount.accountHolder)}`;

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
    <div className="max-w-2xl mx-auto space-y-8 text-center">
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
      <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs text-left space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
          <div>
            <span className="text-xs text-gray-500 font-medium block">Mã đơn hàng của bạn:</span>
            <span className="font-heading font-extrabold text-xl text-emerald-950 tracking-wider">
              {orderCode}
            </span>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xs text-gray-500 font-medium block">Tổng tiền:</span>
            <MoneyDisplay amount={amount} className="text-xl font-extrabold text-emerald-950" />
          </div>
        </div>

        {/* Payment Instructions if Banking */}
        {paymentMethod === "banking" ? (
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold block text-sm text-amber-950">
                📌 Hướng dẫn chuyển khoản ngân hàng:
              </span>
              <p>Vui lòng chuyển khoản theo thông tin bên dưới hoặc quét mã QR tự động để hoàn tất đơn hàng.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center pt-2">
              {/* Bank Info */}
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-gray-500 block">Ngân hàng:</span>
                  <span className="font-bold text-gray-900 text-sm">{bankAccount.bankName}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Số tài khoản:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-emerald-900 text-base">
                      {bankAccount.accountNumber}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 block">Chủ tài khoản:</span>
                  <span className="font-bold text-gray-900">{bankAccount.accountHolder}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Nội dung chuyển khoản (Bắt buộc):</span>
                  <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 inline-block mt-0.5">
                    {bankAccount.transferMemo}
                  </span>
                </div>
              </div>

              {/* VietQR Code */}
              <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-gray-50 border border-gray-200 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vietQrUrl}
                  alt="VietQR Chuyển khoản"
                  className="w-44 h-44 object-contain rounded-xl shadow-xs"
                />
                <span className="text-[11px] font-medium text-gray-500 mt-2">
                  Quét mã VietQR bằng ứng dụng Ngân hàng
                </span>
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
              Bạn xác nhận đã chuyển khoản <strong>{amount.toLocaleString("vi-VN")}đ</strong> cho đơn hàng <strong>{orderCode}</strong>?
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
