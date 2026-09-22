"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartStore } from "@/store/cart";
import { CartDrawer } from "@/components/cart/CartDrawer";

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
    { href: "/faq", label: "Hỏi đáp (FAQ)" },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-soft-green/30 bg-cream/90 backdrop-blur-md transition-all">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-soft-green flex items-center justify-center text-emerald-800 font-bold shadow-sm transition-transform group-hover:scale-105 group-hover:rotate-3">
              🌱
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-extrabold text-xl text-emerald-950 tracking-tight leading-none group-hover:text-emerald-700 transition-colors">
                Gieo Mơ
              </span>
              <span className="text-[10px] text-emerald-700/80 font-medium tracking-wide leading-tight">
                Little Pieces, Bigger Dreams
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1 bg-white/60 px-3 py-1.5 rounded-full border border-emerald-100 shadow-xs">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                    isActive
                      ? "bg-soft-green text-emerald-950 font-semibold shadow-2xs"
                      : "text-gray-700 hover:text-emerald-800 hover:bg-emerald-50/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Search Link */}
            <Link
              href="/products"
              className="p-2 text-gray-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-full transition-colors hidden sm:flex"
              title="Tìm kiếm sản phẩm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </Link>

            {/* Cart Button */}
            <button
              onClick={() => setCartDrawerOpen(true)}
              className="relative flex items-center gap-2 px-3.5 py-2 rounded-full bg-soft-green/70 hover:bg-soft-green text-emerald-950 font-medium text-sm transition-all shadow-xs active:scale-95"
            >
              <svg className="w-5 h-5 text-emerald-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span className="hidden sm:inline font-semibold">Giỏ hàng</span>
              {mounted && itemCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-warm-orange text-orange-950 text-xs font-bold leading-none animate-pulse">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-gray-700 hover:bg-emerald-50 md:hidden transition-colors"
              aria-label="Toggle Menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-emerald-100 bg-cream px-4 pt-3 pb-5 space-y-2 shadow-lg animate-in slide-in-from-top-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-soft-green text-emerald-950 font-bold"
                      : "text-gray-700 hover:bg-emerald-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Cart Drawer */}
      <CartDrawer isOpen={cartDrawerOpen} onClose={() => setCartDrawerOpen(false)} />
    </>
  );
}
