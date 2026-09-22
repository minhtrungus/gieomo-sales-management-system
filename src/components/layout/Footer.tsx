import Link from "next/link";
import Image from "next/image";
import { Heart, Sparkles, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full bg-[#1C281F] text-[#EBE3D8] border-t border-[#2F4234] mt-auto relative overflow-hidden">
      {/* Decorative Pastel Stitch Line */}
      <div className="w-full border-t-2 border-dashed border-[#FFB98A]/40" />

      <div className="container mx-auto px-4 sm:px-6 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand Info with Mascot Logo */}
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-[#BFE9C3] shadow-xs shrink-0 bg-white">
                <Image
                  src="/images/logo_gieo mơ.jpg"
                  alt="Gieo Mơ"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-extrabold text-xl text-white tracking-tight">
                  Gieo Mơ
                </span>
                <span className="text-[10px] text-[#BFE9C3] font-medium tracking-wide">
                  Tạp hoá gây quỹ Mầm Mơ
                </span>
              </div>
            </Link>

            <p className="text-xs text-[#C8BEB2] leading-relaxed">
              Thế giới may vá nhỏ xinh của Mầm Mơ. Mỗi chiếc túi, chiếc kẹp handmade được tạo ra với tình thương và ước mơ gieo mầm tươi sáng cho trẻ em vùng cao.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#293A2E] border border-[#3E5544] text-[11px] text-[#FFE7A8] font-medium">
              <Sparkles className="w-3.5 h-3.5 text-[#FFB98A]" />
              <span>&quot;Little Pieces, Bigger Dreams&quot;</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-heading font-bold text-white text-sm mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#BFE9C3]" />
              Khám phá Gieo Mơ
            </h3>
            <ul className="space-y-2.5 text-xs text-[#C8BEB2]">
              <li>
                <Link href="/" className="hover:text-[#BFE9C3] transition-colors">
                  Trang chủ
                </Link>
              </li>
              <li>
                <Link href="/products" className="hover:text-[#BFE9C3] transition-colors">
                  Tất cả sản phẩm handmade
                </Link>
              </li>
              <li>
                <Link href="/combos" className="hover:text-[#BFE9C3] transition-colors">
                  Set Combo quà tặng tiết kiệm
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-[#BFE9C3] transition-colors">
                  Tra cứu hành trình đơn hàng
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Policies */}
          <div>
            <h3 className="font-heading font-bold text-white text-sm mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FFE7A8]" />
              Hỗ trợ & Chính sách
            </h3>
            <ul className="space-y-2.5 text-xs text-[#C8BEB2]">
              <li>
                <Link href="/faq" className="hover:text-[#FFE7A8] transition-colors">
                  Hỏi đáp thường gặp (FAQ)
                </Link>
              </li>
              <li>
                <Link href="/policy/delivery" className="hover:text-[#FFE7A8] transition-colors">
                  Chính sách giao hàng (Freeship từ 200k)
                </Link>
              </li>
              <li>
                <Link href="/policy/payment" className="hover:text-[#FFE7A8] transition-colors">
                  Hướng dẫn thanh toán VietQR & COD
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-[#FFE7A8] transition-colors">
                  Liên hệ Ban Tổ Chức Mầm Mơ
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="font-heading font-bold text-white text-sm mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#FFD1E1]" />
              Kết nối với Mầm
            </h3>
            <div className="space-y-3 text-xs text-[#C8BEB2]">
              <p className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span>gieomo@mammo.vn</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span>0123 456 789</span>
              </p>
              <p className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span>TP. Hồ Chí Minh, Việt Nam</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#2A3C2F] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#A39688]">
          <p>© 2026 Gieo Mơ — Dự án gây quỹ của Mầm Mơ. Little Pieces, Bigger Dreams.</p>
          <div className="flex items-center gap-4">
            <Link href="/policy/privacy" className="hover:text-white transition-colors">
              Chính sách bảo mật
            </Link>
            <span>•</span>
            <Link href="/admin/login" className="hover:text-[#BFE9C3] transition-colors font-medium">
              Quản trị (Admin Portal)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
