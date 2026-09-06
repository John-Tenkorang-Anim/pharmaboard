import clsx from "clsx";
import type { NoticeSeverity, NoticeState, VerificationState } from "@/lib/types";

// Severity is the one thing this product exists to communicate, so it is
// carried structurally — a tracked-caps kicker plus the weight of the rule
// above the item — not by a pastel pill that makes a drug-safety alert look
// like a UI chip. See severityRule() for the rule half of the pairing.

const severityInk: Record<NoticeSeverity, string> = {
  info: "text-signal-info",
  advisory: "text-signal-advisory",
  urgent: "text-signal-urgent",
  critical: "text-signal-critical",
};

const severityWording: Record<NoticeSeverity, string> = {
  info: "Information",
  advisory: "Advisory",
  urgent: "Urgent",
  critical: "Critical notice",
};

export function SeverityKicker({
  severity,
  className,
}: {
  severity: NoticeSeverity;
  className?: string;
}) {
  return (
    <span className={clsx("kicker", severityInk[severity], className)}>
      {severityWording[severity]}
    </span>
  );
}

/** Rule thickness encodes severity: a critical notice is physically heavier
 *  in the page than an informational one, before you read a word of it. */
export function severityRule(severity: NoticeSeverity): string {
  switch (severity) {
    case "critical":
      return "border-t-[3px] border-signal-critical";
    case "urgent":
      return "border-t-2 border-signal-urgent";
    case "advisory":
      return "border-t border-signal-advisory";
    case "info":
      return "border-t border-rule";
  }
}

const stateWording: Record<NoticeState, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export function StateMark({ state }: { state: NoticeState }) {
  return (
    <span
      className={clsx(
        "label-caps",
        state === "withdrawn" ? "text-signal-critical" : "text-ink-faint",
      )}
    >
      {stateWording[state]}
    </span>
  );
}

export function VerificationMark({ state }: { state: VerificationState }) {
  const verified = state === "verified";
  return (
    <span
      className={clsx(
        "label-caps",
        verified ? "text-ink-muted" : state === "revoked" ? "text-signal-critical" : "text-ink-faint",
      )}
    >
      {verified ? "Verified" : state}
    </span>
  );
}
