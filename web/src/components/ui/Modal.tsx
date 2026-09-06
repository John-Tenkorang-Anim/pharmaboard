import { type ReactNode, useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={onClose} />
      {/* A sheet of paper laid over the page — square corners, one rule. */}
      <div className="relative w-full max-w-md animate-rise border border-ink bg-paper-raised shadow-overlay">
        <div className="flex items-baseline justify-between border-b border-rule px-6 py-4">
          <h2 className="font-display text-display-sm text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="label-caps text-ink-faint transition-colors hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
