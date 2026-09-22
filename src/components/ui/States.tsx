import { cn } from "@/lib/utils";
import { Loader2, Package } from "lucide-react";

// === Loading State ===

interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({
  message = "Đang tải...",
  className,
  size = "md",
}: LoadingStateProps) {
  const sizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-center",
        className
      )}
      role="status"
      aria-label={message}
    >
      <Loader2 className={cn("animate-spin text-brand-dark mb-3", sizes[size])} />
      <p className="text-muted text-sm">{message}</p>
    </div>
  );
}

// === Empty State ===

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in",
        className
      )}
    >
      <div className="mb-4 text-muted-light">
        {icon || <Package className="h-12 w-12" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-sm text-muted max-w-sm mb-4">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// === Error State ===

interface ErrorStateProps {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Đã xảy ra lỗi",
  message = "Không thể tải dữ liệu. Vui lòng thử lại.",
  retry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in",
        className
      )}
      role="alert"
    >
      <div className="h-12 w-12 rounded-full bg-danger-light flex items-center justify-center mb-4">
        <span className="text-danger text-xl font-bold">!</span>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-4">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="text-sm font-medium text-brand-darker hover:underline"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}
