import { useState, useEffect, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Play,
  Plus,
  Search,
  Video,
  CalendarDays,
  BriefcaseBusiness,
  GraduationCap,
  MapPin,
  Trash2,
  Pencil,
  Copy,
  Hash,
} from "lucide-react";
import { MeetingRoom } from "@/features/messaging/MeetingRoom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useAuth } from "@/features/auth/AuthContext";
import {
  meetingCode,
  useJoinMeeting,
  useResources,
  useResourceActions,
  youtubeId,
  type Resource,
  type ResourceKind,
} from "./api";
const config = {
  learning: {
    eyebrow: "PHARMABOARD ACADEMY",
    title: "Keep your curiosity alive.",
    description:
      "Learn from your community. Build a personal library of pharmacy lectures, practical insights, and professional development.",
    action: "Share a lesson",
    icon: GraduationCap,
    categories: ["All topics", "Clinical pharmacy", "Research", "Leadership", "Career development"],
  },
  jobs: {
    eyebrow: "CAREER OPPORTUNITIES",
    title: "Your next chapter starts here.",
    description:
      "Discover opportunities shared by the profession. Find your fit, save your shortlist, and connect with the people behind the work.",
    action: "Post an opportunity",
    icon: BriefcaseBusiness,
    categories: [
      "All opportunities",
      "Full-time",
      "Part-time",
      "Internship",
      "Fellowship",
      "Remote",
    ],
  },
  sessions: {
    eyebrow: "COLLABORATION SPACE",
    title: "Better work happens together.",
    description:
      "Bring your study group, research team, or professional community together. Schedule a session and keep the conversation going.",
    action: "Schedule a session",
    icon: Video,
    categories: ["All sessions", "Study group", "Journal club", "Webinar", "Team meeting"],
  },
};
const field = "mt-1 w-full rounded-lg border border-divider bg-white px-3 py-2 text-sm";
function ResourceForm({
  kind,
  onClose,
  initial,
}: {
  kind: ResourceKind;
  onClose: () => void;
  initial?: Resource;
}) {
  const { publish } = useResourceActions();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = Object.fromEntries(f.entries());
    try {
      await publish.mutateAsync({
        ...value,
        url:
          kind === "sessions"
            ? (initial?.url ?? `https://meet.jit.si/PharmaBoard-${id}`)
            : String(value.url),
        id,
        kind,
        starts_at: value.starts_at ? new Date(String(value.starts_at)).toISOString() : null,
      });
      onClose();
    } catch {
      /* Mutation error is rendered below. */
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted">
        Shared with PharmaBoard members. Include accurate source details and only share content you
        have permission to distribute.
      </p>
      <label className="block text-sm font-medium">
        Title
        <input
          name="title"
          defaultValue={initial?.title}
          required
          maxLength={160}
          className={field}
        />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm font-medium">
          {kind === "learning" ? "Educator / channel" : "Organization / host"}
          <input
            name="organization"
            defaultValue={initial?.organization}
            required
            maxLength={160}
            className={field}
          />
        </label>
        <label className="block text-sm font-medium">
          Category
          <select defaultValue={initial?.category} name="category" className={field}>
            {config[kind].categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {kind !== "sessions" && (
        <label className="block text-sm font-medium">
          {kind === "learning" ? "YouTube video link" : "Application link"}
          <input
            name="url"
            defaultValue={initial?.url}
            type="url"
            pattern="https://.*"
            required
            maxLength={2048}
            placeholder="https://"
            className={field}
          />
        </label>
      )}
      {kind === "sessions" && (
        <label className="block text-sm font-medium">
          Start time (your local time)
          <input
            name="starts_at"
            defaultValue={
              initial?.starts_at
                ? new Date(
                    new Date(initial.starts_at).getTime() -
                      new Date(initial.starts_at).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : undefined
            }
            type="datetime-local"
            required
            className={field}
          />
        </label>
      )}
      {kind === "jobs" && (
        <label className="block text-sm font-medium">
          Location
          <input
            name="location"
            defaultValue={initial?.location}
            required
            maxLength={160}
            placeholder="Accra, Ghana · Hybrid"
            className={field}
          />
        </label>
      )}
      <label className="block text-sm font-medium">
        {kind === "learning" ? "Overview and chapters" : "Description"}
        <textarea
          name="description"
          defaultValue={initial?.description}
          required
          rows={4}
          maxLength={8000}
          className={field}
          placeholder={
            kind === "learning"
              ? "What will members learn? Add chapter timestamps, e.g. 00:00 Introduction."
              : "Include the details members need to decide whether to join or apply."
          }
        />
      </label>
      <ErrorBanner error={publish.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={publish.isPending}>Publish</Button>
      </div>
    </form>
  );
}
function calendarFile(v: Resource) {
  if (!v.starts_at) return;
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/[,;]/g, "\\$&");
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PharmaBoard//Sessions//EN",
    "BEGIN:VEVENT",
    `UID:${v.id}@pharmaboard`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(v.starts_at))}`,
    `DTEND:${stamp(new Date(new Date(v.starts_at).getTime() + 3600000))}`,
    `SUMMARY:${escape(v.title)}`,
    `DESCRIPTION:${escape(v.description)}`,
    `URL:${v.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pharmaboard-session.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function WorkspacePage({ kind }: { kind: ResourceKind }) {
  const [params, setParams] = useSearchParams();
  const [joinOpen, setJoinOpen] = useState(() => kind === "sessions" && !!params.get("code"));
  const [joinCode, setJoinCode] = useState(params.get("code") ?? "");
  const join = useJoinMeeting();
  useEffect(() => {
    const code = params.get("code");
    if (kind === "sessions" && code) {
      setJoinCode(code);
      setJoinOpen(true);
    }
  }, [kind, params]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<unknown>(null);
  async function copyInvite(v: Resource) {
    try {
      await navigator.clipboard.writeText(
        `${v.title}\nMeeting code: ${meetingCode(v.id)}\n${window.location.origin}/sessions?code=${meetingCode(v.id)}`,
      );
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(
        new Error(
          "Could not copy automatically. Select the meeting code below to copy it manually.",
        ),
      );
    }
  }
  const c = config[kind];
  const Icon = c.icon;
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(c.categories[0]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<Resource | undefined>();
  const [meeting, setMeeting] = useState<Resource | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage } = useResources(
    kind,
    debounced,
    category === c.categories[0] ? "" : category,
    savedOnly,
  );
  const { save, remove } = useResourceActions();
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const active = selected ? (items.find((v) => v.id === selected.id) ?? selected) : null;
  return (
    <AppShell>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow text-accent-600">{c.eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{c.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{c.description}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {kind === "sessions" && (
            <Button variant="secondary" onClick={() => setJoinOpen(true)}>
              <Hash size={16} />
              Join with code
            </Button>
          )}
          <Button onClick={() => setCreate(true)}>
            <Plus size={16} />
            {c.action}
          </Button>
        </div>
      </div>
      {kind === "sessions" && (
        <div className="mb-7">
          <Link
            to="/messaging"
            className="flex items-center gap-4 border-y border-hairline bg-white p-5"
          >
            <span className="text-accent-600">
              <Video />
            </span>
            <div>
              <h2 className="font-semibold">Start with a conversation</h2>
              <p className="mt-1 text-sm text-muted">Group messages and instant video calls</p>
            </div>
            <ArrowUpRight className="ml-auto shrink-0" size={18} />
          </Link>
        </div>
      )}
      {meeting && (
        <div className="mb-7">
          <MeetingRoom url={meeting.url} title={meeting.title} onLeave={() => setMeeting(null)} />
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={(e) => e.preventDefault()} className="relative min-w-0 flex-1 md:max-w-sm">
          <Search size={17} className="absolute left-3 top-3 text-muted" />
          <input
            aria-label={`Search ${kind}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
            placeholder={
              kind === "jobs"
                ? "Search roles, organizations, locations…"
                : "Search titles, hosts, topics…"
            }
            className="w-full rounded-lg border border-hairline bg-white py-2.5 pl-10 pr-3 text-sm"
          />
        </form>
        <Button
          variant={savedOnly ? "primary" : "secondary"}
          onClick={() => setSavedOnly(!savedOnly)}
          aria-pressed={savedOnly}
        >
          <Bookmark size={15} />
          {kind === "learning" ? "My learning" : "Saved"}
        </Button>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {c.categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            aria-pressed={category === cat}
            className={`border-b-2 px-1 py-2 text-xs font-medium ${category === cat ? "border-accent-600 text-accent-700" : "border-transparent bg-white text-muted hover:border-accent-600"}`}
          >
            {cat}
          </button>
        ))}
      </div>
      <ErrorBanner error={error || save.error || remove.error} />
      {isLoading ? (
        <div role="status" className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="shimmer h-64 rounded-xl" />
          ))}
          <span className="sr-only">Loading resources</span>
        </div>
      ) : !error && items.length === 0 ? (
        <div className="border-y border-hairline bg-white px-6 py-16 text-center">
          <Icon className="mx-auto mb-4 text-accent-600" size={36} />
          <h2 className="text-lg font-semibold">
            {search || savedOnly || category !== c.categories[0]
              ? "No matching resources"
              : "A space for what comes next"}
          </h2>
          <p className="mx-auto mb-5 mt-2 max-w-md text-sm leading-6 text-muted">
            {savedOnly
              ? "Save resources to find them here whenever you need them."
              : search
                ? "Try a different title, organization, or topic."
                : `Be the first to ${kind === "learning" ? "share a useful lesson" : kind === "jobs" ? "share an opportunity" : "bring your community together"}. Published resources will appear here for all members.`}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              if (search || savedOnly) {
                setSearch("");
                setSavedOnly(false);
                setCategory(c.categories[0]);
              } else setCreate(true);
            }}
          >
            {search || savedOnly ? "Browse all" : c.action}
          </Button>
        </div>
      ) : (
        <div
          className={`grid gap-5 ${kind === "learning" ? "md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"}`}
        >
          {items.map((v) => (
            <article key={v.id} className={kind === "jobs" ? "social-card overflow-hidden p-5" : "overflow-hidden border-b border-hairline bg-white"}>
              {kind === "learning" && (
                <button
                  onClick={() => setSelected(v)}
                  aria-label={`Watch ${v.title}`}
                  className="relative flex aspect-video w-full items-center justify-center bg-slate-900"
                >
                  {!v.id.startsWith("00000000-") && youtubeId(v.url) && (
                    <img
                      loading="lazy"
                      src={`https://i.ytimg.com/vi/${youtubeId(v.url)}/hqdefault.jpg`}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-70"
                    />
                  )}
                  {v.id.startsWith("00000000-") && (
                    <div
                      className={`absolute inset-0 flex flex-col justify-between p-5 text-left text-white ${v.category === "Leadership" ? "bg-[#334258]" : v.category === "Research" ? "bg-[#273F69]" : v.category === "Clinical pharmacy" ? "bg-[#36465D]" : "bg-[#253346]"}`}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-200">
                        ACADEMY / {v.category}
                      </span>
                      <strong className="max-w-[90%] text-xl font-medium leading-tight">
                        {v.title}
                      </strong>
                      <span className="text-[10px] uppercase tracking-widest text-white/60">
                        Sample lesson · PharmaBoard
                      </span>
                    </div>
                  )}
                  <span
                    className={`bg-white/95 p-3 text-ink ${v.id.startsWith("00000000-") ? "absolute bottom-4 right-4 rounded-md" : "relative rounded-full"}`}
                  >
                    <Play size={22} fill="currentColor" />
                  </span>
                  {v.completed && (
                    <span className="absolute left-3 top-3 rounded-md bg-accent-600 px-3 py-1 text-xs text-white">
                      Completed
                    </span>
                  )}
                </button>
              )}
              <div className={kind === "learning" ? "py-4" : "relative py-5 pl-16 pr-2"}>
                {kind === "jobs" && (
                  <span
                    className="absolute left-0 top-6 flex size-11 items-center justify-center rounded-md bg-slate-100 text-base font-semibold text-ink"
                    aria-hidden="true"
                  >
                    {v.organization
                      .replace(/^Sample /, "")
                      .split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")}
                  </span>
                )}
                {kind === "sessions" && v.starts_at && (
                  <div className="absolute left-0 top-6 w-11 border-y border-hairline py-1 text-center">
                    <span className="block text-[10px] font-medium uppercase text-accent-700">
                      {new Date(v.starts_at).toLocaleString(undefined, { month: "short" })}
                    </span>
                    <span className="text-xl font-semibold">{new Date(v.starts_at).getDate()}</span>
                  </div>
                )}

                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="rounded-md bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
                    {v.category}
                  </span>
                  <button
                    disabled={save.isPending}
                    onClick={() =>
                      save.mutate({ id: v.id, saved: !v.saved, completed: v.completed })
                    }
                    aria-label={v.saved ? "Unsave resource" : "Save resource"}
                    aria-pressed={v.saved}
                    className="rounded p-2 text-muted hover:bg-canvas"
                  >
                    <Bookmark size={17} fill={v.saved ? "currentColor" : "none"} />
                  </button>
                </div>
                <button
                  onClick={() => setSelected(v)}
                  className="text-left text-lg font-semibold leading-6 hover:text-accent-600"
                >
                  {v.title}
                </button>
                <p className="mt-2 text-sm text-muted">{v.organization}</p>
                {v.location && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <MapPin size={13} />
                    {v.location}
                  </p>
                )}
                {v.starts_at && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                    <CalendarDays size={13} />
                    {new Date(v.starts_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}
                <p className="mt-3 line-clamp-2 max-w-2xl text-sm leading-6 text-muted">
                  {v.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <button
                    onClick={() => setSelected(v)}
                    className="flex items-center gap-2 text-sm font-medium text-accent-600"
                  >
                    {kind === "learning"
                      ? "Start learning"
                      : kind === "jobs"
                        ? "View opportunity"
                        : "Session details"}
                    <ArrowUpRight size={15} />
                  </button>
                  {v.owner_id === user?.id && (
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Edit ${v.title}`}
                        className="p-2 text-muted hover:text-ink"
                        onClick={() => {
                          setEditing(v);
                          setCreate(true);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting(v)}
                        aria-label={`Remove ${v.title}`}
                        className="p-2 text-muted hover:text-red-700"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {hasNextPage && (
        <div className="mt-6 text-center">
          <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
      <p className="mt-6 text-xs leading-5 text-muted">
        Member-shared resources · Source attribution does not imply institutional endorsement.{" "}
        {kind === "learning"
          ? "Learning completion is self-reported and does not award accredited CPD credits."
          : kind === "jobs"
            ? "Applications open on the employer’s external website."
            : "Meeting media is handled by the linked provider. Sessions are visible to all members."}
      </p>
      <Modal
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          join.reset();
          if (params.has("code")) setParams({}, { replace: true });
        }}
        title="Join a meeting"
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const session = await join.mutateAsync(joinCode);
              setSelected(session);
              setJoinOpen(false);
              setParams({}, { replace: true });
            } catch {
              /* Error shown below. */
            }
          }}
        >
          <p className="text-sm leading-6 text-muted">
            Enter the code from your invitation to find the session. You can review the details
            before joining.
          </p>
          <label className="block text-sm font-medium">
            Meeting code
            <input
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                join.reset();
              }}
              autoComplete="off"
              spellCheck={false}
              required
              maxLength={14}
              placeholder="AB12-CD34-EF56"
              className="mt-2 w-full rounded-md border border-divider p-3 font-mono text-lg tracking-widest"
            />
          </label>
          <ErrorBanner error={join.error} />
          <Button loading={join.isPending} disabled={!joinCode.trim()}>
            Find meeting
          </Button>
        </form>
      </Modal>
      <Modal
        open={create}
        onClose={() => {
          setCreate(false);
          setEditing(undefined);
        }}
        title={editing ? "Edit resource" : c.action}
      >
        {create && (
          <ResourceForm
            initial={editing}
            kind={kind}
            onClose={() => {
              setCreate(false);
              setEditing(undefined);
            }}
          />
        )}
      </Modal>
      <Modal
        wide={kind === "learning"}
        open={!!active}
        onClose={() => setSelected(null)}
        title={active?.title ?? "Details"}
      >
        {active && (
          <div className="space-y-4">
            {kind === "learning" && !active.id.startsWith("00000000-") && youtubeId(active.url) && (
              <iframe
                className="aspect-video max-h-[62dvh] w-full rounded-md bg-black"
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(active.url)}`}
                title={active.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            )}
            <p className="text-sm font-medium text-accent-700">
              {active.organization} · {active.category}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted">{active.description}</p>
            {active.starts_at && (
              <p className="text-sm">{new Date(active.starts_at).toLocaleString()}</p>
            )}
            {kind === "sessions" && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-3">
                <div>
                  <p className="text-xs text-muted">Meeting code</p>
                  <p className="mt-1 select-all font-mono text-lg tracking-wider">
                    {meetingCode(active.id)}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => copyInvite(active)}>
                  <Copy size={15} />
                  {copied ? "Invitation copied" : "Copy invitation"}
                </Button>
                <ErrorBanner error={copyError} />
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {kind === "sessions" ? (
                <Button
                  onClick={() => {
                    setMeeting(active);
                    setSelected(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Join in PharmaBoard
                </Button>
              ) : active.id.startsWith("00000000-") ? (
                <p className="text-xs text-muted">
                  Sample content for design review. Replace with a real{" "}
                  {kind === "learning" ? "lesson recording" : "employer application link"} before
                  publishing.
                </p>
              ) : (
                <a
                  href={active.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white"
                >
                  {kind === "jobs" ? "Apply on employer website" : "Open in YouTube"}
                  <ArrowUpRight size={16} />
                </a>
              )}
              {kind === "sessions" && (
                <Button variant="secondary" onClick={() => calendarFile(active)}>
                  Add to calendar (1 hour)
                </Button>
              )}
              {kind === "learning" && (
                <Button
                  variant="secondary"
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate({ id: active.id, saved: true, completed: !active.completed })
                  }
                >
                  <Check size={15} />
                  {active.completed ? "Mark incomplete" : "Mark complete"}
                </Button>
              )}
            </div>
            <ErrorBanner error={save.error} />
          </div>
        )}
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Remove this resource?">
        <p className="mb-5 text-sm text-muted">
          “{deleting?.title}” will be removed from the workspace and members’ saved lists.
        </p>
        <ErrorBanner error={remove.error} />
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={async () => {
            if (deleting) {
              try {
                await remove.mutateAsync(deleting.id);
                setDeleting(null);
              } catch {
                /* displayed above */
              }
            }
          }}
        >
          Remove resource
        </Button>
      </Modal>
    </AppShell>
  );
}
