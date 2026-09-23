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

// Clean initial system notifications
function generateInitialNotifications(): NotificationItem[] {
  return [
    {
      id: "notif-system-init",
      type: "system",
      title: "Hệ thống quản lý Gieo Mơ sẵn sàng",
      desc: "Chào mừng ban tổ chức Mầm Mơ. Hệ thống vận hành và ghi nhận đơn hàng đã sẵn sàng.",
      created_at: new Date().toISOString(),
      read: false,
      starred: true,
      link: "/admin/orders",
    }
  ];
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

  // Auto-push simulator completely disabled in production

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
