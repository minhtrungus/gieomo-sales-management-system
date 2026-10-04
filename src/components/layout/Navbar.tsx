"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/store/cart";
import dynamic from "next/dynamic";
import { ShoppingBag, Search, Menu, X } from "lucide-react";

import { getStoredSettings } from "@/lib/data/orderStore";

const CartDrawer = dynamic(
  () => import("@/components/cart/CartDrawer").then((mod) => mod.CartDrawer),
  { ssr: false }
);

const COVER_THEME_MAP: Record<string, { bg: string; text: string; label: string }> = {
  emerald: { bg: "bg-[#1B2B20]", text: "text-[#BFE9C3]", label: "✨ Dự án gây quỹ thiện nguyện Mầm Mơ — Little Pieces, Bigger Dreams" },
  "warm-autumn": { bg: "bg-[#422206]", text: "text-[#FFE7A8]", label: "🍂 Mùa Thu Ấm Áp — Mỗi món hàng là một yêu thương gửi đến trẻ em nghèo" },
  "dreamy-blue": { bg: "bg-[#102A45]", text: "text-[#CFE8FF]", label: "☁️ Giấc Mơ Mây — Đồng hành cùng các em nhỏ tại điểm trường vùng cao" },
  "pink-heart": { bg: "bg-[#451025]", text: "text-[#FFD1E1]", label: "🌸 Trái Tim Thiện Nguyện — 100% lợi nhuận gây quỹ nuôi em" },
};

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coverTheme, setCoverTheme] = useState("emerald");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      const s = getStoredSettings();
      if (s?.coverTheme) setCoverTheme(s.coverTheme);
    } catch {}

    const handleUpdate = () => {
      try {
        const s = getStoredSettings();
        if (s?.coverTheme) setCoverTheme(s.coverTheme);
      } catch {}
    };

    window.addEventListener("gieomo_settings_updated", handleUpdate);
    return () => window.removeEventListener("gieomo_settings_updated", handleUpdate);
  }, []);

  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0)
  );

  const navLinks = [
    { href: "/", label: "Trang chủ" },
    { href: "/products", label: "Sản phẩm" },
    { href: "/combos", label: "Combo" },
    { href: "/track", label: "Tra cứu đơn hàng" },
    { href: "/faq", label: "FAQ" },
  ];

  const currentTheme = COVER_THEME_MAP[coverTheme] || COVER_THEME_MAP.emerald;

  return (
    <>
      {/* Dynamic Campaign Announcement Ribbon (Controlled by Admin Settings Mục 3) */}
      <div className={`w-full py-1.5 px-4 text-center text-[11px] sm:text-xs font-bold transition-colors ${currentTheme.bg} ${currentTheme.text} shadow-xs`}>
        {currentTheme.label}
      </div>

      <header className="sticky top-0 z-40 w-full border-b border-[#F0E5D8] bg-[#FFF8EE] shadow-2xs">
        <div className="container mx-auto flex h-18 items-center justify-between px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* Brand Logo with Real Artwork */}
          <Link href="/" prefetch={true} className="flex items-center gap-3 group">
            <div className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-[#FFB98A] shadow-xs group-hover:scale-105 group-hover:rotate-3 transition-transform bg-white shrink-0">
              <Image
                src="/images/logo_gieo mơ.jpg"
                alt="Gieo Mơ Logo"
                fill
                sizes="44px"
                className="object-cover"
                priority
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-extrabold text-xl text-[#342A24] tracking-tight leading-none group-hover:text-[#2D6338] transition-colors">
                  Gieo Mơ
                </span>
                <span className="w-2 h-2 rounded-full bg-[#FFB98A] inline-block" />
              </div>
              <span className="text-[10px] text-[#7E7068] font-medium tracking-wide leading-tight mt-0.5">
                Little Pieces, Bigger Dreams
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 bg-white/70 px-3.5 py-1.5 rounded-full border border-[#F0E5D8] shadow-soft">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={true}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    isActive
                      ? "bg-[#BFE9C3] text-[#1B3622] shadow-xs"
                      : "text-[#5C4D44] hover:text-[#231B16] hover:bg-[#FFF4E5]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Search link */}
            <Link
              href="/products"
              prefetch={true}
              className="p-2 text-[#5C4D44] hover:text-[#231B16] hover:bg-[#FFF4E5] rounded-full transition-colors flex border border-[#F0E5D8] sm:border-transparent hover:border-[#F0E5D8]"
              title="Tìm kiếm sản phẩm"
            >
              <Search className="w-4 h-4" />
            </Link>

            {/* Cart Button */}
            <button
              onClick={() => setCartDrawerOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-bold text-xs transition-[transform,background-color] shadow-xs active:scale-95 border border-[#9ed4a3]"
            >
              <ShoppingBag className="w-4 h-4 text-[#1B3622]" />
              <span className="hidden sm:inline">Giỏ hàng</span>
              {mounted && itemCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#FFB98A] text-[#4A2603] text-[11px] font-extrabold leading-none shadow-xs border border-white">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-[#5C4D44] hover:bg-[#FFF4E5] md:hidden transition-colors border border-[#F0E5D8]"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#F0E5D8] bg-[#FFF8EE] px-4 pt-3 pb-5 space-y-2 shadow-lg animate-in slide-in-from-top-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                    isActive
                      ? "bg-[#BFE9C3] text-[#1B3622]"
                      : "text-[#5C4D44] hover:bg-[#FFF4E5]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Cart Drawer: Lazy loaded only when opened */}
      {cartDrawerOpen && (
        <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />
      )}
    </>
  );
}
