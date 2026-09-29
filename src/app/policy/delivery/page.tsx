import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "next/link";
import { Truck, ShieldCheck, Clock, PackageCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách vận chuyển",
  description:
    "Thông tin chi tiết về cước phí vận chuyển toàn quốc, thời gian giao nhận hàng và quy trình đóng gói tỉ mỉ các sản phẩm thủ công từ Gieo Mơ.",
  alternates: {
    canonical: "/policy/delivery",
  },
  openGraph: {
    title: "Gieo Mơ | Chính sách vận chuyển",
    description:
      "Thông tin chi tiết về cước phí vận chuyển toàn quốc, thời gian giao nhận hàng và quy trình đóng gói tỉ mỉ các sản phẩm thủ công từ Gieo Mơ.",
  },
};

export default function DeliveryPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold whitespace-nowrap">
            🚚 Vận chuyển & Giao nhận
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950 text-balance">
            Chính sách giao hàng Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto text-balance">
            Thông tin chi tiết về cước phí, thời gian vận chuyển và quy trình đóng gói sản phẩm Gieo Mơ.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-soft-green/40 flex items-center justify-center text-emerald-900 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950 text-balance">Phí giao hàng cố định</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed text-justify hyphens-auto break-words">
                Đồng giá <strong className="text-emerald-900">15.000đ</strong> cho tất cả các đơn hàng giao tận nơi trên toàn quốc.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-powder-blue/60 flex items-center justify-center text-blue-900 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950 text-balance">Thời gian nhận hàng</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed text-justify hyphens-auto break-words">
                Từ 3 đến 5 ngày tùy theo khu vực nhận hàng.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex flex-col items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-soft-pink/50 flex items-center justify-center text-pink-900 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950 text-balance">Đóng gói cẩn thận</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed text-justify hyphens-auto break-words">
                Sản phẩm được đóng gói chỉn chu nhất để gửi đến bạn.
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Policy Text */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs space-y-6 text-sm text-gray-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2 text-balance">
              1. Quy trình xử lý đơn hàng
            </h2>
            <p className="text-justify hyphens-auto break-words">
              Ngay khi bạn đặt hàng và xác nhận thanh toán, Tạp Hóa Gieo Mơ sẽ chuẩn bị sản phẩm, đóng gói cẩn thận và bàn giao cho đơn vị vận chuyển (SPX Express) trong vòng 24 giờ.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2 text-balance">
              2. Kiểm tra hàng khi nhận
            </h2>
            <p className="text-justify hyphens-auto break-words">
              Gieo Mơ khuyến khích bạn quay video nhận hàng nhận về tình trạng sản phẩm khi unbox. Nếu sản phẩm bị hư hỏng hoặc không đúng mẫu do lỗi Gieo Mơ, bạn có thể liên hệ ngay với hotline <strong>0888670637</strong> để được hỗ trợ trong vòng 2 ngày kể từ khi nhận hàng.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2 text-balance">
              3. Tra cứu hành trình vận chuyển
            </h2>
            <p className="text-justify hyphens-auto break-words">
              Bạn có thể dễ dàng kiểm tra đơn hàng đang ở công đoạn nào bằng cách truy cập trang{" "}
              <Link href="/track" className="text-emerald-800 font-bold hover:underline">
                Tra cứu đơn hàng (`/track`)
              </Link>{" "}
              và nhập mã đơn hàng của bạn.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
