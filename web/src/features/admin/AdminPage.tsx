import { useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { TextInput, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/format";
import { useAuditEvents, useBootstrap, useGrantRole, useVerifyUser, useRevokeUser } from "./api";

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-rule pt-6">
      <p className="label-caps text-ink">{title}</p>
      {note && (
        <p className="mt-1.5 max-w-measure font-sans text-meta leading-relaxed text-ink-muted">
          {note}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Result({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <p className="mt-3 font-sans text-meta text-ink-muted">✓ {children}</p>;
}

function BootstrapSection() {
  const [token, setToken] = useState("");
  const bootstrap = useBootstrap();

  return (
    <Section
      title="Bootstrap the first administrator"
      note="Available once per database. The window closes permanently as soon as any publisher_admin exists; afterwards, roles are granted by an existing administrator below."
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          bootstrap.mutate(token);
        }}
        className="flex items-end gap-3"
      >
        <TextInput
          label="Bootstrap token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="flex-1"
          required
        />
        <Button type="submit" size="md" loading={bootstrap.isPending}>
          Claim
        </Button>
      </form>
      {bootstrap.error != null && (
        <div className="mt-3">
          <ErrorBanner error={bootstrap.error} />
        </div>
      )}
      <Result show={bootstrap.isSuccess}>You now hold publisher_admin.</Result>
    </Section>
  );
}

function GrantRoleSection() {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("approver");
  const grantRole = useGrantRole();

  return (
    <Section
      title="Grant a role"
      note="Least-privilege institutional roles. An approver may clear a notice they did not write; a publisher_admin may grant roles and record verification decisions."
    >
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          grantRole.mutate({ user_id: userId, role });
        }}
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
      >
        <TextInput
          label="User ID"
          placeholder="00000000-0000-0000-0000-000000000000"
          className="font-mono text-xs"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
        />
        <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="author">author</option>
          <option value="approver">approver</option>
          <option value="publisher_admin">publisher_admin</option>
          <option value="auditor">auditor</option>
        </Select>
        <Button type="submit" loading={grantRole.isPending}>
          Grant
        </Button>
      </form>
      {grantRole.error != null && (
        <div className="mt-3">
          <ErrorBanner error={grantRole.error} />
        </div>
      )}
      <Result show={grantRole.isSuccess}>Role granted.</Result>
    </Section>
  );
}

function VerificationSection() {
  const [userId, setUserId] = useState("");
  const [regNo, setRegNo] = useState("");
  const [reason, setReason] = useState("");
  const verify = useVerifyUser();
  const revoke = useRevokeUser();

  return (
    <Section
      title="Professional verification"
      note="Every decision records its reviewer, evidence source, reason and time in the audit trail. Revoking a badge never deletes the member's history."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextInput
          label="User ID"
          className="font-mono text-xs"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
        />
        <TextInput
          label="Registration number"
          placeholder="PC-00000"
          value={regNo}
          onChange={(e) => setRegNo(e.target.value)}
        />
        <TextInput
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <Button
          loading={verify.isPending}
          onClick={() =>
            verify.mutate({
              user_id: userId,
              registration_number: regNo,
              evidence_source: "manual_review",
              reason,
            })
          }
        >
          Verify
        </Button>
        <Button
          variant="danger"
          loading={revoke.isPending}
          onClick={() => revoke.mutate({ user_id: userId, reason })}
        >
          Revoke
        </Button>
      </div>
      {(verify.error != null || revoke.error != null) && (
        <div className="mt-3">
          <ErrorBanner error={verify.error || revoke.error} />
        </div>
      )}
      <Result show={verify.isSuccess}>Verification recorded.</Result>
      <Result show={revoke.isSuccess}>Verification revoked.</Result>
    </Section>
  );
}

function AuditSection() {
  const { data, isLoading, error } = useAuditEvents();

  return (
    <Section
      title="Audit trail"
      note="Append-only, enforced at the database. Entries are written in the same transaction as the change they describe."
    >
      {error != null && <ErrorBanner error={error} />}
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : error != null ? null : data && data.items.length > 0 ? (
        <div className="scrollbar-thin max-h-[26rem] overflow-y-auto">
          {data.items
            .slice()
            .reverse()
            .map((event) => (
              <div
                key={event.ID}
                className="flex items-baseline justify-between gap-6 border-t border-rule py-3"
              >
                <div className="min-w-0">
                  <p className="font-sans text-[0.8125rem] text-ink">{event.Action}</p>
                  <p className="mt-0.5 truncate font-mono text-[0.625rem] text-ink-faint">
                    {event.SubjectType}
                    {event.SubjectID && ` · ${event.SubjectID}`}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
                  {formatDateTime(event.OccurredAt)}
                </span>
              </div>
            ))}
          <div className="border-t border-rule" />
        </div>
      ) : (
        <EmptyState title="No audit events recorded" />
      )}
    </Section>
  );
}

export function AdminPage() {
  return (
    <AppShell kicker="Administration" title="Roles &amp; audit">
      <div className="mx-auto max-w-prose space-y-10">
        <BootstrapSection />
        <GrantRoleSection />
        <VerificationSection />
        <AuditSection />
      </div>
    </AppShell>
  );
}
