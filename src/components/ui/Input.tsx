import { cn } from "@/lib/utils";
import { forwardRef, InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const cleanLabel = label?.replace(/\s*\*+\s*$/, "");
    const isRequired = props.required || label?.includes("*");

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            {cleanLabel}
            {isRequired && <span className="text-danger ml-0.5">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full h-10 px-3 rounded-[var(--radius-md)] border bg-surface text-foreground text-sm",
            "placeholder:text-muted-light",
            "transition-colors duration-200",
            "focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-hover",
            error
              ? "border-danger focus:ring-danger/50 focus:border-danger"
              : "border-border hover:border-muted-light",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1 text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
export { Input };
