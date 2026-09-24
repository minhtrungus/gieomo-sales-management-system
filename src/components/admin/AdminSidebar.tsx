"use client";

import Link from "next/link";
import Image from "next/image";
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
  Bell,
  MapPin,
  MessageSquare,
} from "lucide-react";
import { useNotifications } from "@/lib/notifications/NotificationContext";

interface AdminSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();

  const menuItems = [
    { href: "/admin/dashboard", label: "Tổng quan (Dashboard)", icon: LayoutDashboard },
    { href: "/admin/notifications", label: "Hộp thư thông báo", icon: Bell, badge: unreadCount },
    { href: "/admin/orders", label: "Quản lý đơn hàng", icon: ShoppingBag },
    { href: "/admin/orders/create", label: "Nhập đơn hộ", icon: Package },
    { href: "/admin/products", label: "Sản phẩm", icon: Boxes },
    { href: "/admin/combos", label: "Set Combo", icon: Package },
    { href: "/admin/inventory", label: "Kiểm kho", icon: Warehouse },
    { href: "/admin/customers", label: "Khách hàng", icon: Users },
    { href: "/admin/payments", label: "Xác nhận thanh toán", icon: CreditCard },
    { href: "/admin/pickup-points", label: "Điểm nhận hàng", icon: MapPin },
    { href: "/admin/messages", label: "Tin nhắn khách", icon: MessageSquare },
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
          className="fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container with Warm Forest Moss Tone */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#16281D] text-[#E5DCD2] flex flex-col border-r border-[#263D2E] transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header with Official Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[#263D2E]">
          <Link href="/admin/dashboard" className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-[#BFE9C3] shadow-xs bg-white shrink-0">
              <Image
                src="/images/logo_gieo mơ.jpg"
                alt="Gieo Mơ Admin"
                fill
                sizes="32px"
                className="object-cover"
              />
            </div>
            <div>
              <span className="font-heading font-extrabold text-base text-white tracking-tight leading-none block">
                Gieo Mơ
              </span>
              <span className="text-[10px] text-[#BFE9C3] font-semibold">Admin Portal</span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#A39688] hover:text-white lg:hidden"
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
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                      isActive
                        ? "bg-[#16381D] text-[#BFE9C3]"
                        : "bg-[#FFB98A] text-[#4A2603]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer User Info */}
        <div className="p-4 border-t border-[#263D2E] flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-[#BFE9C3]/20 border border-[#BFE9C3]/40 flex items-center justify-center text-xs font-bold text-[#BFE9C3]">
              🌱
            </div>
            <div className="truncate">
              <span className="text-xs font-bold text-white block truncate">BTC Mầm Mơ</span>
              <span className="text-[10px] text-[#A39688] block truncate">Quản trị viên</span>
            </div>
          </div>

          <Link href="/admin/login" className="p-2 text-[#A39688] hover:text-[#FFB98A] transition-colors" title="Đăng xuất">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}
