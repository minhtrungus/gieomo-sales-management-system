"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sparkles, Mail, Phone, MapPin } from "lucide-react";

export function Footer() {
  const pathname = usePathname();

  const handleFooterLinkClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (pathname === href) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [pathname]
  );

  return (
    <footer className="w-full bg-[#1C281F] text-white border-t border-[#2F4234] mt-auto relative overflow-hidden">
      {/* Decorative Pastel Stitch Line */}
      <div className="w-full border-t-2 border-dashed border-[#FFB98A]/50" />

      <div className="container mx-auto px-4 sm:px-6 py-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand Info with Mascot Logo */}
          <div className="md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-[#BFE9C3] shadow-xs shrink-0 bg-white">
                <Image
                  src="/images/logo_gieo mơ.jpg"
                  alt="Gieo Mơ"
                  fill
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-heading font-extrabold text-2xl text-white tracking-tight">
                  Gieo Mơ
                </span>
                <span className="text-[11px] text-[#BFE9C3] font-bold tracking-wide">
                  Tạp hoá gây quỹ Mầm Mơ
                </span>
              </div>
            </Link>

            <p className="text-xs text-white/90 leading-relaxed font-normal">
              Thế giới may vá nhỏ xinh của Mầm Mơ. Mỗi chiếc túi, chiếc kẹp handmade được tạo ra với tình thương và ước mơ gieo mầm tươi sáng cho trẻ em vùng cao.
            </p>

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#293A2E] border border-[#3E5544] text-xs text-[#FFE7A8] font-bold shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#FFB98A]" />
              <span>&quot;Little Pieces, Bigger Dreams&quot;</span>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-heading font-bold text-white !text-white text-sm mb-4 flex items-center gap-2" style={{ color: '#FFFFFF' }}>
              <span className="w-2 h-2 rounded-full bg-[#BFE9C3]" />
              Khám phá Gieo Mơ
            </h3>
            <ul className="space-y-2.5 text-xs text-white/90 font-medium">
              <li>
                <Link href="/" onClick={(e) => handleFooterLinkClick(e, "/")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Trang chủ</span>
                </Link>
              </li>
              <li>
                <Link href="/products" onClick={(e) => handleFooterLinkClick(e, "/products")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Tất cả sản phẩm handmade</span>
                </Link>
              </li>
              <li>
                <Link href="/combos" onClick={(e) => handleFooterLinkClick(e, "/combos")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Set Combo quà tặng tiết kiệm</span>
                </Link>
              </li>
              <li>
                <Link href="/track" onClick={(e) => handleFooterLinkClick(e, "/track")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Tra cứu hành trình đơn hàng</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Support & Policies */}
          <div>
            <h3 className="font-heading font-bold text-white !text-white text-sm mb-4 flex items-center gap-2" style={{ color: '#FFFFFF' }}>
              <span className="w-2 h-2 rounded-full bg-[#FFE7A8]" />
              Hỗ trợ & Chính sách
            </h3>
            <ul className="space-y-2.5 text-xs text-white/90 font-medium">
              <li>
                <Link href="/faq" onClick={(e) => handleFooterLinkClick(e, "/faq")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Hỏi đáp thường gặp (FAQ)</span>
                </Link>
              </li>
              <li>
                <Link href="/policy/delivery" onClick={(e) => handleFooterLinkClick(e, "/policy/delivery")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Chính sách giao hàng (Freeship từ 200k)</span>
                </Link>
              </li>
              <li>
                <Link href="/policy/payment" onClick={(e) => handleFooterLinkClick(e, "/policy/payment")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Hướng dẫn thanh toán VietQR & COD</span>
                </Link>
              </li>
              <li>
                <Link href="/contact" onClick={(e) => handleFooterLinkClick(e, "/contact")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Liên hệ Ban Tổ Chức Mầm Mơ</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Details */}
          <div>
            <h3 className="font-heading font-bold text-white !text-white text-sm mb-4 flex items-center gap-2" style={{ color: '#FFFFFF' }}>
              <span className="w-2 h-2 rounded-full bg-[#FFD1E1]" />
              Kết nối với Mầm
            </h3>
            <div className="space-y-3.5 text-xs text-white/90 font-medium">
              <p className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span className="text-white">gieomo@mammo.vn</span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span className="text-white font-bold">0123 456 789</span>
              </p>
              <p className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span className="text-white">TP. Hồ Chí Minh, Việt Nam</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#2F4234] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/80 font-normal">
          <p>© {new Date().getFullYear()} Gieo Mơ — Dự án gây quỹ của Mầm Mơ. Little Pieces, Bigger Dreams.</p>
          <div className="flex items-center gap-4">
            <Link href="/policy/privacy" className="text-white/90 hover:text-white transition-colors underline-offset-2 hover:underline">
              Chính sách bảo mật
            </Link>
            <span>•</span>
            <Link href="/admin/login" className="text-white/30 hover:text-white/60 transition-colors text-[11px]">
              Quản trị
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
