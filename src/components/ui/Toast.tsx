"use client";

import { cn } from "@/lib/utils";
import { CheckCircle, X, AlertCircle, Info } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastProps {
  id?: string;
  type: ToastType;
  message: string;
  duration?: number;
  onDismiss?: (id: string) => void;
  onClose?: () => void;
}

export function Toast({ id = "1", type, message, duration = 4000, onDismiss, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  const dismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss?.(id);
      onClose?.();
    }, 200);
  }, [id, onDismiss, onClose]);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(dismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, dismiss]);

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-success shrink-0" />,
    error: <AlertCircle className="h-5 w-5 text-danger shrink-0" />,
    warning: <AlertCircle className="h-5 w-5 text-warning shrink-0" />,
    info: <Info className="h-5 w-5 text-info shrink-0" />,
  };

  const bgStyles = {
    success: "bg-success-light border-success/30",
    error: "bg-danger-light border-danger/30",
    warning: "bg-warning-light border-warning/30",
    info: "bg-info-light border-info/30",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-[var(--radius-lg)] border shadow-card max-w-sm",
        bgStyles[type],
        isExiting ? "opacity-0 translate-y-2 transition-all duration-200" : "animate-slide-up"
      )}
      role="alert"
    >
      {icons[type]}
      <p className="text-sm text-foreground flex-1">{message}</p>
      <button
        onClick={dismiss}
        className="p-0.5 text-muted hover:text-foreground shrink-0"
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// === Toast Container ===

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      aria-live="polite"
      aria-label="Thông báo"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// === Toast Hook ===

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration?: number) => {
    const id = String(++toastId);
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    toasts,
    dismissToast,
    success: (msg: string) => addToast("success", msg),
    error: (msg: string) => addToast("error", msg),
    warning: (msg: string) => addToast("warning", msg),
    info: (msg: string) => addToast("info", msg),
  };
}
