"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export type NotificationType = "order" | "payment" | "stock" | "member" | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  created_at: string;
  read: boolean;
  starred: boolean;
  link: string;
  meta?: {
    order_code?: string;
    amount?: number;
    customer?: string;
    product_name?: string;
    stock?: number;
    member_name?: string;
  };
}

export interface ToastItem {
  id: string;
  notification: NotificationItem;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  autoPushEnabled: boolean;
  setAutoPushEnabled: (val: boolean) => void;
  markAsRead: (ids: string[]) => void;
  markAsUnread: (ids: string[]) => void;
  toggleStar: (id: string) => void;
  deleteNotifications: (ids: string[]) => void;
  pushNotification: (item: Omit<NotificationItem, "id" | "created_at" | "read" | "starred">) => void;
  triggerTestPush: () => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Generate 150 realistic seed notifications
function generateInitialNotifications(): NotificationItem[] {
  const types: NotificationType[] = ["order", "payment", "stock", "member", "system"];
  const customers = [
    "Nguyễn Thị Mai", "Trần Thu Hà", "Lê Hoàng Phúc", "Phạm Minh Anh", 
    "Vũ Đức Trọng", "Đặng Thị Thảo", "Bùi Kim Ngân", "Hoàng Văn Tuấn",
    "Đỗ Mai Lan", "Ngô Quốc Huy", "Dương Bảo Ngọc", "Lý Gia Hân"
  ];
  const products = [
    "Túi Canvas Mầm Mơ Thêu Tay", "Bộ 3 Huy Hiệu Nút Áo Gieo Mơ",
    "Sổ Tay Bìa Vải Thô Vintage", "Bình Giữ Nhiệt Khắc Laser Mầm Mơ",
    "Kẹp Tóc Nút Áo Handmade", "Set Quà Tặng Gieo Mơ Đặc Biệt",
    "Vòng Tay May Mắn Gieo Hạt"
  ];
  const members = ["Mai Lan", "Quốc Bảo", "Thu Trang", "Minh Hưng", "Khánh Linh", "Bảo Châu"];

  const items: NotificationItem[] = [
    {
      id: "notif-seed-1",
      type: "order",
      title: "Đơn hàng mới #GM-1025",
      desc: "Khách hàng Nguyễn Thị Mai vừa đặt đơn hàng trị giá 385.000đ (2 món).",
      created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(), // 3 mins ago
      read: false,
      starred: true,
      link: "/admin/orders",
      meta: { order_code: "GM-1025", amount: 385000, customer: "Nguyễn Thị Mai" },
    },
    {
      id: "notif-seed-2",
      type: "payment",
      title: "Chờ xác nhận VietQR: 385.000đ",
      desc: "Giao dịch chuyển khoản ngân hàng khớp mã GM1025 đang chờ BTC đối soát.",
      created_at: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
      read: false,
      starred: false,
      link: "/admin/payments",
      meta: { order_code: "GM-1025", amount: 385000 },
    },
    {
      id: "notif-seed-3",
      type: "stock",
      title: "Cảnh báo tồn kho: Kẹp Tóc Nút Áo",
      desc: "Sản phẩm Kẹp Tóc Nút Áo Handmade chỉ còn 4 chiếc trong kho. Vui lòng nhập thêm.",
      created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
      read: false,
      starred: false,
      link: "/admin/inventory",
      meta: { product_name: "Kẹp Tóc Nút Áo Handmade", stock: 4 },
    },
    {
      id: "notif-seed-4",
      type: "member",
      title: "Thành viên chốt đơn thành công",
      desc: "Tình nguyện viên Mai Lan vừa mang lại đơn hàng #GM-1024 qua mã giới thiệu MAM-LAN.",
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      read: true,
      starred: false,
      link: "/admin/members",
      meta: { member_name: "Mai Lan", order_code: "GM-1024" },
    },
    {
      id: "notif-seed-5",
      type: "system",
      title: "Hệ thống tự động đồng bộ tồn kho",
      desc: "Hệ thống đã cập nhật số lượng tồn kho theo 12 đơn hoàn tất trong ngày.",
      created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      read: true,
      starred: false,
      link: "/admin/inventory",
    }
  ];

  // Generate 20 additional realistic notifications spanning the last 14 days
  for (let i = 6; i <= 25; i++) {
    const type = types[i % types.length];
    const customer = customers[i % customers.length];
    const product = products[i % products.length];
    const member = members[i % members.length];
    const hoursAgo = Math.floor(i * 2.2);
    const date = new Date(Date.now() - 1000 * 60 * 60 * hoursAgo);
    const orderCode = `GM-${1025 - i}`;
    const amount = (Math.floor((i * 37) % 8) + 1) * 65000;

    let title = "";
    let desc = "";
    let link = "/admin/orders";

    switch (type) {
      case "order":
        title = `Đơn hàng mới #${orderCode}`;
        desc = `Khách hàng ${customer} đã đặt mua ${product} (${amount.toLocaleString("vi-VN")}đ).`;
        link = "/admin/orders";
        break;
      case "payment":
        title = `Xác nhận thanh toán #${orderCode}`;
        desc = `Khách hàng ${customer} đã thanh toán ${amount.toLocaleString("vi-VN")}đ qua VietQR MB Bank.`;
        link = "/admin/payments";
        break;
      case "stock":
        title = `Cảnh báo tồn kho: ${product}`;
        desc = `Số lượng khả dụng của sản phẩm ${product} chạm ngưỡng báo động (${(i % 5) + 1} cái).`;
        link = "/admin/inventory";
        break;
      case "member":
        title = `Ghi nhận hoa hồng: ${member}`;
        desc = `Thành viên ${member} vừa kích hoạt thành công đơn hàng #${orderCode}.`;
        link = "/admin/members";
        break;
      case "system":
        title = `Báo cáo ca trực gây quỹ ngày ${date.toLocaleDateString("vi-VN")}`;
        desc = `Đã kết toán doanh thu bán hàng gây quỹ ca trực. Toàn bộ tiền đã đối chiếu với tài khoản BTC.`;
        link = "/admin/reports";
        break;
    }

    items.push({
      id: `notif-seed-${i}`,
      type,
      title,
      desc,
      created_at: date.toISOString(),
      read: i > 12, // First 12 are unread
      starred: i % 7 === 0,
      link,
      meta: {
        order_code: orderCode,
        amount,
        customer,
        product_name: product,
      },
    });
  }

  return items;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [autoPushEnabled, setAutoPushEnabledState] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Load seeds and autoPushEnabled preference on mount
  useEffect(() => {
    const savedAutoPush = localStorage.getItem("gieomo_admin_auto_push");
    if (savedAutoPush !== null) {
      setAutoPushEnabledState(savedAutoPush === "true");
    } else {
      setAutoPushEnabledState(false);
    }

    const saved = localStorage.getItem("gieomo_admin_notifications");
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
        return;
      } catch (e) {
        console.error("Failed to parse saved notifications", e);
      }
    }
    const initial = generateInitialNotifications();
    setNotifications(initial);
  }, []);

  const setAutoPushEnabled = useCallback((val: boolean) => {
    setAutoPushEnabledState(val);
    localStorage.setItem("gieomo_admin_auto_push", val ? "true" : "false");
  }, []);

  // Save to localStorage (limit to 50 most recent to prevent storage bloat)
  useEffect(() => {
    if (notifications.length > 0) {
      localStorage.setItem("gieomo_admin_notifications", JSON.stringify(notifications.slice(0, 50)));
    }
  }, [notifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushNotification = useCallback(
    (itemData: Omit<NotificationItem, "id" | "created_at" | "read" | "starred">) => {
      const newItem: NotificationItem = {
        ...itemData,
        id: `notif-push-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        created_at: new Date().toISOString(),
        read: false,
        starred: false,
      };

      setNotifications((prev) => [newItem, ...prev]);

      // Add Toast
      const toastId = `toast-${Date.now()}`;
      setToasts((prev) => [...prev.slice(-2), { id: toastId, notification: newItem }]);

      // Auto dismiss toast after 6s
      setTimeout(() => {
        dismissToast(toastId);
      }, 6000);
    },
    [dismissToast]
  );

  const triggerTestPush = useCallback(() => {
    const testEvents = [
      {
        type: "order" as NotificationType,
        title: `Đơn hàng mới #GM-${Math.floor(1030 + Math.random() * 90)}`,
        desc: "Khách hàng Lê Vũ Bảo vừa hoàn tất đặt 1 Túi Canvas Mầm Mơ và 1 Bình Giữ Nhiệt (310.000đ).",
        link: "/admin/orders",
        meta: { amount: 310000, customer: "Lê Vũ Bảo" },
      },
      {
        type: "payment" as NotificationType,
        title: "Ting ting! VietQR đã nhận 245.000đ",
        desc: "Giao dịch MB Bank thành công từ khách hàng Hoàng Lan. Vui lòng đối soát phiếu đơn.",
        link: "/admin/payments",
        meta: { amount: 245000 },
      },
      {
        type: "stock" as NotificationType,
        title: "Cảnh báo kho: Bộ 3 Huy Hiệu Nút Áo",
        desc: "Số lượng tồn kho chỉ còn 2 chiếc. Cần lập phiếu nhập kho gấp!",
        link: "/admin/inventory",
        meta: { product_name: "Bộ 3 Huy Hiệu Nút Áo", stock: 2 },
      },
      {
        type: "member" as NotificationType,
        title: "Thành viên chốt đơn mới",
        desc: "Tình nguyện viên Quốc Bảo vừa có đơn hàng mới trị giá 180.000đ.",
        link: "/admin/members",
        meta: { member_name: "Quốc Bảo" },
      },
    ];

    const randomEvent = testEvents[Math.floor(Math.random() * testEvents.length)];
    pushNotification(randomEvent);
  }, [pushNotification]);

  // Periodic Auto-push simulator (every 40 seconds if enabled)
  useEffect(() => {
    if (!autoPushEnabled) return;

    const interval = setInterval(() => {
      const chance = Math.random();
      if (chance > 0.4) {
        triggerTestPush();
      }
    }, 40000);

    return () => clearInterval(interval);
  }, [autoPushEnabled, triggerTestPush]);

  const markAsRead = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
  }, []);

  const markAsUnread = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: false } : n))
    );
  }, []);

  const toggleStar = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, starred: !n.starred } : n))
    );
  }, []);

  const deleteNotifications = useCallback((ids: string[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
  }, []);

  const contextValue = useMemo(
    () => ({
      notifications,
      unreadCount,
      autoPushEnabled,
      setAutoPushEnabled,
      markAsRead,
      markAsUnread,
      toggleStar,
      deleteNotifications,
      pushNotification,
      triggerTestPush,
      toasts,
      dismissToast,
    }),
    [
      notifications,
      unreadCount,
      autoPushEnabled,
      setAutoPushEnabled,
      markAsRead,
      markAsUnread,
      toggleStar,
      deleteNotifications,
      pushNotification,
      triggerTestPush,
      toasts,
      dismissToast,
    ]
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
