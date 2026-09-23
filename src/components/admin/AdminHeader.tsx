"use client";

import { useState, useRef, useEffect } from "react";
import {
  Menu,
  Bell,
  ExternalLink,
  Check,
  ShoppingBag,
  CreditCard,
  AlertTriangle,
  UserCheck,
  X,
  Inbox,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useNotifications, NotificationItem } from "@/lib/notifications/NotificationContext";

interface AdminHeaderProps {
  onOpenSidebar: () => void;
  title?: string;
}

export function AdminHeader({ onOpenSidebar, title }: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotifications,
  } = useNotifications();

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getRouteInfo = (path: string) => {
    if (path.includes("/admin/notifications"))
      return { title: "Hộp thư thông báo", breadcrumb: "Hộp thư hệ thống (Gmail View)" };
    if (path.includes("/admin/orders/create"))
      return { title: "Tạo đơn hàng hộ", breadcrumb: "Đơn hàng / Tạo đơn" };
    if (path.includes("/admin/orders"))
      return { title: "Quản lý đơn hàng", breadcrumb: "Đơn hàng & Vận chuyển" };
    if (path.includes("/admin/products/new"))
      return { title: "Thêm sản phẩm mới", breadcrumb: "Sản phẩm / Tạo mới" };
    if (path.includes("/admin/products"))
      return { title: "Kho sản phẩm", breadcrumb: "Sản phẩm & Danh mục" };
    if (path.includes("/admin/combos"))
      return { title: "Quản lý Set Combo", breadcrumb: "Sản phẩm / Set Combo" };
    if (path.includes("/admin/inventory"))
      return { title: "Kiểm kho & Nhập hàng", breadcrumb: "Kho hàng / Nhập xuất" };
    if (path.includes("/admin/customers"))
      return { title: "Danh sách khách hàng", breadcrumb: "Khách hàng & Liên hệ" };
    if (path.includes("/admin/payments"))
      return { title: "Xác nhận thanh toán", breadcrumb: "Tài chính / Đối soát VietQR" };
    if (path.includes("/admin/pickup-points"))
      return { title: "Quản lý Điểm nhận hàng", breadcrumb: "Vận chuyển / Điểm nhận" };
    if (path.includes("/admin/messages"))
      return { title: "Hộp thư liên hệ", breadcrumb: "Khách hàng / Tin nhắn" };
    if (path.includes("/admin/vouchers"))
      return { title: "Mã giảm giá", breadcrumb: "Khuyến mãi / Voucher" };
    if (path.includes("/admin/members"))
      return { title: "Thành viên & Referral", breadcrumb: "Ban Tổ Chức / Tiếp thị" };
    if (path.includes("/admin/reports"))
      return { title: "Báo cáo doanh thu", breadcrumb: "Thống kê / Gây quỹ" };
    if (path.includes("/admin/settings"))
      return { title: "Cài đặt hệ thống", breadcrumb: "Cấu hình & Thương hiệu" };
    return { title: "Tổng quan (Dashboard)", breadcrumb: "Bảng điều khiển trung tâm" };
  };

  const routeInfo = getRouteInfo(pathname);
  const displayTitle = title || routeInfo.title;

  const handleNotificationClick = (item: NotificationItem) => {
    markAsRead([item.id]);
    setNotificationsOpen(false);
    router.push(item.link);
  };

  const getIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "order":
        return <ShoppingBag className="w-4 h-4 text-[#2D6338]" />;
      case "payment":
        return <CreditCard className="w-4 h-4 text-[#E2884E]" />;
      case "stock":
        return <AlertTriangle className="w-4 h-4 text-[#DD6B20]" />;
      case "member":
        return <UserCheck className="w-4 h-4 text-[#3182CE]" />;
      default:
        return <Bell className="w-4 h-4 text-[#2D6338]" />;
    }
  };

  const formatShortTime = (isoString: string) => {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return new Date(isoString).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    });
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#F0E5D8] px-4 sm:px-6 flex items-center justify-between shadow-2xs">
      {/* Left side: Mobile Menu + Dynamic Breadcrumbs & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-[#5C4D44] hover:bg-[#FFF8EE] lg:hidden transition-colors border border-[#F0E5D8]"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-[#A89B92] leading-none mb-1">
            <span>Admin Gieo Mơ</span>
            <ChevronRight className="w-3 h-3 text-[#D1C6BD]" />
            <span className="text-[#7E7068] font-semibold">{routeInfo.breadcrumb}</span>
          </div>
          <h1 className="font-heading font-extrabold text-base sm:text-lg text-[#231B16] leading-none tracking-tight">
            {displayTitle}
          </h1>
        </div>
      </div>

      {/* Right side: Clean Action Cluster (View Storefront + Notification Bell + Admin Profile) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick View Public Storefront Link */}
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF8EE] text-[#16381D] text-xs font-bold hover:bg-[#BFE9C3]/50 transition-colors border border-[#F0E5D8]"
          title="Mở trang bán hàng công khai trong tab mới"
        >
          <span className="hidden sm:inline">Trang bán hàng</span>
          <ExternalLink className="w-3.5 h-3.5 text-[#2D6338]" />
        </Link>

        {/* Notifications Dropdown Container */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2.5 rounded-full text-[#5C4D44] hover:bg-[#FFF8EE] transition-colors border border-[#F0E5D8] cursor-pointer"
            title="Trung tâm thông báo"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <>
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500" />
              </>
            )}
          </button>

          {/* Notification Popover Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl border border-[#F0E5D8] shadow-2xl overflow-hidden z-50 animate-in zoom-in-95">
              {/* Header */}
              <div className="p-4 bg-[#FFF8EE] border-b border-[#F0E5D8] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-extrabold text-sm text-[#231B16]">
                    Thông báo hệ thống
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FFB98A] text-[#4A2603] text-[10px] font-extrabold">
                      {unreadCount} mới
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    onClick={() => markAsRead(notifications.filter((n) => !n.read).map((n) => n.id))}
                    className="text-[11px] font-bold text-[#2D6338] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã đọc tất cả</span>
                  </button>
                )}
              </div>

              {/* Notification List Preview (Top 5 items) */}
              <div className="max-h-80 overflow-y-auto divide-y divide-[#F0E5D8] scrollbar-none">
                {notifications.length > 0 ? (
                  notifications.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`p-3.5 flex items-start gap-3 hover:bg-[#FFFDF9] transition-colors cursor-pointer relative ${
                        !item.read ? "bg-[#BFE9C3]/10" : ""
                      }`}
                    >
                      <div className="w-8 h-8 rounded-xl bg-white border border-[#F0E5D8] flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                        {getIcon(item.type)}
                      </div>

                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-xs font-bold truncate ${
                              !item.read ? "text-[#231B16]" : "text-[#5C4D44]"
                            }`}
                          >
                            {item.title}
                          </span>
                          <span className="text-[10px] text-[#A89B92] shrink-0">
                            {formatShortTime(item.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#7E7068] leading-relaxed line-clamp-2">
                          {item.desc}
                        </p>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotifications([item.id]);
                        }}
                        className="text-[#A89B92] hover:text-red-500 p-1 rounded-lg transition-colors shrink-0"
                        title="Xóa thông báo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-xs text-[#A89B92]">
                    Không có thông báo nào
                  </div>
                )}
              </div>

              {/* Footer: Direct Link to Gmail-style Notifications Page */}
              <div className="p-3 bg-[#FFF8EE] border-t border-[#F0E5D8] flex items-center justify-center">
                <Link
                  href="/admin/notifications"
                  onClick={() => setNotificationsOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#2D6338] hover:text-[#1E4525] hover:underline"
                >
                  <Inbox className="w-4 h-4" />
                  <span>Mở toàn bộ hộp thư thông báo (50/trang kiểu Gmail) ➔</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Admin Profile Pill */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#F0E5D8]">
          <div className="relative w-8 h-8 rounded-full overflow-hidden border border-[#BFE9C3] shadow-2xs bg-white shrink-0">
            <Image
              src="/images/logo_gieo mơ.jpg"
              alt="Admin BTC"
              fill
              className="object-cover"
            />
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#231B16]">Admin Mầm Mơ</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Online" />
            </div>
            <span className="text-[10px] text-[#2D6338] font-bold bg-[#BFE9C3]/40 px-1.5 py-0.2 rounded-md">
              Ban Tổ Chức
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
