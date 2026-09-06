import { ApiError } from "@/lib/api";

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : "Something went wrong.";
  return (
    <div className="border-l-2 border-signal-critical bg-paper-sunken px-4 py-3">
      <p className="kicker text-signal-critical">Error</p>
      <p className="mt-1.5 font-sans text-[0.8125rem] leading-relaxed text-ink">{message}</p>
    </div>
  );
}
