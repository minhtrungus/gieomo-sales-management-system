"use client";

import { Menu, Bell, Search, ExternalLink } from "lucide-react";
import Link from "next/link";

interface AdminHeaderProps {
  onOpenSidebar: () => void;
  title?: string;
}

export function AdminHeader({ onOpenSidebar, title }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 lg:hidden transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="font-heading font-extrabold text-lg text-emerald-950 truncate">
          {title || "Quản trị Gieo Mơ"}
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Quick View Public Storefront Link */}
        <Link
          href="/"
          target="_blank"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
        >
          <span>Trang bán hàng</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        {/* Search */}
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm đơn hàng, sản phẩm..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:border-soft-green outline-none"
          />
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
          title="Thông báo mới"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
        </button>
      </div>
    </header>
  );
}
