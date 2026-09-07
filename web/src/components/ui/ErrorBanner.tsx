import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : "Something went wrong.";
  return (
    <div className="flex items-start gap-2.5 border-y border-severity-critical/25 bg-white px-4 py-3 text-sm text-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-severity-critical" />
      <span>{message}</span>
    </div>
  );
}
