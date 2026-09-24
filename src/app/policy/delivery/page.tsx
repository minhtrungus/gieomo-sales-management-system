import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Link from "next/link";
import { Truck, ShieldCheck, Clock, PackageCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Chính sách giao hàng & vận chuyển | Gieo Mơ",
  description:
    "Thông tin chi tiết về cước phí vận chuyển toàn quốc, thời gian giao nhận hàng và quy trình đóng gói tỉ mỉ các sản phẩm thủ công từ Mầm Mơ.",
  alternates: {
    canonical: "/policy/delivery",
  },
  openGraph: {
    title: "Chính sách giao hàng & vận chuyển | Gieo Mơ",
    description:
      "Thông tin chi tiết về cước phí vận chuyển toàn quốc, thời gian giao nhận hàng và quy trình đóng gói tỉ mỉ các sản phẩm thủ công từ Mầm Mơ.",
  },
};

export default function DeliveryPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
            🚚 Vận chuyển & Giao nhận
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
            Chính sách giao hàng Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto">
            Thông tin chi tiết về cước phí, thời gian vận chuyển và quy trình đóng gói sản phẩm gây quỹ.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-soft-green/40 flex items-center justify-center text-emerald-900 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950">Phí giao hàng cố định</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Đồng giá <strong className="text-emerald-900">25.000đ</strong> cho tất cả các đơn hàng giao tận nơi trên toàn quốc.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-butter-yellow/60 flex items-center justify-center text-amber-900 shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950">Freeship đơn từ 200k</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                <strong className="text-emerald-900">Miễn phí 100%</strong> cước vận chuyển đối với mọi đơn hàng có giá trị từ 200.000đ.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-powder-blue/60 flex items-center justify-center text-blue-900 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950">Thời gian nhận hàng</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Nội thành TP.HCM: 1-2 ngày. Các tỉnh thành khác: 2-4 ngày làm việc.
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-soft-pink/50 flex items-center justify-center text-pink-900 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-emerald-950">Đóng gói cẩn thận</h3>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Sản phẩm handmade được bảo vệ cẩn thận bằng hộp giấy mầm môi trường kèm thiệp cảm ơn.
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Policy Text */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs space-y-6 text-sm text-gray-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              1. Quy trình xử lý đơn hàng
            </h2>
            <p>
              Ngay khi bạn đặt hàng thành công và hệ thống xác nhận thanh toán (hoặc chọn COD), tình nguyện viên của Mầm Mơ sẽ chuẩn bị sản phẩm, đóng gói cẩn thận và bàn giao cho đơn vị vận chuyển (GHN, GHTK, Viettel Post) trong vòng 24h.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              2. Kiểm tra hàng khi nhận (Đồng kiểm)
            </h2>
            <p>
              Gieo Mơ khuyến khích bạn kiểm tra tình trạng đóng gói ngoài hộp trước khi nhận từ shipper. Nếu sản phẩm bị hư hỏng, rách vỏ hộp hoặc không đúng mẫu, bạn có thể từ chối nhận và liên hệ ngay với hotline <strong>0123 456 789</strong> để được hỗ trợ gửi bù lập tức.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              3. Tra cứu hành trình vận chuyển
            </h2>
            <p>
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
