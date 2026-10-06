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
  refreshNotifications: () => Promise<void>;
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

  // Load initial notifications from local storage for fast render
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

  // Fetch live notifications from Supabase API
  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications");
      if (res.ok) {
        const data = await res.json();
        if (data?.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          try {
            localStorage.setItem(
              "gieomo_admin_notifications",
              JSON.stringify(data.notifications.slice(0, 50))
            );
          } catch {}
        }
      }
    } catch (err) {
      console.warn("Could not fetch notifications from server:", err);
    }
  }, []);

  // Sync with server on mount, when orders/messages update, and window focus (debounced to avoid re-render cascades)
  useEffect(() => {
    refreshNotifications();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleDebouncedEvent = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshNotifications();
      }, 1000);
    };

    window.addEventListener("gieomo_orders_updated", handleDebouncedEvent);
    window.addEventListener("gieomo_messages_updated", handleDebouncedEvent);

    // Periodic poll every 60s while admin is active
    const timer = setInterval(refreshNotifications, 60000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("gieomo_orders_updated", handleDebouncedEvent);
      window.removeEventListener("gieomo_messages_updated", handleDebouncedEvent);
      clearInterval(timer);
    };
  }, [refreshNotifications]);

  // Save to localStorage when state updates
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem("gieomo_admin_notifications", JSON.stringify(notifications.slice(0, 50)));
    } catch {}
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
    fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAsRead", ids }),
    }).catch(() => {});
  }, []);

  const markAsUnread = useCallback((ids: string[]) => {
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: false } : n))
    );
    fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "markAsUnread", ids }),
    }).catch(() => {});
  }, []);

  const toggleStar = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, starred: !n.starred } : n))
    );
    fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleStar", id }),
    }).catch(() => {});
  }, []);

  const deleteNotifications = useCallback((ids: string[]) => {
    setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
    fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids }),
    }).catch(() => {});
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
      refreshNotifications,
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
      refreshNotifications,
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
