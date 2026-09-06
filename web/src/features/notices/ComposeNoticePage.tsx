import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { AppShell } from "@/components/layout/AppShell";
import { TextInput, TextArea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SeverityKicker } from "@/components/ui/Badge";
import type { AudienceRule, NoticeSeverity } from "@/lib/types";
import { useCreateNotice } from "./api";

type AudienceMode = "all_verified" | "filtered";

const severities: NoticeSeverity[] = ["info", "advisory", "urgent", "critical"];

export function ComposeNoticePage() {
  const navigate = useNavigate();
  const createNotice = useCreateNotice();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<NoticeSeverity>("advisory");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("all_verified");
  const [accountKind, setAccountKind] = useState("");
  const [regionCode, setRegionCode] = useState("");
  const [practiceArea, setPracticeArea] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const audience_rule: AudienceRule =
      audienceMode === "all_verified"
        ? { all_verified: true }
        : {
            ...(accountKind ? { account_kind: accountKind } : {}),
            ...(regionCode ? { region_code: regionCode } : {}),
            ...(practiceArea ? { practice_area: practiceArea } : {}),
          };

    const notice = await createNotice.mutateAsync({
      title,
      body_markdown: body,
      severity,
      audience_rule,
    });
    navigate(`/notices/${notice.id}`);
  }

  return (
    <AppShell kicker="Draft" title="Compose a notice">
      <form onSubmit={handleSubmit} className="mx-auto max-w-prose">
        <section className="border-t border-rule pt-6">
          <p className="label-caps mb-4 text-ink-faint">The notice</p>
          <div className="space-y-5">
            <TextInput
              id="title"
              label="Title"
              placeholder="New dispensing guidance for amoxicillin"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={5}
              maxLength={200}
              required
            />
            <TextArea
              id="body"
              label="Body"
              rows={10}
              placeholder="Set out the guidance in full. This text is what recipients will read."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="font-display text-[1rem] leading-[1.7]"
              required
            />
          </div>
        </section>

        <section className="mt-10 border-t border-rule pt-6">
          <p className="label-caps mb-1 text-ink-faint">Severity</p>
          <p className="mb-4 max-w-measure font-sans text-meta leading-relaxed text-ink-muted">
            Severity sets how forcefully this notice presents itself in the register, and whether a
            second approver is required before it can publish.
          </p>
          <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
            {severities.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSeverity(option)}
                className={clsx(
                  "bg-paper px-3 py-3.5 text-left transition-colors",
                  severity === option ? "bg-paper-raised ring-1 ring-inset ring-ink" : "hover:bg-paper-raised",
                )}
              >
                <SeverityKicker severity={option} />
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 border-t border-rule pt-6">
          <p className="label-caps mb-1 text-ink-faint">Audience</p>
          <p className="mb-4 max-w-measure font-sans text-meta leading-relaxed text-ink-muted">
            The audience is evaluated and frozen at the moment of publication — every recipient is
            recorded in the same transaction, and never recalculated afterwards.
          </p>
          <div className="mb-4 flex items-baseline gap-5">
            {[
              { value: "all_verified" as const, label: "All verified users" },
              { value: "filtered" as const, label: "Filtered" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAudienceMode(opt.value)}
                className={clsx(
                  "label-caps pb-1 transition-colors",
                  audienceMode === opt.value
                    ? "border-b-2 border-ink text-ink"
                    : "border-b-2 border-transparent text-ink-faint hover:text-ink-muted",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {audienceMode === "filtered" && (
            <div className="grid grid-cols-1 gap-4 border-l-2 border-rule pl-5 sm:grid-cols-3">
              <Select
                id="accountKind"
                label="Account kind"
                value={accountKind}
                onChange={(e) => setAccountKind(e.target.value)}
              >
                <option value="">Any</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="student">Student</option>
                <option value="organisation">Organisation</option>
              </Select>
              <TextInput
                id="regionCode"
                label="Region code"
                placeholder="GA"
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value)}
              />
              <TextInput
                id="practiceArea"
                label="Practice area"
                value={practiceArea}
                onChange={(e) => setPracticeArea(e.target.value)}
              />
            </div>
          )}
        </section>

        {createNotice.error != null && (
          <div className="mt-8">
            <ErrorBanner error={createNotice.error} />
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-rule pt-5">
          <Button type="button" variant="quiet" onClick={() => navigate(-1)}>
            Discard
          </Button>
          <Button type="submit" loading={createNotice.isPending}>
            Save draft
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
