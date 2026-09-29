"use client";

import { Menu, Copy, Check, ExternalLink, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getAdminSession, type AdminSession } from "@/lib/data/orderStore";

interface SaleHeaderProps {
  onToggleSidebar: () => void;
}

export function SaleHeader({ onToggleSidebar }: SaleHeaderProps) {
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

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30 shadow-xs">
      {/* Left: Mobile Toggle & Page Info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 lg:hidden cursor-pointer"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-heading font-extrabold text-sm sm:text-base text-[#231B16]">
            Cổng Thành Viên Gây Quỹ
          </span>
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#EBF7EE] text-[#16381D] border border-[#BFE9C3]">
            BTC Sale
          </span>
        </div>
      </div>

      {/* Right: Referral Link Copy & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {session?.referralCode && (
          <button
            onClick={handleCopyReferralLink}
            className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              copiedLink
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
            }`}
            title="Sao chép liên kết bán hàng gắn mã giới thiệu của bạn"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Đã chép link!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Link của tôi ({session.referralCode})</span>
              </>
            )}
          </button>
        )}

        <Link
          href="/"
          target="_blank"
          className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-[#16381D] bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-xl border border-gray-200 transition-colors"
        >
          <span>Trang bán hàng</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        {session?.role === "admin" && (
          <Link
            href="/admin/dashboard"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-xl border border-amber-200 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Về Admin</span>
          </Link>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
          <div className="w-8 h-8 rounded-full bg-soft-green text-[#16381D] font-bold text-xs flex items-center justify-center border border-emerald-200">
            🌱
          </div>
          <div className="hidden sm:block text-left">
            <span className="text-xs font-bold text-gray-800 block leading-tight">
              {session?.name || "Thành viên"}
            </span>
            <span className="text-[10px] text-gray-400 block leading-none">
              {session?.email || ""}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
