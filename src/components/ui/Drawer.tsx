"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useCallback } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "right" | "left" | "bottom";
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  className,
}: DrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const sideStyles = {
    right: "inset-y-0 right-0 w-full max-w-md animate-slide-in-right",
    left: "inset-y-0 left-0 w-full max-w-md",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-[var(--radius-xl)]",
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed bg-surface shadow-lg flex flex-col",
          sideStyles[side],
          className
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-border-light shrink-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-md)] text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
