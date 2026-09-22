import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "brand" | "accent" | "dreamy" | "sunshine" | "sweet";
  size?: "sm" | "md";
  className?: string;
}

const variantStyles = {
  default: "bg-[#FFF8EE] text-[#4A3B32] border border-[#F0E5D8]",
  success: "bg-[#E6F7EC] text-[#226335] border border-[#BFE9C3]",
  warning: "bg-[#FEF3C7] text-[#92400E] border border-[#FFE7A8]",
  danger: "bg-[#FED7D7] text-[#9B2C2C] border border-[#FEB2B2]",
  info: "bg-[#EBF8FF] text-[#2B6CB0] border border-[#CFE8FF]",
  brand: "bg-[#BFE9C3] text-[#16381D] border border-[#9ED4A3] font-bold",
  accent: "bg-[#FFB98A] text-[#4F2504] border border-[#F0A371] font-bold",
  dreamy: "bg-[#CFE8FF] text-[#133A63] border border-[#B2D9FF] font-bold",
  sunshine: "bg-[#FFE7A8] text-[#523F07] border border-[#EBD089] font-bold",
  sweet: "bg-[#FFD1E1] text-[#54122C] border border-[#F5B8CC] font-bold",
};

const sizeStyles = {
  sm: "text-[11px] px-2.5 py-0.5",
  md: "text-xs px-3 py-1",
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
        "inline-flex items-center font-medium rounded-full shadow-2xs",
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
        "inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-2xs",
        colors[status] || "bg-[#FFF8EE] text-[#4A3B32] border-[#F0E5D8]",
        className
      )}
    >
      {labels[status] || status}
    </span>
  );
}
