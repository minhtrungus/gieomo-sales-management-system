import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "next/link";
import { QrCode, Banknote, ShieldCheck, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Hướng Dẫn Thanh Toán Chuyển Khoản An Toàn",
  description:
    "Hướng dẫn các hình thức thanh toán khi mua hàng tại Gieo Mơ: chuyển khoản quét mã VietQR tự động xác nhận trong 5 giây.",
  alternates: {
    canonical: "/policy/payment",
  },
  openGraph: {
    title: "Hướng Dẫn Thanh Toán Chuyển Khoản An Toàn | Gieo Mơ",
    description:
      "Hướng dẫn các hình thức thanh toán khi mua hàng tại Gieo Mơ: chuyển khoản quét mã VietQR tự động xác nhận trong 5 giây.",
  },
};

export default function PaymentPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold whitespace-nowrap">
            💳 Thanh toán an toàn
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
            Hướng dẫn thanh toán Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto text-balance">
            Hỗ trợ chuyển khoản VietQR tự động khớp đơn 5s.
          </p>
        </div>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6 mb-8">
          {/* VietQR Method */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-100 shadow-2xs space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-soft-green text-emerald-950 text-[11px] font-bold px-3 py-1 rounded-bl-xl whitespace-nowrap">
              Nhanh nhất ✨
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-xl text-emerald-950 text-balance">
              Chuyển khoản VietQR tự động
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed text-pretty">
              Mã QR động được sinh tự động khi checkout, tích hợp chính xác số tiền & nội dung chuyển khoản mã đơn hàng.
            </p>

            <ul className="space-y-2 text-xs text-gray-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Không cần nhập tay số tiền hay nội dung</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Hệ thống tự động xác nhận đơn trong 5 giây</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>An toàn tuyệt đối, không lo nhầm số tài khoản</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Step by step VietQR guide */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs space-y-6 text-sm text-gray-700 leading-relaxed">
          <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2 text-balance">
            📌 Hướng dẫn chuyển khoản qua VietQR
          </h2>

          <ol className="list-decimal list-inside space-y-3 text-xs sm:text-sm text-gray-700 text-pretty">
            <li>Tại bước Thanh toán, chọn phương thức <strong>Chuyển khoản VietQR</strong>.</li>
            <li>Mở ứng dụng Ngân hàng (MB Bank, Vietcombank, Techcombank, Momo, VPBank...) trên điện thoại của bạn.</li>
            <li>Chọn tính năng <strong>Quét mã QR</strong> và đưa camera về phía mã QR trên màn hình.</li>
            <li>Kiểm tra số tiền và bấm <strong>Xác nhận chuyển tiền</strong> (Nội dung chuyển khoản mặc định dạng `GMXXXXXX`).</li>
            <li>Màn hình web sẽ tự động chuyển sang trang Đặt hàng thành công sau khi giao dịch hoàn tất.</li>
          </ol>
        </div>
      </main>

      <Footer />
    </div>
  );
}
