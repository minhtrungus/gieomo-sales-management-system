"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Boxes,
  Users,
  CreditCard,
  Ticket,
  UserCheck,
  BarChart3,
  Settings,
  LogOut,
  X,
  Warehouse,
} from "lucide-react";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();

  const menuItems = [
    { href: "/admin/dashboard", label: "Tổng quan (Dashboard)", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Quản lý đơn hàng", icon: ShoppingBag },
    { href: "/admin/orders/create", label: "Nhập đơn hộ", icon: Package },
    { href: "/admin/products", label: "Sản phẩm", icon: Boxes },
    { href: "/admin/combos", label: "Set Combo", icon: Package },
    { href: "/admin/inventory", label: "Kiểm kho", icon: Warehouse },
    { href: "/admin/customers", label: "Khách hàng", icon: Users },
    { href: "/admin/payments", label: "Xác nhận thanh toán", icon: CreditCard },
    { href: "/admin/vouchers", label: "Mã giảm giá", icon: Ticket },
    { href: "/admin/members", label: "Thành viên & Referral", icon: UserCheck },
    { href: "/admin/reports", label: "Báo cáo doanh thu", icon: BarChart3 },
    { href: "/admin/settings", label: "Cài đặt hệ thống", icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden backdrop-blur-xs transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-emerald-950 text-emerald-100 flex flex-col border-r border-emerald-900 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-emerald-900">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-soft-green flex items-center justify-center text-emerald-950 font-bold text-sm">
              🌱
            </div>
            <div>
              <span className="font-heading font-extrabold text-lg text-white tracking-tight leading-none block">
                Gieo Mơ
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">Admin Portal</span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-emerald-400 hover:text-white lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-none">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-soft-green text-emerald-950 font-bold shadow-2xs"
                    : "text-emerald-200/80 hover:bg-emerald-900/60 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-950" : "text-emerald-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer User Info */}
        <div className="p-4 border-t border-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-soft-green/30 border border-soft-green/50 flex items-center justify-center text-xs font-bold text-soft-green">
              AD
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block truncate">BTC Mầm Mơ</span>
              <span className="text-[10px] text-emerald-400 block truncate">Admin Role</span>
            </div>
          </div>

          <Link href="/admin/login" className="p-2 text-emerald-400 hover:text-red-400 transition-colors" title="Đăng xuất">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}
