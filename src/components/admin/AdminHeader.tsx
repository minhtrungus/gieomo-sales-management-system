"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Bell, Search, ExternalLink, Check, Trash2, ShoppingBag, CreditCard, AlertTriangle, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AdminHeaderProps {
  onOpenSidebar: () => void;
  title?: string;
}

interface NotificationItem {
  id: string;
  type: "order" | "payment" | "stock" | "member";
  title: string;
  desc: string;
  time: string;
  read: boolean;
  link: string;
}

export function AdminHeader({ onOpenSidebar, title }: AdminHeaderProps) {
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "notif-1",
      type: "order",
      title: "Đơn hàng mới #GM-1004",
      desc: "Khách hàng Trần Thu Hà vừa đặt 2 sản phẩm (245.000đ)",
      time: "5 phút trước",
      read: false,
      link: "/admin/orders",
    },
    {
      id: "notif-2",
      type: "payment",
      title: "Chờ xác nhận VietQR",
      desc: "Giao dịch 245.000đ nội dung GM1004 đang chờ đối soát",
      time: "12 phút trước",
      read: false,
      link: "/admin/payments",
    },
    {
      id: "notif-3",
      type: "stock",
      title: "Cảnh báo tồn kho thấp",
      desc: "Kẹp tóc Nút Áo (GM-KEPTOC-01) chỉ còn 3 sản phẩm trong kho",
      time: "1 giờ trước",
      read: false,
      link: "/admin/inventory",
    },
    {
      id: "notif-4",
      type: "member",
      title: "Thành viên chốt đơn",
      desc: "Tình nguyện viên Mai Lan vừa chốt đơn qua mã MAM-LAN",
      time: "2 giờ trước",
      read: true,
      link: "/admin/members",
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

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

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
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
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#F0E5D8] px-4 sm:px-6 flex items-center justify-between">
      {/* Left side */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="p-2 rounded-xl text-[#5C4D44] hover:bg-[#FFF8EE] lg:hidden transition-colors border border-[#F0E5D8]"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h1 className="font-heading font-extrabold text-lg text-[#231B16] truncate">
          {title || "Quản trị Gieo Mơ"}
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Quick View Public Storefront Link */}
        <Link
          href="/"
          target="_blank"
          className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FFF8EE] text-[#16381D] text-xs font-bold hover:bg-[#BFE9C3]/50 transition-colors border border-[#F0E5D8]"
        >
          <span>Trang bán hàng</span>
          <ExternalLink className="w-3.5 h-3.5 text-[#2D6338]" />
        </Link>

        {/* Search */}
        <div className="relative hidden md:block w-48 lg:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#A89B92]" />
          <input
            type="text"
            placeholder="Tìm đơn hàng, sản phẩm..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-[#F0E5D8] focus:border-[#FFB98A] outline-none bg-[#FFFDF9]"
          />
        </div>

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
                    onClick={markAllAsRead}
                    className="text-[11px] font-bold text-[#2D6338] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Đã đọc tất cả</span>
                  </button>
                )}
              </div>

              {/* Notification List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-[#F0E5D8] scrollbar-none">
                {notifications.length > 0 ? (
                  notifications.map((item) => (
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

                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${!item.read ? "text-[#231B16]" : "text-[#5C4D44]"}`}>
                            {item.title}
                          </span>
                          <span className="text-[10px] text-[#A89B92]">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-[#7E7068] leading-relaxed line-clamp-2">
                          {item.desc}
                        </p>
                      </div>

                      <button
                        onClick={(e) => clearNotification(item.id, e)}
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

              {/* Footer */}
              <div className="p-2.5 bg-[#FFF8EE] border-t border-[#F0E5D8] text-center">
                <Link
                  href="/admin/orders"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-xs font-bold text-[#2D6338] hover:underline"
                >
                  Xem tất cả đơn hàng & giao dịch ➔
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
