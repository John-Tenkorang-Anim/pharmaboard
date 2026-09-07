import clsx from "clsx";
import type { NoticeSeverity, NoticeState, VerificationState } from "@/lib/types";

/**
 * Chip is a status marker: a coloured dot plus plain text, no filled
 * background. Colour carries the meaning here, not a filled surface.
 */
export function Chip({
  children,
  className,
  dot,
}: {
  children: React.ReactNode;
  className?: string;
  dot?: string;
}) {
  return (
    <span className={clsx("marker", className)}>
      {dot && <span className={clsx("marker-dot", dot)} />}
      {children}
    </span>
  );
}

const severityStyles: Record<NoticeSeverity, { dot: string; text: string; label: string }> = {
  info: { dot: "bg-severity-info", text: "text-severity-info", label: "Info" },
  advisory: { dot: "bg-severity-advisory", text: "text-severity-advisory", label: "Advisory" },
  urgent: { dot: "bg-severity-urgent", text: "text-severity-urgent", label: "Urgent" },
  critical: {
    dot: "bg-severity-critical",
    text: "text-severity-critical font-semibold",
    label: "Critical",
  },
};

export function SeverityChip({ severity }: { severity: NoticeSeverity }) {
  const s = severityStyles[severity];
  return (
    <Chip className={s.text} dot={s.dot}>
      {s.label}
    </Chip>
  );
}

const stateStyles: Record<NoticeState, { dot: string; text: string }> = {
  draft: { dot: "bg-faint", text: "text-muted" },
  in_review: { dot: "bg-severity-advisory", text: "text-severity-advisory" },
  approved: { dot: "bg-severity-info", text: "text-severity-info" },
  published: { dot: "bg-accent-600", text: "text-accent-700" },
  withdrawn: { dot: "bg-severity-critical", text: "text-severity-critical" },
};

const stateLabels: Record<NoticeState, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export function StateChip({ state }: { state: NoticeState }) {
  const s = stateStyles[state];
  return (
    <Chip className={s.text} dot={s.dot}>
      {stateLabels[state]}
    </Chip>
  );
}

const verificationStyles: Record<VerificationState, { dot: string; text: string; label: string }> =
  {
    unverified: { dot: "bg-faint", text: "text-muted", label: "Unverified" },
    pending: { dot: "bg-severity-advisory", text: "text-severity-advisory", label: "Pending" },
    verified: { dot: "bg-accent-600", text: "text-accent-700", label: "Verified" },
    revoked: { dot: "bg-severity-critical", text: "text-severity-critical", label: "Revoked" },
  };

export function VerificationChip({ state }: { state: VerificationState }) {
  const s = verificationStyles[state];
  return (
    <Chip className={s.text} dot={s.dot}>
      {s.label}
    </Chip>
  );
}
