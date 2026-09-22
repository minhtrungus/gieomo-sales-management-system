"use client";

import React, { useState, useMemo } from "react";
import {
  useNotifications,
  NotificationItem,
  NotificationType,
} from "@/lib/notifications/NotificationContext";
import {
  Inbox,
  Mail,
  MailOpen,
  Trash2,
  Star,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  CreditCard,
  AlertTriangle,
  UserCheck,
  Bell,
  CheckSquare,
  Square,
  MinusSquare,
  Sparkles,
  ExternalLink,
  X,
  Filter,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";

const ITEMS_PER_PAGE = 50;

type FilterTab = "all" | "unread" | "starred" | "order" | "payment" | "stock" | "member";

export default function NotificationsPage() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    autoPushEnabled,
    setAutoPushEnabled,
    markAsRead,
    markAsUnread,
    toggleStar,
    deleteNotifications,
    triggerTestPush,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  // Filter notifications by Tab and Search
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Tab filter
      if (activeTab === "unread" && item.read) return false;
      if (activeTab === "starred" && !item.starred) return false;
      if (
        activeTab !== "all" &&
        activeTab !== "unread" &&
        activeTab !== "starred" &&
        item.type !== activeTab
      ) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesDesc = item.desc.toLowerCase().includes(query);
        const matchesCode = item.meta?.order_code?.toLowerCase().includes(query);
        const matchesCustomer = item.meta?.customer?.toLowerCase().includes(query);
        return matchesTitle || matchesDesc || matchesCode || matchesCustomer;
      }

      return true;
    });
  }, [notifications, activeTab, searchQuery]);

  // Pagination calculation: 50 items per page
  const totalItems = filteredNotifications.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const effectivePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const startIndex = (effectivePage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredNotifications, effectivePage]);

  const startIndex = totalItems === 0 ? 0 : (effectivePage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(effectivePage * ITEMS_PER_PAGE, totalItems);

  // Selection handlers
  const isAllCurrentPageSelected =
    paginatedItems.length > 0 &&
    paginatedItems.every((item) => selectedIds.includes(item.id));
  const isSomeCurrentPageSelected =
    paginatedItems.some((item) => selectedIds.includes(item.id)) &&
    !isAllCurrentPageSelected;

  const handleToggleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      // Deselect current page items
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedItems.some((item) => item.id === id))
      );
    } else {
      // Select all current page items
      const pageIds = paginatedItems.map((item) => item.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Batch actions
  const handleBatchMarkAsRead = () => {
    if (selectedIds.length === 0) return;
    markAsRead(selectedIds);
    setSelectedIds([]);
  };

  const handleBatchMarkAsUnread = () => {
    if (selectedIds.length === 0) return;
    markAsUnread(selectedIds);
    setSelectedIds([]);
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) return;
    deleteNotifications(selectedIds);
    setSelectedIds([]);
  };

  const handleSelectNotification = (item: NotificationItem) => {
    markAsRead([item.id]);
    setSelectedNotification(item);
  };

  const getIcon = (type: NotificationType) => {
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

  const getTypeBadge = (type: NotificationType) => {
    switch (type) {
      case "order":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#BFE9C3]/50 text-[#16381D] border border-[#BFE9C3]">
            Đơn hàng
          </span>
        );
      case "payment":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FFD1E1]/50 text-[#8B1E4A] border border-[#FFD1E1]">
            VietQR
          </span>
        );
      case "stock":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FFE7A8]/60 text-[#744210] border border-[#FFE7A8]">
            Tồn kho
          </span>
        );
      case "member":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#CFE8FF]/60 text-[#1A365D] border border-[#CFE8FF]">
            BTC/Sale
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-gray-100 text-gray-700">
            Hệ thống
          </span>
        );
    }
  };

  const formatGmailTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return "Hôm qua";
    }

    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  };

  // Count items per tab
  const tabCounts = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
      starred: notifications.filter((n) => n.starred).length,
      order: notifications.filter((n) => n.type === "order").length,
      payment: notifications.filter((n) => n.type === "payment").length,
      stock: notifications.filter((n) => n.type === "stock").length,
      member: notifications.filter((n) => n.type === "member").length,
    };
  }, [notifications]);

  return (
    <div className="space-y-4">
      {/* Top Banner & Control Actions */}
      <div className="bg-white rounded-3xl p-5 border border-[#F0E5D8] shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#BFE9C3]/30 border border-[#BFE9C3] flex items-center justify-center text-[#2D6338]">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-heading font-extrabold text-xl text-[#231B16] flex items-center gap-2">
                <span>Hộp thư thông báo</span>
                {unreadCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#FFB98A] text-[#4A2603]">
                    {unreadCount} chưa đọc
                  </span>
                )}
              </h1>
              <p className="text-xs text-[#7E7068]">
                Quản lý toàn bộ thông báo đơn hàng, thanh toán và biến động kho theo phong cách Gmail (50 thông báo/trang).
              </p>
            </div>
          </div>
        </div>

        {/* Realtime Auto-Push Controls & Test Trigger */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch md:self-auto">
          {/* Toggle Auto Push Switch */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-[#FFF8EE] border border-[#F0E5D8]">
            <span className="text-xs font-bold text-[#5C4D44]">Tự push Realtime:</span>
            <button
              onClick={() => setAutoPushEnabled(!autoPushEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoPushEnabled ? "bg-[#2D6338]" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
                  autoPushEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-[11px] font-extrabold ${
                autoPushEnabled ? "text-[#2D6338]" : "text-gray-400"
              }`}
            >
              {autoPushEnabled ? "BẬT" : "TẮT"}
            </span>
          </div>

          {/* Test Push Trigger Button */}
          <button
            onClick={triggerTestPush}
            className="px-3.5 py-1.5 rounded-2xl bg-[#2D6338] hover:bg-[#1E4525] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            title="Mô phỏng 1 thông báo mới gửi tới ngay lập tức"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FFE7A8]" />
            <span>Bắn thông báo thử nghiệm</span>
          </button>
        </div>
      </div>

      {/* Main Mailbox Container */}
      <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-sm overflow-hidden flex flex-col min-h-[600px]">
        {/* Gmail Category Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-[#F0E5D8] overflow-x-auto scrollbar-none bg-[#FFFDF9]">
          <button
            onClick={() => {
              setActiveTab("all");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "all"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Tất cả</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 font-bold">
              {tabCounts.all}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("unread");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "unread"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Chưa đọc</span>
            {tabCounts.unread > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FFB98A] text-[#4A2603] font-bold">
                {tabCounts.unread}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setActiveTab("starred");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "starred"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>Có gắn sao</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-600 font-bold">
              {tabCounts.starred}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("order");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "order"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#2D6338]" />
            <span>🛍️ Đơn hàng</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#BFE9C3]/50 text-[#16381D] font-bold">
              {tabCounts.order}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("payment");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "payment"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-[#E2884E]" />
            <span>💳 Thanh toán</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FFD1E1]/60 text-[#8B1E4A] font-bold">
              {tabCounts.payment}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("stock");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "stock"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#DD6B20]" />
            <span>⚠️ Tồn kho</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#FFE7A8] text-[#744210] font-bold">
              {tabCounts.stock}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab("member");
              setCurrentPage(1);
            }}
            className={`px-4 py-2.5 rounded-t-2xl text-xs font-extrabold transition-all flex items-center gap-2 border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === "member"
                ? "border-[#2D6338] text-[#2D6338] bg-white shadow-2xs"
                : "border-transparent text-[#7E7068] hover:text-[#231B16] hover:bg-[#FFF8EE]"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-[#3182CE]" />
            <span>🤝 Thành viên</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#CFE8FF] text-[#1A365D] font-bold">
              {tabCounts.member}
            </span>
          </button>
        </div>

        {/* Gmail-Style Action Toolbar */}
        <div className="p-3 bg-[#FFF8EE]/60 border-b border-[#F0E5D8] flex flex-wrap items-center justify-between gap-3">
          {/* Left Actions: Master Checkbox + Batch Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Master Checkbox */}
            <button
              onClick={handleToggleSelectAll}
              className="p-1.5 rounded-lg hover:bg-white text-[#5C4D44] transition-colors cursor-pointer"
              title={isAllCurrentPageSelected ? "Bỏ chọn tất cả" : "Chọn tất cả trang này"}
            >
              {isAllCurrentPageSelected ? (
                <CheckSquare className="w-4 h-4 text-[#2D6338]" />
              ) : isSomeCurrentPageSelected ? (
                <MinusSquare className="w-4 h-4 text-[#2D6338]" />
              ) : (
                <Square className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={() => {}}
              className="p-1.5 rounded-lg hover:bg-white text-[#5C4D44] transition-colors cursor-pointer"
              title="Làm mới"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Batch Action Buttons (appear when items selected) */}
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-[#F0E5D8] animate-in fade-in">
                <span className="text-xs font-bold text-[#231B16] mr-1">
                  Đã chọn {selectedIds.length}
                </span>

                <button
                  onClick={handleBatchMarkAsRead}
                  className="px-2.5 py-1 rounded-xl bg-white border border-[#F0E5D8] text-xs font-bold text-[#2D6338] hover:bg-[#FFF8EE] transition-colors flex items-center gap-1 cursor-pointer"
                  title="Đánh dấu đã đọc"
                >
                  <MailOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Đã đọc</span>
                </button>

                <button
                  onClick={handleBatchMarkAsUnread}
                  className="px-2.5 py-1 rounded-xl bg-white border border-[#F0E5D8] text-xs font-bold text-[#5C4D44] hover:bg-[#FFF8EE] transition-colors flex items-center gap-1 cursor-pointer"
                  title="Đánh dấu chưa đọc"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Chưa đọc</span>
                </button>

                <button
                  onClick={handleBatchDelete}
                  className="px-2.5 py-1 rounded-xl bg-white border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Xóa thông báo đã chọn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Xóa</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Actions: Live Search + Gmail Pagination (50 items per page) */}
          <div className="flex items-center gap-3">
            {/* Search Input */}
            <div className="relative w-44 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Tìm kiếm thông báo..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#F0E5D8] bg-white focus:border-[#2D6338] outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Pagination Range & Controls */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#5C4D44] pl-2 border-l border-[#F0E5D8]">
              <span className="tabular-nums">
                {startIndex}-{endIndex} / {totalItems}
              </span>

              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className={`p-1 rounded-lg border border-[#F0E5D8] transition-colors cursor-pointer ${
                    currentPage <= 1
                      ? "opacity-30 cursor-not-allowed bg-gray-50"
                      : "hover:bg-white hover:border-[#2D6338] text-[#231B16]"
                  }`}
                  title="Trang trước"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className={`p-1 rounded-lg border border-[#F0E5D8] transition-colors cursor-pointer ${
                    currentPage >= totalPages
                      ? "opacity-30 cursor-not-allowed bg-gray-50"
                      : "hover:bg-white hover:border-[#2D6338] text-[#231B16]"
                  }`}
                  title="Trang tiếp"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Gmail Notification Rows */}
        <div className="flex-1 divide-y divide-[#F0E5D8]/70 overflow-x-auto">
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectNotification(item)}
                  className={`group px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer hover:bg-[#FFFDF9] ${
                    !item.read ? "bg-[#BFE9C3]/8 font-semibold" : "bg-white"
                  } ${isSelected ? "bg-[#FFF8EE]" : ""}`}
                >
                  {/* Select Checkbox */}
                  <button
                    onClick={(e) => handleToggleSelectItem(item.id, e)}
                    className="text-gray-400 hover:text-[#2D6338] transition-colors p-1 -m-1"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#2D6338]" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                    )}
                  </button>

                  {/* Star Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(item.id);
                    }}
                    className="p-1 -m-1 transition-transform active:scale-125"
                    title={item.starred ? "Bỏ gắn sao" : "Gắn sao"}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        item.starred
                          ? "text-amber-400 fill-amber-400"
                          : "text-gray-300 hover:text-amber-400"
                      }`}
                    />
                  </button>

                  {/* Category Type Badge */}
                  <div className="shrink-0">{getTypeBadge(item.type)}</div>

                  {/* Title & Preview Snippet */}
                  <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                    <span
                      className={`text-xs truncate ${
                        !item.read
                          ? "font-extrabold text-[#231B16]"
                          : "font-semibold text-[#5C4D44]"
                      } md:w-56 shrink-0`}
                    >
                      {item.title}
                    </span>

                    <span className="text-xs text-[#7E7068] truncate leading-relaxed">
                      {item.desc}
                    </span>
                  </div>

                  {/* Hover Quick Actions & Timestamp */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Direct CTA Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead([item.id]);
                        router.push(item.link);
                      }}
                      className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold text-[#2D6338] bg-[#FFF8EE] hover:bg-[#BFE9C3]/50 border border-[#F0E5D8] transition-colors"
                      title="Mở trang xử lý"
                    >
                      <span>Xem</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>

                    {/* Formatted Date/Time */}
                    <span className="text-[11px] text-[#A89B92] tabular-nums whitespace-nowrap min-w-[50px] text-right">
                      {formatGmailTime(item.created_at)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-[#FFF8EE] border border-[#F0E5D8] flex items-center justify-center mx-auto text-[#7E7068]">
                <Inbox className="w-7 h-7" />
              </div>
              <p className="font-heading font-bold text-base text-[#231B16]">
                Không có thông báo nào
              </p>
              <p className="text-xs text-[#7E7068] max-w-sm mx-auto">
                {searchQuery
                  ? `Không tìm thấy kết quả phù hợp với từ khóa "${searchQuery}".`
                  : "Hộp thư thông báo của bạn đang trống."}
              </p>
            </div>
          )}
        </div>

        {/* Gmail Footer Pagination Bar */}
        <div className="p-3 bg-[#FFFDF9] border-t border-[#F0E5D8] flex items-center justify-between text-xs text-[#7E7068]">
          <span className="font-medium">
            Hiển thị <strong>50 thông báo</strong> trên mỗi trang (chuẩn phong cách Gmail)
          </span>

          <div className="flex items-center gap-2">
            <span className="font-bold text-[#231B16]">
              Trang {effectivePage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-2.5 py-1 rounded-xl border border-[#F0E5D8] text-xs font-bold hover:bg-[#FFF8EE] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Trước
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1 rounded-xl border border-[#F0E5D8] text-xs font-bold hover:bg-[#FFF8EE] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Tiếp
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Slide-over / Modal */}
      {selectedNotification && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-[#F0E5D8] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95">
            {/* Header */}
            <div className="p-5 bg-[#FFF8EE] border-b border-[#F0E5D8] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white border border-[#F0E5D8] flex items-center justify-center shadow-2xs">
                  {getIcon(selectedNotification.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-extrabold text-sm text-[#231B16]">
                      Chi tiết thông báo
                    </span>
                    {getTypeBadge(selectedNotification.type)}
                  </div>
                  <span className="text-[10px] text-[#A89B92]">
                    {new Date(selectedNotification.created_at).toLocaleString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedNotification(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div>
                <h3 className="font-heading font-extrabold text-base text-[#231B16]">
                  {selectedNotification.title}
                </h3>
                <p className="text-xs text-[#5C4D44] mt-2 leading-relaxed bg-[#FFFDF9] p-3.5 rounded-2xl border border-[#F0E5D8]">
                  {selectedNotification.desc}
                </p>
              </div>

              {/* Metadata Highlights if available */}
              {selectedNotification.meta && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selectedNotification.meta.order_code && (
                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[#A89B92] block text-[10px]">Mã đơn hàng</span>
                      <strong className="text-[#231B16]">#{selectedNotification.meta.order_code}</strong>
                    </div>
                  )}
                  {selectedNotification.meta.amount && (
                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[#A89B92] block text-[10px]">Giá trị đơn</span>
                      <strong className="text-[#2D6338]">
                        {selectedNotification.meta.amount.toLocaleString("vi-VN")}đ
                      </strong>
                    </div>
                  )}
                  {selectedNotification.meta.customer && (
                    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="text-[#A89B92] block text-[10px]">Người mua</span>
                      <strong className="text-[#231B16]">{selectedNotification.meta.customer}</strong>
                    </div>
                  )}
                  {selectedNotification.meta.stock !== undefined && (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100">
                      <span className="text-[#A89B92] block text-[10px]">Tồn kho hiện tại</span>
                      <strong className="text-[#DD6B20]">{selectedNotification.meta.stock} sản phẩm</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-[#FFF8EE] border-t border-[#F0E5D8] flex items-center justify-between">
              <button
                onClick={() => {
                  deleteNotifications([selectedNotification.id]);
                  setSelectedNotification(null);
                }}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa thông báo</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    const link = selectedNotification.link;
                    setSelectedNotification(null);
                    router.push(link);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-[#2D6338] hover:bg-[#1E4525] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <span>Chuyển đến trang xử lý</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
