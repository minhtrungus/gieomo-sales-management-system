"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/store/cart";
import dynamic from "next/dynamic";
import { ShoppingBag, Search, Menu, X, Sparkles } from "lucide-react";

const CartDrawer = dynamic(
  () => import("@/components/cart/CartDrawer").then((mod) => mod.CartDrawer),
  { ssr: false }
);

export function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const itemCount = useCartStore((state) => state.getItemCount());

  useEffect(() => {
    setMounted(true);
  }, []);

  const navLinks = [
    { href: "/", label: "Trang chủ" },
    { href: "/products", label: "Sản phẩm" },
    { href: "/combos", label: "Set Combo" },
    { href: "/track", label: "Tra cứu đơn" },
    { href: "/faq", label: "Hỏi đáp" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[#F0E5D8] bg-[#FFF8EE]/90 backdrop-blur-md transition-all">
        <div className="container mx-auto flex h-18 items-center justify-between px-4 sm:px-6">
          {/* Brand Logo with Real Artwork */}
          <Link href="/" className="flex items-center gap-3 group">
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
                <span className="w-2 h-2 rounded-full bg-[#FFB98A] inline-block animate-pulse-subtle" />
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
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
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
              className="p-2.5 text-[#5C4D44] hover:text-[#231B16] hover:bg-[#FFF4E5] rounded-full transition-colors hidden sm:flex border border-transparent hover:border-[#F0E5D8]"
              title="Tìm kiếm sản phẩm"
            >
              <Search className="w-4 h-4" />
            </Link>

            {/* Cart Button */}
            <button
              onClick={() => setCartDrawerOpen(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] font-bold text-xs transition-all shadow-xs active:scale-95 border border-[#9ed4a3]"
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
