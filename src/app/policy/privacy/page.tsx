import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Lock, Shield, EyeOff, UserCheck } from "lucide-react";
import { getSystemSettingsServer } from "@/lib/services/configService";

export const metadata: Metadata = {
  title: "Chính sách bảo mật thông tin | Gieo Mơ",
  description:
    "Cam kết bảo mật tuyệt đối thông tin khách hàng ủng hộ dự án gây quỹ Gieo Mơ. Minh bạch chính sách lưu trữ, bảo mật dữ liệu và quyền riêng tư cá nhân.",
  alternates: {
    canonical: "/policy/privacy",
  },
  openGraph: {
    title: "Chính sách bảo mật thông tin | Gieo Mơ",
    description:
      "Cam kết bảo mật tuyệt đối thông tin khách hàng ủng hộ dự án gây quỹ Gieo Mơ. Minh bạch chính sách lưu trữ, bảo mật dữ liệu và quyền riêng tư cá nhân.",
  },
};

export default async function PrivacyPolicyPage() {
  const settings = await getSystemSettingsServer();
  return (
    <div className="min-h-screen flex flex-col bg-cream/60">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 py-8 md:py-12 max-w-4xl">
        {/* Header section */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-green/50 text-emerald-900 text-xs font-bold">
            🔒 Bảo mật thông tin
          </div>
          <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-emerald-950">
            Chính sách bảo mật Gieo Mơ
          </h1>
          <p className="text-gray-600 text-sm max-w-xl mx-auto">
            Cam kết tôn trọng và bảo vệ tuyệt đối thông tin cá nhân của khách hàng ủng hộ dự án gây quỹ.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-soft-green/40 flex items-center justify-center text-emerald-900 mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-sm text-emerald-950">Mã hóa an toàn</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Mọi dữ liệu đặt hàng được mã hóa truyền nhận an toàn qua SSL/TLS.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-powder-blue/60 flex items-center justify-center text-blue-900 mx-auto">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-sm text-emerald-950">Không bán dữ liệu</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Tuyệt đối không chia sẻ hoặc bán thông tin cá nhân cho bên thứ ba.
            </p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-2xs text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-butter-yellow/60 flex items-center justify-center text-amber-900 mx-auto">
              <UserCheck className="w-5 h-5" />
            </div>
            <h3 className="font-heading font-bold text-sm text-emerald-950">Quyền riêng tư</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Bạn có quyền yêu cầu tra cứu, chỉnh sửa hoặc xóa thông tin bất kỳ lúc nào.
            </p>
          </div>
        </div>

        {/* Detailed Policy Sections */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-2xs space-y-6 text-sm text-gray-700 leading-relaxed">
          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              1. Thu thập thông tin cá nhân (PII)
            </h2>
            <p>
              Khi bạn đặt hàng trên Gieo Mơ, chúng mình chỉ thu thập các thông tin tối thiểu cần thiết để giao nhận sản phẩm: Họ tên người nhận, Số điện thoại liên hệ, Địa chỉ giao hàng và Ghi chú đơn hàng.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              2. Mục đích sử dụng thông tin
            </h2>
            <p>Thông tin của bạn được sử dụng duy nhất cho các mục đích:</p>
            <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm pl-2 text-gray-700">
              <li>Xác nhận đơn hàng và in nhãn giao hàng cho đối tác vận chuyển.</li>
              <li>Gửi thông báo tiến độ giao hàng hoặc liên hệ hỗ trợ khi có sự cố.</li>
              <li>Báo cáo tổng kết gây quỹ (chỉ hiển thị thông tin danh tính ẩn danh như N.V.A).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              3. Lưu trữ & Bảo vệ dữ liệu
            </h2>
            <p>
              Dữ liệu đơn hàng được lưu trữ trên cơ sở dữ liệu Supabase được bảo vệ bằng các chính sách truy cập nghiêm ngặt (Row Level Security). Chỉ các thành viên BTC được phân quyền mới có thể truy cập thông tin đơn hàng để đóng gói.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading font-bold text-lg text-emerald-950 border-b border-emerald-50 pb-2">
              4. Liên hệ thắc mắc về quyền riêng tư
            </h2>
            <p>
              Nếu bạn có bất kỳ câu hỏi hoặc yêu cầu nào về bảo mật thông tin cá nhân, vui lòng gửi email về <strong>{settings.contactEmail}</strong> hoặc hotline <strong>{settings.contactPhone}</strong>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
