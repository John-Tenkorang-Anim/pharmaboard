import { type ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

// Sharp-cornered, ruled, ink-on-paper. No rounded-lg gradients, no drop
// shadows — a control here should read like a stamped form field, not a
// SaaS call-to-action.
const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-muted disabled:bg-ink-faint",
  secondary: "border border-ink text-ink hover:bg-ink hover:text-paper disabled:border-rule disabled:text-ink-faint disabled:hover:bg-transparent disabled:hover:text-ink-faint",
  quiet: "text-ink-muted hover:text-ink underline decoration-rule underline-offset-4 hover:decoration-ink disabled:text-ink-faint disabled:no-underline",
  danger: "bg-signal-critical text-paper hover:bg-signal-critical/85 disabled:bg-ink-faint",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.75rem] gap-2",
  md: "h-10 px-5 text-[0.8125rem] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, disabled, className, children, ...props }, ref) => {
    const isQuiet = variant === "quiet";
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center rounded-none font-sans font-medium uppercase tracking-[0.08em] transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
          "disabled:cursor-not-allowed",
          variantClasses[variant],
          isQuiet ? "h-auto p-0 normal-case tracking-normal" : sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            aria-hidden
            className="size-2.5 animate-pulse bg-current"
            style={{ animationDuration: "0.9s" }}
          />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
