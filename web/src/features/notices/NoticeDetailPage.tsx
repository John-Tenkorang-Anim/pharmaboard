import { RichText } from "@/components/ui/RichText";
import { MediaAttachments, withoutMedia } from "@/features/media/Media";
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Send,
  ThumbsUp,
  Undo2,
  Rocket,
  Users,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SeverityChip, StateChip } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Modal } from "@/components/ui/Modal";
import { TextArea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useNotice,
  useSubmitNotice,
  useRequestChanges,
  useApproveNotice,
  usePublishNotice,
  useWithdrawNotice,
  useAcknowledgeNotice,
  useDeliveryReport,
} from "./api";

/**
 * A figure in the delivery report: a plain ink number over a small-caps
 * label, columns separated by a hairline rather than filled tiles. The four
 * figures are deliberately never summed into one "delivered" percentage —
 * provider acceptance, device receipt, read and acknowledged are separate
 * evidentiary claims, and each gets equal typographic weight.
 */
function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3 first:pl-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

export function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const { data: notice, isLoading, error } = useNotice(id);
  const report = useDeliveryReport(id, notice?.state === "published");

  const submit = useSubmitNotice();
  const requestChanges = useRequestChanges();
  const approve = useApproveNotice();
  const publish = usePublishNotice();
  const withdraw = useWithdrawNotice();
  const acknowledge = useAcknowledgeNotice();

  const actionError =
    submit.error ||
    requestChanges.error ||
    approve.error ||
    publish.error ||
    withdraw.error ||
    acknowledge.error;

  if (isLoading) {
    return (
      <AppShell width="narrow">
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </CardBody>
        </Card>
      </AppShell>
    );
  }

  if (error || !notice) {
    return (
      <AppShell width="narrow">
        <ErrorBanner error={error ?? new Error("Notice not found")} />
      </AppShell>
    );
  }

  const isAuthor = user?.id === notice.publisher_id;
  const audience = notice.audience_rule.all_verified
    ? "All verified members"
    : [
        notice.audience_rule.account_kind,
        notice.audience_rule.region_code,
        notice.audience_rule.practice_area,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <AppShell width="narrow">
      <Link
        to="/notices"
        className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-faint transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Notices
      </Link>

      <Card className="social-card mb-4">
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SeverityChip severity={notice.severity} />
            <StateChip state={notice.state} />
          </div>
          <h1 className="text-2xl font-semibold leading-snug text-ink">{notice.title}</h1>
          <p className="mt-1.5 text-[0.8125rem] text-faint">
            {notice.published_at
              ? `Published ${formatRelative(notice.published_at)}`
              : `Created ${formatRelative(notice.created_at)}`}
          </p>

          <div className="mt-4">
            <RichText text={withoutMedia(notice.body_markdown)} />
            <MediaAttachments body={notice.body_markdown} source={notice.id} kind="notice" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4 text-[0.8125rem] text-faint">
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              {audience}
            </span>
            {notice.audience_size !== null && (
              <span className="text-accent-700">
                · {notice.audience_size} recipients frozen at publish
              </span>
            )}
          </div>

          {notice.withdrawn_at && (
            <div className="mt-4 border-t border-hairline py-3">
              <p className="text-[0.8125rem] font-semibold text-severity-critical">Withdrawn</p>
              <p className="mt-1 text-[0.8125rem] text-muted">
                Withdrawn {formatDateTime(notice.withdrawn_at)}. Delivery evidence is retained.
              </p>
            </div>
          )}
        </CardBody>
      </Card>

      {actionError != null && (
        <div className="mb-4">
          <ErrorBanner error={actionError} />
        </div>
      )}

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center gap-3">
          {notice.state === "draft" && (
            <Button
              loading={submit.isPending}
              onClick={() => submit.mutate({ id: notice.id, version: notice.version })}
            >
              <Send className="size-4" />
              Submit for review
            </Button>
          )}

          {notice.state === "in_review" && (
            <>
              {isAuthor ? (
                <p className="text-sm text-faint">
                  Awaiting a second approver — an author cannot approve their own notice.
                </p>
              ) : (
                <Button
                  loading={approve.isPending}
                  onClick={() => approve.mutate({ id: notice.id, version: notice.version })}
                >
                  <ThumbsUp className="size-4" />
                  Approve
                </Button>
              )}
              <Button
                variant="secondary"
                loading={requestChanges.isPending}
                onClick={() => requestChanges.mutate({ id: notice.id, version: notice.version })}
              >
                <Undo2 className="size-4" />
                Request changes
              </Button>
            </>
          )}

          {notice.state === "approved" && (
            <Button
              loading={publish.isPending}
              onClick={() => publish.mutate({ id: notice.id, version: notice.version })}
            >
              <Rocket className="size-4" />
              Publish
            </Button>
          )}

          {notice.state === "published" && (
            <>
              <Button
                variant="secondary"
                loading={acknowledge.isPending}
                disabled={acknowledge.isSuccess}
                onClick={() => acknowledge.mutate(notice.id)}
              >
                <CheckCircle2 className="size-4" />
                {acknowledge.isSuccess ? "Acknowledged" : "Acknowledge"}
              </Button>
              <Button variant="ghost" onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </Button>
            </>
          )}

          {notice.state === "withdrawn" && (
            <p className="text-sm text-faint">No further action available.</p>
          )}
        </CardBody>
      </Card>

      {notice.state === "published" && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery evidence</CardTitle>
            <span className="flex items-center gap-1.5 text-[0.8125rem] text-faint">
              <span className="size-1.5 animate-pulse rounded-full bg-accent-600" />
              Live
            </span>
          </CardHeader>
          <CardBody>
            {report.data ? (
              <>
                <div className="grid grid-cols-2 divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
                  <Figure label="Audience" value={report.data.AudienceSize} />
                  <Figure label="Delivered" value={report.data.Delivered} />
                  <Figure label="Read" value={report.data.Read} />
                  <Figure label="Acknowledged" value={report.data.Acknowledged} />
                </div>
                <p className="mt-4 text-[0.8125rem] leading-relaxed text-faint">
                  Provider acceptance is not device receipt — these are counted separately and never
                  collapsed into one number.
                  {report.data.AttemptsFailed > 0 &&
                    ` ${report.data.AttemptsFailed} attempt(s) failed and were retried automatically.`}
                </p>
              </>
            ) : report.error ? (
              <ErrorBanner error={report.error} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-faint">
                <Loader2 className="size-4 animate-spin" />
                Loading delivery report…
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Withdraw notice">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            withdraw.mutate(
              { id: notice.id, version: notice.version, reason: withdrawReason },
              { onSuccess: () => setWithdrawOpen(false) },
            );
          }}
          className="space-y-4"
        >
          <p className="text-sm leading-relaxed text-muted">
            The original notice and its delivery evidence are retained. This reason is recorded in
            the audit trail.
          </p>
          <TextArea
            id="reason"
            label="Reason"
            rows={3}
            required
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={withdraw.isPending}>
              Withdraw
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
