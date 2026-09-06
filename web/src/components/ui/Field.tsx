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
    <label htmlFor={htmlFor} className="label-caps mb-2 block text-ink-muted">
      {children}
    </label>
  );
}

// Flat, ruled fields — the look of a form on paper. The focus state darkens
// the rule rather than painting a glow around it.
const fieldBase =
  "w-full rounded-none border border-rule bg-paper-raised px-3 py-2.5 font-sans text-[0.875rem] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:border-ink disabled:bg-paper-sunken disabled:text-ink-faint";

interface WrapperProps {
  label?: string;
  hint?: string;
  error?: string;
}

function Hint({ hint, error }: { hint?: string; error?: string }) {
  if (error) return <p className="mt-1.5 font-sans text-meta text-signal-critical">{error}</p>;
  if (hint) return <p className="mt-1.5 font-sans text-meta text-ink-faint">{hint}</p>;
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
      className={clsx(fieldBase, error && "border-signal-critical", className)}
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
      className={clsx(fieldBase, "resize-none leading-relaxed", error && "border-signal-critical", className)}
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
