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
    <header className="h-14 bg-white border-b border-gray-100 flex lg:hidden items-center justify-between px-4 sticky top-0 z-30 shadow-xs">
      {/* Left: Mobile Toggle & Page Info */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 rounded-xl text-gray-700 hover:text-gray-900 hover:bg-gray-100 cursor-pointer"
          aria-label="Mở menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5">
          <span className="font-heading font-extrabold text-sm text-[#231B16]">
            Gieo Mơ
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EBF7EE] text-[#16381D] border border-[#BFE9C3]">
            BTC Sale
          </span>
        </div>
      </div>

      {/* Right: User avatar */}
      <div className="flex items-center gap-2">
        {session?.role === "admin" && (
          <Link
            href="/admin/orders"
            className="px-2.5 py-1 rounded-xl text-[10px] font-extrabold bg-[#FFE7A8] text-[#542B07] border border-[#ebd089] hover:bg-[#fedb80] transition-colors"
          >
            Về Admin
          </Link>
        )}
        <div className="w-8 h-8 rounded-full bg-soft-green text-[#16381D] font-bold text-xs flex items-center justify-center border border-emerald-200">
          🌱
        </div>
      </div>
    </header>
  );
}
