import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "next/link";
import { QrCode, Banknote, ShieldCheck, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Hướng dẫn thanh toán an toàn | Gieo Mơ",
  description:
    "Hướng dẫn các hình thức thanh toán khi mua hàng tại Gieo Mơ: chuyển khoản quét mã VietQR tự động xác nhận trong 3 giây hoặc thanh toán tiền mặt khi nhận hàng (COD).",
  alternates: {
    canonical: "/policy/payment",
  },
  openGraph: {
    title: "Hướng dẫn thanh toán an toàn | Gieo Mơ",
    description:
      "Hướng dẫn các hình thức thanh toán khi mua hàng tại Gieo Mơ: chuyển khoản quét mã VietQR tự động xác nhận trong 3 giây hoặc thanh toán tiền mặt khi nhận hàng (COD).",
  },
};

export default function PaymentPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
            💳 Thanh toán an toàn
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
            Hướng dẫn thanh toán Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto">
            Hỗ trợ chuyển khoản VietQR tự động khớp đơn 3s hoặc thanh toán khi nhận hàng (COD).
          </p>
        </div>

        {/* Payment Methods */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* VietQR Method */}
          <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-2xs space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-soft-green text-emerald-950 text-[11px] font-bold px-3 py-1 rounded-bl-xl">
              Nhanh nhất & Khuyên dùng ✨
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-800">
              <QrCode className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-xl text-emerald-950">
              Chuyển khoản VietQR tự động
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Mã QR động được sinh tự động khi checkout, tích hợp chính xác số tiền & nội dung chuyển khoản mã đơn hàng.
            </p>

            <ul className="space-y-2 text-xs text-gray-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Không cần nhập tay số tiền hay nội dung</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Hệ thống tự động xác nhận đơn trong vài giây</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>An toàn tuyệt đối, không lo nhầm số tài khoản</span>
              </li>
            </ul>
          </div>

          {/* COD Method */}
          <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-2xs space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-800">
              <Banknote className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-extrabold text-xl text-emerald-950">
              Thanh toán khi nhận hàng (COD)
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Nhận hàng tận tay và trả tiền mặt trực tiếp cho nhân viên giao hàng (Shipper).
            </p>

            <ul className="space-y-2 text-xs text-gray-700">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Kiểm tra bao bì đóng gói trước khi nhận</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Áp dụng cho mọi tỉnh thành trên toàn quốc</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Không phát sinh thêm bất kỳ chi phí ẩn nào</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Step by step VietQR guide */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs space-y-6 text-sm text-gray-700">
          <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
            📌 Hướng dẫn chuyển khoản qua VietQR
          </h2>

          <ol className="list-decimal list-inside space-y-3 text-xs sm:text-sm text-gray-700">
            <li>Tại bước Thanh toán, chọn phương thức <strong>Chuyển khoản VietQR</strong>.</li>
            <li>Mở ứng dụng Ngân hàng (MB Bank, Vietcombank, Techcombank, Momo, VPBank...) trên điện thoại của bạn.</li>
            <li>Chọn tính năng <strong>Quét mã QR</strong> và đưa camera về phía mã QR trên màn hình.</li>
            <li>Kiểm tra số tiền và bấm <strong>Xác nhận chuyển tiền</strong> (Nội dung chuyển khoản mặc định dạng `GMXXXXXX`).</li>
            <li>Màn hình web sẽ tự động chuyển sang trang Đặt hàng thành công sau khi giao dịch hoàn tất.</li>
          </ol>

          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-3 text-xs text-emerald-900">
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Cam kết minh bạch tài chính gây quỹ</span>
              100% số tiền chuyển khoản được chuyển trực tiếp vào tài khoản ngân hàng gây quỹ chính thức của CLB Mầm Mơ và được báo cáo công khai định kỳ.
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
