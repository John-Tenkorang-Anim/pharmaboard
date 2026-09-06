import { useState } from "react";
import { useParams } from "react-router-dom";
import clsx from "clsx";
import { AppShell } from "@/components/layout/AppShell";
import { SeverityKicker, StateMark, severityRule } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Modal } from "@/components/ui/Modal";
import { TextArea } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/format";
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

/** Delivery figures set as a magazine data feature: display numerals over
 *  tracked-caps labels, divided by rules. */
function Figure({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex-1 px-5 first:pl-0 last:pr-0">
      <p
        className={clsx(
          "font-display tabular-nums leading-none",
          emphasis ? "text-display-lg text-ink" : "text-display-md text-ink-muted",
        )}
      >
        {value}
      </p>
      <p className="label-caps mt-2.5 text-ink-faint">{label}</p>
    </div>
  );
}

/** A metadata row in the byline block: caps label, mono value. */
function Datum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-caps text-ink-faint">{label}</p>
      <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed text-ink-muted">{value}</p>
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
    submit.error || requestChanges.error || approve.error || publish.error || withdraw.error;

  if (isLoading) {
    return (
      <AppShell kicker="Notice" title="&nbsp;">
        <div className="mx-auto max-w-prose">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-10 w-3/4" />
          <Skeleton className="mt-8 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-5/6" />
        </div>
      </AppShell>
    );
  }

  if (error || !notice) {
    return (
      <AppShell kicker="Notice" title="Not found">
        <div className="mx-auto max-w-prose">
          <ErrorBanner error={error ?? new Error("Notice not found")} />
        </div>
      </AppShell>
    );
  }

  const isAuthor = user?.id === notice.publisher_id;
  const audience = notice.audience_rule.all_verified
    ? "All verified users"
    : [
        notice.audience_rule.account_kind && `kind: ${notice.audience_rule.account_kind}`,
        notice.audience_rule.region_code && `region: ${notice.audience_rule.region_code}`,
        notice.audience_rule.practice_area && `practice: ${notice.audience_rule.practice_area}`,
      ]
        .filter(Boolean)
        .join("  ·  ");

  return (
    <AppShell kicker="Notice" title="&nbsp;">
      <article className="mx-auto max-w-prose">
        {/* Standfirst: severity rule, kicker, headline — the notice announces
            its own gravity before the reader reaches the text. */}
        <header className={clsx("pt-6", severityRule(notice.severity))}>
          <div className="flex items-baseline justify-between gap-4">
            <SeverityKicker severity={notice.severity} />
            <StateMark state={notice.state} />
          </div>
          <h1
            className={clsx(
              "mt-3 font-display text-ink",
              notice.severity === "critical"
                ? "text-display-xl font-medium"
                : "text-display-lg font-normal",
            )}
          >
            {notice.title}
          </h1>
        </header>

        {/* Byline block */}
        <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-rule py-4 sm:grid-cols-4">
          <Datum
            label="Issued"
            value={notice.published_at ? formatDateTime(notice.published_at) : "Not yet published"}
          />
          <Datum label="Audience" value={audience} />
          <Datum
            label="Frozen recipients"
            value={notice.audience_size !== null ? String(notice.audience_size) : "—"}
          />
          <Datum label="Version" value={String(notice.version)} />
        </div>

        {/* Body, set in the text face at a proper reading measure. */}
        <div className="py-9">
          <p className="whitespace-pre-wrap font-display text-[1.125rem] leading-[1.75] text-ink">
            {notice.body_markdown}
          </p>
        </div>

        {notice.withdrawn_at && (
          <div className="mb-8 border-l-2 border-signal-critical bg-paper-sunken px-4 py-3">
            <p className="kicker text-signal-critical">Withdrawn</p>
            <p className="mt-1.5 font-sans text-[0.8125rem] text-ink">
              This notice was withdrawn on {formatDateTime(notice.withdrawn_at)}. The original
              delivery evidence is retained.
            </p>
          </div>
        )}

        {actionError && (
          <div className="mb-6">
            <ErrorBanner error={actionError} />
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-rule pt-5">
          <p className="label-caps mb-3 text-ink-faint">Actions</p>
          <div className="flex flex-wrap items-center gap-3">
            {notice.state === "draft" && (
              <Button
                loading={submit.isPending}
                onClick={() => submit.mutate({ id: notice.id, version: notice.version })}
              >
                Submit for review
              </Button>
            )}

            {notice.state === "in_review" && (
              <>
                {isAuthor ? (
                  <p className="font-sans text-[0.8125rem] text-ink-muted">
                    Awaiting a second approver — an author may not approve their own notice.
                  </p>
                ) : (
                  <Button
                    loading={approve.isPending}
                    onClick={() => approve.mutate({ id: notice.id, version: notice.version })}
                  >
                    Approve
                  </Button>
                )}
                <Button
                  variant="secondary"
                  loading={requestChanges.isPending}
                  onClick={() => requestChanges.mutate({ id: notice.id, version: notice.version })}
                >
                  Request changes
                </Button>
              </>
            )}

            {notice.state === "approved" && (
              <Button
                loading={publish.isPending}
                onClick={() => publish.mutate({ id: notice.id, version: notice.version })}
              >
                Publish to {notice.audience_rule.all_verified ? "all verified" : "audience"}
              </Button>
            )}

            {notice.state === "published" && (
              <>
                <Button
                  variant="secondary"
                  loading={acknowledge.isPending}
                  onClick={() => acknowledge.mutate(notice.id)}
                >
                  Acknowledge receipt
                </Button>
                <Button variant="quiet" onClick={() => setWithdrawOpen(true)}>
                  Withdraw this notice
                </Button>
              </>
            )}

            {notice.state === "withdrawn" && (
              <p className="font-sans text-[0.8125rem] text-ink-muted">
                No further action is available on a withdrawn notice.
              </p>
            )}
          </div>
        </div>

        {/* Delivery evidence */}
        {notice.state === "published" && (
          <section className="mt-12">
            <div className="mb-5 flex items-baseline justify-between border-b border-rule pb-2">
              <h2 className="label-caps text-ink">Delivery evidence</h2>
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                Updating live
              </span>
            </div>

            {report.data ? (
              <>
                <div className="flex divide-x divide-rule">
                  <Figure label="Audience" value={report.data.AudienceSize} emphasis />
                  <Figure label="Delivered" value={report.data.Delivered} />
                  <Figure label="Read" value={report.data.Read} />
                  <Figure label="Acknowledged" value={report.data.Acknowledged} />
                </div>
                <p className="mt-5 max-w-measure font-sans text-meta leading-relaxed text-ink-faint">
                  Provider acceptance is not device receipt. These figures are counted separately
                  and never collapsed into a single &ldquo;delivered&rdquo; number.
                  {report.data.AttemptsFailed > 0 &&
                    ` ${report.data.AttemptsFailed} send attempt(s) failed and were retried automatically.`}
                </p>
              </>
            ) : (
              <div className="flex gap-8">
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-10 w-16" />
              </div>
            )}
          </section>
        )}
      </article>

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Withdraw notice">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            withdraw.mutate(
              { id: notice.id, version: notice.version, reason: withdrawReason },
              { onSuccess: () => setWithdrawOpen(false) },
            );
          }}
          className="space-y-5"
        >
          <p className="font-sans text-[0.8125rem] leading-relaxed text-ink-muted">
            The original notice and its delivery evidence are retained. The reason below is
            recorded in the audit trail and shown alongside the withdrawal.
          </p>
          <TextArea
            id="reason"
            label="Reason for withdrawal"
            rows={3}
            required
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
          />
          <div className="flex justify-end gap-3">
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
