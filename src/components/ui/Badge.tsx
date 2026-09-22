import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "brand" | "accent";
  size?: "sm" | "md";
  className?: string;
}

const variantStyles = {
  default: "bg-surface-hover text-foreground border border-border",
  success: "bg-success-light text-green-800",
  warning: "bg-warning-light text-yellow-800",
  danger: "bg-danger-light text-red-800",
  info: "bg-info-light text-blue-800",
  brand: "bg-soft-green/30 text-green-800",
  accent: "bg-warm-orange/20 text-orange-800",
};

const sizeStyles = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-[var(--radius-full)]",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// Specialized status badge using order/payment/delivery status
interface StatusBadgeProps {
  status: string;
  labels: Record<string, string>;
  colors: Record<string, string>;
  className?: string;
}

export function StatusBadge({ status, labels, colors, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-[var(--radius-full)]",
        colors[status] || "bg-surface-hover text-foreground",
        className
      )}
    >
      {labels[status] || status}
    </span>
  );
}
