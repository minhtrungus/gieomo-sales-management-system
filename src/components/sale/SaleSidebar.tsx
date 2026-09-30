"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  PackagePlus,
  Boxes,
  UserCheck,
  LogOut,
  X,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import { clearAdminSession, getAdminSession, type AdminSession } from "@/lib/data/orderStore";

interface SaleSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SaleSidebar({ isOpen, onClose }: SaleSidebarProps) {
  const pathname = usePathname();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const updateSession = () => setSession(getAdminSession());
    updateSession();
    window.addEventListener("gieomo_admin_auth_changed", updateSession);
    return () => window.removeEventListener("gieomo_admin_auth_changed", updateSession);
  }, []);

  const handleCopyReferralLink = () => {
    if (!session?.referralCode) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gieomo.store";
    const refLink = `${origin}/?ref=${session.referralCode}`;
    navigator.clipboard.writeText(refLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const menuItems = [
    { href: "/sale", label: "Tổng quan cá nhân", icon: LayoutDashboard },
    { href: "/sale/create-order", label: "Nhập đơn hộ", icon: PackagePlus },
    { href: "/sale/orders", label: "Đơn hàng của tôi", icon: ShoppingBag },
    { href: "/sale/products", label: "Tra cứu sản phẩm", icon: Boxes },
    { href: "/sale/profile", label: "Tài khoản cá nhân", icon: UserCheck },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#16281D] text-[#E5DCD2] flex flex-col border-r border-[#263D2E] transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header with Brand Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[#263D2E]">
          <Link href="/sale" className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-[#BFE9C3] shadow-xs bg-white shrink-0">
              <Image
                src="/images/logo_gieo mơ.jpg"
                alt="Gieo Mơ"
                fill
                sizes="32px"
                className="object-cover"
              />
            </div>
            <div>
              <span className="font-heading font-extrabold text-base text-white tracking-tight leading-none block">
                Gieo Mơ
              </span>
              <span className="text-[10px] text-[#BFE9C3] font-semibold flex items-center gap-1 mt-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                Cổng Thành Viên
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#A39688] hover:text-white lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member Referral Box with Copy Link */}
        {session?.referralCode && (
          <div className="mx-3 mt-3 p-3 rounded-2xl bg-[#203728] border border-[#2E4E38] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#A39688]">Mã giới thiệu:</span>
              <span className="font-mono text-xs font-bold text-[#BFE9C3] bg-[#16281D] px-2 py-0.5 rounded border border-[#BFE9C3]/30">
                {session.referralCode}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyReferralLink}
              className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                copiedLink
                  ? "bg-[#BFE9C3] text-[#16281D] shadow-xs"
                  : "bg-[#16281D] hover:bg-[#284533] text-[#BFE9C3] border border-[#BFE9C3]/40"
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#16281D]" />
                  <span>Đã sao chép link!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép link bán hàng</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Menu Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-none">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/sale"
                ? pathname === "/sale"
                : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={onClose}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-[#BFE9C3] text-[#16381D] shadow-xs"
                    : "text-[#C8BEB2] hover:bg-[#203728] hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#16381D]" : "text-[#BFE9C3]"}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-3 border-t border-[#263D2E]/60 my-2">
            <Link
              href="/"
              target="_blank"
              className="flex items-center justify-between px-3.5 py-2 rounded-xl text-[11px] font-semibold text-[#A39688] hover:bg-[#203728] hover:text-white transition-colors"
            >
              <span>Trang bán hàng Gieo Mơ</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </nav>

        {/* Footer User Info */}
        <div className="p-4 border-t border-[#263D2E] flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-[#BFE9C3]/20 border border-[#BFE9C3]/40 flex items-center justify-center text-xs font-bold text-[#BFE9C3] shrink-0">
              🌱
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block truncate">
                {session?.name || "Thành viên"}
              </span>
              <span className="text-[10px] text-[#A39688] block truncate">
                Thành viên (BTC Sale)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              clearAdminSession();
              window.location.href = "/admin/login";
            }}
            className="p-2 text-[#A39688] hover:text-[#FFB98A] transition-colors cursor-pointer"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </>
  );
}
