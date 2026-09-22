import { formatMoney } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  originalPrice?: number | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Displays price in VND format.
 * If originalPrice is provided, shows strikethrough price and savings.
 */
export function MoneyDisplay({
  amount,
  originalPrice,
  size = "md",
  className,
}: MoneyDisplayProps) {
  const hasDiscount = originalPrice && originalPrice > amount;
  const savings = hasDiscount ? originalPrice - amount : 0;

  const sizeStyles = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
  };

  return (
    <div className={className}>
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* Current price — must be the most prominent */}
        <span className={`font-bold text-foreground ${sizeStyles[size]}`}>
          {formatMoney(amount)}
        </span>

        {/* Original price (strikethrough) */}
        {hasDiscount && (
          <span className="text-muted line-through text-sm">
            {formatMoney(originalPrice)}
          </span>
        )}
      </div>

      {/* Savings */}
      {hasDiscount && savings > 0 && (
        <p className="text-xs text-brand-darker mt-0.5">
          Tiết kiệm {formatMoney(savings)}
        </p>
      )}
    </div>
  );
}
