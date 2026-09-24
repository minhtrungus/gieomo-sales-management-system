"use client";

import React from "react";
import { useNotifications, NotificationItem } from "@/lib/notifications/NotificationContext";
import { ShoppingBag, CreditCard, AlertTriangle, UserCheck, Bell, X, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

export function NotificationToastContainer() {
  const { toasts, dismissToast, markAsRead } = useNotifications();
  const router = useRouter();

  if (toasts.length === 0) return null;

  const getIcon = (type: NotificationItem["type"]) => {
    switch (type) {
      case "order":
        return <ShoppingBag className="w-5 h-5 text-[#2D6338]" />;
      case "payment":
        return <CreditCard className="w-5 h-5 text-[#E2884E]" />;
      case "stock":
        return <AlertTriangle className="w-5 h-5 text-[#DD6B20]" />;
      case "member":
        return <UserCheck className="w-5 h-5 text-[#3182CE]" />;
      default:
        return <Bell className="w-5 h-5 text-[#2D6338]" />;
    }
  };

  const handleClick = (notif: NotificationItem, toastId: string) => {
    markAsRead([notif.id]);
    dismissToast(toastId);
    router.push(notif.link);
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const notif = toast.notification;
        return (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white border border-[#F0E5D8] rounded-2xl shadow-xl p-4 flex items-start gap-3.5 transform transition-all duration-300 animate-in slide-in-from-top-4 fade-in"
          >
            <div className="w-10 h-10 rounded-xl bg-[#FFF8EE] border border-[#F0E5D8] flex items-center justify-center shrink-0 shadow-xs">
              {getIcon(notif.type)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-heading font-extrabold text-[#231B16] truncate">
                  {notif.title}
                </span>
                <span className="text-[10px] text-[#A89B92] shrink-0 font-medium">
                  Vừa xong
                </span>
              </div>
              <p className="text-[11px] text-[#5C4D44] mt-0.5 line-clamp-2 leading-relaxed">
                {notif.desc}
              </p>

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={() => handleClick(notif, toast.id)}
                  className="px-3 py-1 rounded-lg bg-[#2D6338] text-white text-[11px] font-bold hover:bg-[#1E4525] transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Xem chi tiết</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="px-2 py-1 rounded-lg text-gray-400 hover:text-gray-600 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Bỏ qua
                </button>
              </div>
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
