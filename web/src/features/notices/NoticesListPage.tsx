import { withoutMedia } from "@/features/media/Media";
import { platform } from "@/lib/platform";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bell, FileText, PenSquare, Search, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SeverityChip, StateChip } from "@/components/ui/Badge";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import type { Notice } from "@/lib/types";
import { useNotices } from "./api";

const examples: Notice[] = [
  {
    title: "September member briefing: what’s coming up",
    severity: "info",
    body_markdown:
      "Join the member briefing on 18 September at 14:00 for a walkthrough of upcoming learning sessions, peer discussions and mentoring opportunities.\n\nThe 45-minute agenda includes a community update, a preview of the learning programme and an open question period. Bring one topic you would like the community to explore next.\n\nNext step: check the Meetings page for available sessions. This is an illustrative notice; no event has been scheduled.",
  },
  {
    title: "Keep your professional directory profile up to date",
    severity: "advisory",
    body_markdown:
      "Please review your practice area, region and professional introduction before the next directory refresh. Accurate profiles help colleagues find the right expertise and build useful connections.\n\nNext step: open your profile, check your details and update any information that has changed.\n\nThis is an illustrative administrative notice. There is no mandatory deadline.",
  },
  {
    title: "Peer mentoring: expressions of interest are open",
    severity: "info",
    body_markdown:
      "Our example mentoring programme connects early-career professionals with experienced colleagues for focused monthly conversations. Suggested topics include career planning, communication and professional development.\n\nParticipants would agree on goals together and meet for 30 minutes each month.\n\nThis is a sample programme announcement. Applications are not being collected.",
  },
  {
    title: "A practical guide to sharing in the community",
    severity: "info",
    body_markdown:
      "Make discussions useful by opening with a clear question, adding relevant context and crediting sources. Keep patient-identifiable information out of posts and replies.\n\nUse RxForum for focused questions and Community for professional experiences and updates.\n\nNext step: explore a discussion and contribute a thoughtful reply. This is sample onboarding content.",
  },
].map((item, i) => ({
  ...item,
  severity: item.severity as Notice["severity"],
  id: `sample-${i}`,
  publisher_id: "",
  state: "published",
  audience_rule: { all_verified: true },
  audience_size: null,
  approved_by: null,
  published_at: `2026-09-0${7 - i}T09:00:00Z`,
  created_at: `2026-09-0${7 - i}T09:00:00Z`,
  withdrawn_at: null,
  version: 1,
}));
const date = (value: string) =>
  new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
export function NoticesListPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState(user?.display_name.includes("Preview") ? "examples" : "published");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Notice | null>(null);
  const { data, isLoading, error } = useNotices(tab !== "workflow");
  const items = useMemo(
    () =>
      (tab === "examples" ? examples : (data?.items ?? []))
        .filter(
          (n) =>
            (priority === "all" || n.severity === priority) &&
            `${n.title} ${withoutMedia(n.body_markdown).replace(/[#*=]/g, "")}`
              .toLowerCase()
              .includes(search.toLowerCase().trim()),
        )
        .sort(
          (a, b) =>
            (sort === "newest" ? -1 : 1) *
            (a.published_at ?? a.created_at).localeCompare(b.published_at ?? b.created_at),
        ),
    [tab, data, priority, search, sort],
  );
  return (
    <AppShell>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-700">
            Member communications
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Noticeboard</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            Stay informed. Find the updates, announcements and actions that matter to your
            professional community.
          </p>
        </div>
        <Link to="/notices/compose">
          <Button>
            <PenSquare className="size-4" />
            Compose notice
          </Button>
        </Link>
      </header>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_270px]">
        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Notice collection">
            {[
              ["published", "Published"],
              ["workflow", "Publishing workspace"],
              ["examples", "Sample notices"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value!)}
                aria-pressed={tab === value}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === value ? "bg-ink text-white" : "bg-slate-50 text-muted hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mb-6 flex flex-wrap gap-3">
            <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-hairline bg-white px-3">
              <Search className="size-4 text-faint" />
              <input
                aria-label="Search notices"
                placeholder="Search notices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </label>
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-lg border border-hairline bg-white px-3 text-sm"
            >
              <option value="all">All priorities</option>
              <option value="info">Information</option>
              <option value="advisory">Advisory</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
            <select
              aria-label="Sort notices"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-hairline bg-white px-3 py-3 text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>
          {tab === "examples" ? (
            <p className="mb-5 rounded-lg bg-slate-50 px-4 py-3 text-xs leading-5 text-muted">
              Illustrative sample content. These notices have not been published or sent to members.
            </p>
          ) : (
            <ErrorBanner error={error} />
          )}
          {isLoading && tab !== "examples" ? (
            <SkeletonList rows={4} />
          ) : (
            <>
              <p className="mb-4 text-xs text-faint" role="status">
                {items.length} {items.length === 1 ? "notice" : "notices"}
                {search ? ` matching “${search}”` : ""}
              </p>
              <div className="space-y-4">
                {items.map((n) => (
                  <article key={n.id} className="social-card p-6 transition-shadow hover:shadow-md">
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-faint">
                      <SeverityChip severity={n.severity} />
                      {tab === "workflow" && <StateChip state={n.state} />}
                      <span>{date(n.published_at ?? n.created_at)}</span>
                      {tab === "examples" && <span>Sample notice</span>}
                    </div>
                    <h2 className="text-lg font-semibold leading-7 text-ink">
                      {tab === "examples" ? (
                        <button
                          className="text-left hover:text-accent-700"
                          onClick={() => setSelected(n)}
                        >
                          {n.title}
                        </button>
                      ) : (
                        <Link className="hover:text-accent-700" to={`/notices/${n.id}`}>
                          {n.title}
                        </Link>
                      )}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                      {withoutMedia(n.body_markdown).replace(/[#*=]/g, "")}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-xs text-faint">
                        <Users className="size-4" />
                        {n.audience_rule.all_verified
                          ? "All verified members"
                          : [
                              n.audience_rule.account_kind,
                              n.audience_rule.region_code,
                              n.audience_rule.practice_area,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Selected members"}
                      </span>
                      {tab === "examples" ? (
                        <button
                          onClick={() => setSelected(n)}
                          className="flex items-center gap-1 text-sm font-medium text-accent-700"
                        >
                          Read notice <ArrowUpRight className="size-4" />
                        </button>
                      ) : (
                        <Link
                          to={`/notices/${n.id}`}
                          className="flex items-center gap-1 text-sm font-medium text-accent-700"
                        >
                          Read notice <ArrowUpRight className="size-4" />
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!items.length && (
                <div className="rounded-xl bg-slate-50 p-10 text-center">
                  <Bell className="mx-auto mb-3 size-6 text-faint" />
                  <h2 className="font-semibold">No notices found</h2>
                  <p className="mt-2 text-sm text-muted">
                    Try another search or priority, or explore the sample notices.
                  </p>
                  <button
                    className="mt-4 text-sm text-accent-700"
                    onClick={() => {
                      setSearch("");
                      setPriority("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-xl bg-slate-50 p-5">
            <FileText className="mb-4 size-5 text-accent-700" />
            <h2 className="font-semibold text-ink">A reliable place for updates</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Published notices pass through review before reaching members. Open a notice to read
              its full message and acknowledge it.
            </p>
            <Link
              to="/notices/compose"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-700"
            >
              Prepare a notice <ArrowUpRight className="size-4" />
            </Link>
          </section>
          <section className="px-1">
            <h2 className="text-sm font-semibold">Looking for a conversation?</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Share experiences in Community, or ask a focused professional question in{" "}
              {platform.forumName}.
            </p>
            <div className="mt-4 flex gap-4 text-sm font-medium text-accent-700">
              <Link to="/home">Community ↗</Link>
              <Link to="/forum">{platform.forumName} ↗</Link>
            </div>
          </section>
        </aside>
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Sample notice">
        {selected && (
          <div>
            <SeverityChip severity={selected.severity} />
            <h2 className="mt-4 text-xl font-semibold">{selected.title}</h2>
            <p className="mt-2 text-xs text-faint">
              {date(selected.published_at!)} · All verified members
            </p>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-muted">
              {selected.body_markdown}
            </p>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
