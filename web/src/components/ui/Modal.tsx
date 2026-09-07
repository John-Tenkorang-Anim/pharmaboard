import { type ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = dialog.current;
    if (!open || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close.current();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto rounded-md border-0 bg-white p-0 text-ink shadow-overlay backdrop:bg-ink/40`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-white px-6 py-4">
        <h2 id={heading} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="rounded-lg p-2 text-muted hover:bg-canvas"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
