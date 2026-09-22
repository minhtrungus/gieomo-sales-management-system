import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-bold rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFB98A] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

    const variants = {
      primary:
        "bg-[#BFE9C3] hover:bg-[#aee0b3] text-[#1B3622] border border-[#9ed4a3] shadow-xs hover:shadow-md",
      secondary:
        "bg-[#CFE8FF] hover:bg-[#bedeff] text-[#133A63] border border-[#b2d9ff] shadow-xs hover:shadow-md",
      outline:
        "border border-[#EADBCC] text-[#342A24] bg-white hover:bg-[#FFF8EE] shadow-2xs hover:shadow-xs",
      ghost: "text-[#5C4D44] hover:bg-[#FFF4E5] hover:text-[#231B16]",
      danger: "bg-[#E53E3E] text-white hover:bg-[#c53030] shadow-xs",
      accent:
        "bg-[#FFB98A] hover:bg-[#ffa770] text-[#4A2603] border border-[#f0a371] shadow-xs hover:shadow-md",
    };

    const sizes = {
      sm: "h-8 px-3.5 text-xs gap-1.5",
      md: "h-10 px-5 text-xs sm:text-sm gap-2",
      lg: "h-12 px-7 text-sm sm:text-base gap-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && "w-full",
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
export { Button };
