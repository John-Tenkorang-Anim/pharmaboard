import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronRight, PenSquare, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody } from "@/components/ui/Card";
import { SeverityChip, StateChip } from "@/components/ui/Badge";
import { SkeletonList } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { formatRelative } from "@/lib/format";
import { useNotices } from "./api";

export function NoticesListPage() {
  const [publishedOnly, setPublishedOnly] = useState(true);
  const { data, isLoading, error } = useNotices(publishedOnly);

  return (
    <AppShell width="narrow">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Notices</h1>
          <p className="mt-1 text-sm text-faint">
            Official communications delivered to verified professionals.
          </p>
        </div>
        <Link to="/notices/compose">
          <Button>
            <PenSquare className="size-4" />
            Compose
          </Button>
        </Link>
      </div>

      <div className="segment mb-5">
        {[
          { label: "Published", value: true },
          { label: "Including drafts", value: false },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => setPublishedOnly(opt.value)}
            data-active={publishedOnly === opt.value}
            className="segment-item"
          >
            {opt.label}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} />

      {isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={4} />
          </CardBody>
        </Card>
      ) : data && data.items.length > 0 ? (
        // One bordered container, rows divided by a hairline — a table, not
        // a stack of individually accent-barred boxes.
        <div className="list-card">
          {data.items.map((notice) => (
            <Link key={notice.id} to={`/notices/${notice.id}`} className="list-row">
              <div className="flex items-center gap-4 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <SeverityChip severity={notice.severity} />
                    <StateChip state={notice.state} />
                  </div>
                  <p className="text-[0.9375rem] font-semibold leading-snug text-ink">
                    {notice.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-[0.8125rem] text-faint">
                    {notice.body_markdown}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-[0.8125rem] text-faint">
                    <span>{formatRelative(notice.published_at ?? notice.created_at)}</span>
                    {notice.audience_size !== null && (
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" />
                        {notice.audience_size}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-divider" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Bell className="size-6" />}
            title="No notices yet"
            description="Published notices to verified professionals will appear here."
            action={
              <Link to="/notices/compose">
                <Button>Compose the first notice</Button>
              </Link>
            }
          />
        </Card>
      )}
    </AppShell>
  );
}
