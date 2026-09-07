import {
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
  forwardRef,
} from "react";
import clsx from "clsx";

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-medium text-ink">
      {children}
    </label>
  );
}

const fieldBase =
  "w-full rounded border border-divider bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors focus-visible:outline-none focus-visible:border-accent-600 disabled:bg-hairline/40 disabled:text-faint";

interface WrapperProps {
  label?: string;
  hint?: string;
  error?: string;
}

function Hint({ hint, error }: { hint?: string; error?: string }) {
  if (error) return <p className="mt-1.5 text-xs text-severity-critical">{error}</p>;
  if (hint) return <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>;
  return null;
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & WrapperProps
>(({ label, hint, error, id, className, ...props }, ref) => (
  <div>
    {label && <Label htmlFor={id}>{label}</Label>}
    <input
      ref={ref}
      id={id}
      className={clsx(fieldBase, error && "border-severity-critical", className)}
      {...props}
    />
    <Hint hint={hint} error={error} />
  </div>
));
TextInput.displayName = "TextInput";

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & WrapperProps
>(({ label, hint, error, id, className, ...props }, ref) => (
  <div>
    {label && <Label htmlFor={id}>{label}</Label>}
    <textarea
      ref={ref}
      id={id}
      className={clsx(
        fieldBase,
        "resize-none leading-relaxed",
        error && "border-severity-critical",
        className,
      )}
      {...props}
    />
    <Hint hint={hint} error={error} />
  </div>
));
TextArea.displayName = "TextArea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & WrapperProps
>(({ label, hint, error, id, className, children, ...props }, ref) => (
  <div>
    {label && <Label htmlFor={id}>{label}</Label>}
    <select ref={ref} id={id} className={clsx(fieldBase, className)} {...props}>
      {children}
    </select>
    <Hint hint={hint} error={error} />
  </div>
));
Select.displayName = "Select";
