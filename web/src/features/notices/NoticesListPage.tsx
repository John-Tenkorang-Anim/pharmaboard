import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AppShell } from "@/components/layout/AppShell";
import { SeverityKicker, StateMark, severityRule } from "@/components/ui/Badge";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format";
import { useNotices } from "./api";

export function NoticesListPage() {
  const [publishedOnly, setPublishedOnly] = useState(true);
  const { data, isLoading, error } = useNotices(publishedOnly);

  return (
    <AppShell
      kicker="Register"
      title="Notices"
      actions={
        <Link to="/notices/compose">
          <Button size="sm">Compose notice</Button>
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl">
        {/* Filter as a typographic switch, not a pill toggle. */}
        <div className="mb-1 flex items-baseline gap-5">
          {[
            { label: "Published", value: true },
            { label: "Including drafts", value: false },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => setPublishedOnly(opt.value)}
              className={clsx(
                "label-caps pb-1 transition-colors",
                publishedOnly === opt.value
                  ? "border-b-2 border-ink text-ink"
                  : "border-b-2 border-transparent text-ink-faint hover:text-ink-muted",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-6">
            <ErrorBanner error={error} />
          </div>
        )}

        {isLoading ? (
          <SkeletonList rows={5} />
        ) : data && data.items.length > 0 ? (
          <div>
            {data.items.map((notice) => (
              <Link key={notice.id} to={`/notices/${notice.id}`} className="group block">
                <article className={clsx("py-6 transition-colors", severityRule(notice.severity))}>
                  <div className="flex items-baseline justify-between gap-4">
                    <SeverityKicker severity={notice.severity} />
                    <StateMark state={notice.state} />
                  </div>
                  <h2
                    className={clsx(
                      "mt-2.5 font-display text-ink decoration-rule decoration-1 underline-offset-4 group-hover:underline",
                      // A critical notice is physically larger in the page.
                      notice.severity === "critical"
                        ? "text-display-md font-medium"
                        : "text-display-sm font-normal",
                    )}
                  >
                    {notice.title}
                  </h2>
                  <p className="mt-2 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-ink-faint">
                    {formatDateTime(notice.published_at ?? notice.created_at)}
                    {notice.audience_size !== null && (
                      <>
                        <span className="px-2 text-rule">/</span>
                        {notice.audience_size} recipients
                      </>
                    )}
                  </p>
                </article>
              </Link>
            ))}
            <div className="border-t border-rule" />
          </div>
        ) : (
          <EmptyState
            title="No notices in the register"
            description="Published notices to verified professionals are recorded here, in the order they were issued."
            action={
              <Link to="/notices/compose">
                <Button size="sm">Compose the first notice</Button>
              </Link>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
