import { type ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200 hover:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-100",
  secondary:
    "bg-surface text-ink border border-divider hover:border-slate-300 disabled:text-faint disabled:hover:border-divider",
  ghost: "text-muted hover:bg-slate-100 hover:text-ink disabled:text-faint",
  danger:
    "bg-severity-critical text-white hover:bg-[#7a181f] disabled:bg-hairline disabled:text-faint",
  quiet: "text-slate-700 hover:text-slate-950 hover:underline disabled:text-faint",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem] gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-[0.9375rem] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-100",
        "disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
