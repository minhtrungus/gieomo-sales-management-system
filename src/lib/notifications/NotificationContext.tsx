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
  markAsRead: (ids: string[]) => void;
  markAsUnread: (ids: string[]) => void;
  toggleStar: (id: string) => void;
  deleteNotifications: (ids: string[]) => void;
  pushNotification: (item: Omit<NotificationItem, "id" | "created_at" | "read" | "starred">) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Clean initial system notifications - empty by default to prevent spam notifications
function generateInitialNotifications(): NotificationItem[] {
  return [];
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [isLoaded, setIsLoaded] = useState(false);

  // Load notifications from storage or initialize empty
  useEffect(() => {
    const saved = localStorage.getItem("gieomo_admin_notifications");
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved notifications", e);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage (limit to 50 most recent to prevent storage bloat)
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("gieomo_admin_notifications", JSON.stringify(notifications.slice(0, 50)));
  }, [notifications, isLoaded]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Automatic push notifications and toasts are blocked per user instruction
  const pushNotification = useCallback(
    (_itemData: Omit<NotificationItem, "id" | "created_at" | "read" | "starred">) => {
      // Intentionally blocked to prevent unwanted automatic popups
    },
    []
  );

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
      markAsRead,
      markAsUnread,
      toggleStar,
      deleteNotifications,
      pushNotification,
      toasts,
      dismissToast,
    }),
    [
      notifications,
      unreadCount,
      markAsRead,
      markAsUnread,
      toggleStar,
      deleteNotifications,
      pushNotification,
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
