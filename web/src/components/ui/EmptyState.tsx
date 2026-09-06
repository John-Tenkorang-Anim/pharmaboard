import { type ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-t border-rule py-16 text-center">
      <p className="font-display text-display-sm text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-measure font-sans text-[0.8125rem] leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
