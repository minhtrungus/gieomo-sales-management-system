"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Sparkles, Mail, Phone, MapPin } from "lucide-react";
import { useSiteSettings } from "@/lib/hooks/useSiteSettings";
import { OFFICIAL_STORE_CONFIG } from "@/lib/constants";

export function Footer() {
  const pathname = usePathname();
  const settings = useSiteSettings();

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
                  sizes="44px"
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
                <Link href="/" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Trang chủ</span>
                </Link>
              </li>
              <li>
                <Link href="/products" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/products")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Tất cả sản phẩm handmade</span>
                </Link>
              </li>
              <li>
                <Link href="/combos" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/combos")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
                  <span>Set Combo quà tặng tiết kiệm</span>
                </Link>
              </li>
              <li>
                <Link href="/track" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/track")} className="hover:text-[#BFE9C3] transition-colors flex items-center gap-1.5">
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
                <Link href="/faq" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/faq")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Hỏi đáp thường gặp (FAQ)</span>
                </Link>
              </li>
              <li>
                <Link href="/policy/delivery" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/policy/delivery")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Chính sách giao hàng (Freeship từ 200k)</span>
                </Link>
              </li>
              <li>
                <Link href="/policy/payment" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/policy/payment")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
                  <span>Hướng dẫn thanh toán VietQR & COD</span>
                </Link>
              </li>
              <li>
                <Link href="/contact" prefetch={false} onClick={(e) => handleFooterLinkClick(e, "/contact")} className="hover:text-[#FFE7A8] transition-colors flex items-center gap-1.5">
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
                <a href={`mailto:${settings.contactEmail}`} className="text-white hover:text-[#FFE7A8] transition-colors">
                  {settings.contactEmail}
                </a>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <a href={`tel:${settings.contactPhone}`} className="text-white font-bold hover:text-[#FFE7A8] transition-colors">
                  {settings.contactPhone}
                </a>
              </p>
              <p className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#FFB98A] shrink-0" />
                <span className="text-white">{settings.officeAddress || "TP. Hồ Chí Minh, Việt Nam"}</span>
              </p>
            </div>

            {/* Official Social Media Channels */}
            <div className="pt-3 border-t border-[#2F4234]/80">
              <span className="text-[11px] text-[#FFE7A8] block font-semibold mb-2">
                Mạng xã hội Mầm Mơ:
              </span>
              <div className="flex items-center gap-2.5">
                <a
                  href={OFFICIAL_STORE_CONFIG.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-[#293A2E] border border-[#3E5544] flex items-center justify-center text-white/90 hover:text-[#BFE9C3] hover:border-[#BFE9C3] transition-colors"
                  title="Fanpage Facebook Mầm Mơ"
                  aria-label="Fanpage Facebook Mầm Mơ"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </a>
                <a
                  href={OFFICIAL_STORE_CONFIG.socialLinks.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-[#293A2E] border border-[#3E5544] flex items-center justify-center text-white/90 hover:text-[#FFD1E1] hover:border-[#FFD1E1] transition-colors"
                  title="Kênh TikTok Mầm Mơ"
                  aria-label="Kênh TikTok Mầm Mơ"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-.88-.06A6.34 6.34 0 0 0 3.14 15.7a6.34 6.34 0 0 0 10.81 4.47c.01-.01.03-.02.04-.03v-8.19a8.28 8.28 0 0 0 5.6 2.15V10.6a4.84 4.84 0 0 1-3.77-3.91z" />
                  </svg>
                </a>
                <a
                  href={OFFICIAL_STORE_CONFIG.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-[#293A2E] border border-[#3E5544] flex items-center justify-center text-white/90 hover:text-[#FFE7A8] hover:border-[#FFE7A8] transition-colors"
                  title="Instagram Mầm Mơ"
                  aria-label="Instagram Mầm Mơ"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#2F4234] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/80 font-normal">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
            <p suppressHydrationWarning>© {new Date().getFullYear()} Gieo Mơ — Dự án gây quỹ của Mầm Mơ. Little Pieces, Bigger Dreams.</p>
            <span className="hidden sm:inline text-white/30">•</span>
            <span className="text-[11px] text-white/60 tracking-wide">
              Made with ❤️ by <span className="font-semibold text-white/90 hover:text-[#FFE7A8] transition-colors">mtus</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/policy/privacy" className="text-white/90 hover:text-white transition-colors underline-offset-2 hover:underline">
              Chính sách bảo mật
            </Link>
            <span>•</span>
            <Link href="/admin/login" className="text-white/20 hover:text-white/50 transition-colors text-[10px]">
              Quản trị
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
