import { MessageNotifications } from "@/features/messaging/MessageNotifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, GraduationCap, Users, Bookmark, Video, Bell } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { useResources, meetingCode } from "@/features/workspace/api";
import { useNotices } from "@/features/notices/api";
import { SeverityChip } from "@/components/ui/Badge";
import { formatRelative } from "@/lib/format";
import { useCommunityFeed } from "./api";
import { PostCard } from "./PostCard";
import { PostComposer } from "./CommunityPage";
export function HomePage() {
  const [tab, setTab] = useState<"community" | "following" | "notices">("community");
  const feed = useCommunityFeed(tab === "following" ? "following" : "everyone");
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const notices = useNotices(true);
  const sessions = useResources("sessions");
  const learning = useResources("learning", "", "", true);
  const jobs = useResources("jobs", "", "", true);
  const next = sessions.data?.pages
    .flatMap((p) => p.items)
    .filter((s) => s.starts_at && new Date(s.starts_at) > new Date())
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];
  const lesson = learning.data?.pages.flatMap((p) => p.items).find((l) => !l.completed);
  const savedJobs = jobs.data?.pages.flatMap((p) => p.items) ?? [];
  const right = (
    <div className="space-y-5">
      <section className="social-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays size={18} className="text-accent-600" />
          <h2 className="text-sm font-semibold">Up next</h2>
        </div>
        <ErrorBanner error={sessions.error} />
        {sessions.isLoading ? (
          <p className="text-sm text-muted">Loading your schedule…</p>
        ) : next ? (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase text-accent-700">
              {new Date(next.starts_at!).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {new Date(next.starts_at!).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <h3 className="text-base font-semibold leading-6">{next.title}</h3>
            <p className="mt-2 text-xs text-muted">{next.organization}</p>
            <Link
              to={`/sessions?code=${meetingCode(next.id)}`}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-xs font-semibold text-white"
            >
              <Video size={14} />
              View session
            </Link>
          </>
        ) : !sessions.error ? (
          <>
            <p className="text-sm leading-6 text-muted">
              Make time to learn with your peers. Find a session or organize your own.
            </p>
            <Link to="/sessions" className="mt-4 block text-xs font-semibold text-accent-700">
              Explore sessions →
            </Link>
          </>
        ) : null}
      </section>
      <section className="social-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <GraduationCap size={18} className="text-accent-600" />
          <h2 className="text-sm font-semibold">Your learning list</h2>
        </div>
        <ErrorBanner error={learning.error} />
        {lesson ? (
          <>
            <p className="text-sm font-semibold leading-6">{lesson.title}</p>
            <p className="mt-1 text-xs text-muted">{lesson.organization}</p>
            <Link to="/learning" className="mt-4 block text-xs font-semibold text-accent-700">
              Continue learning →
            </Link>
          </>
        ) : !learning.error ? (
          <>
            <p className="text-sm leading-6 text-muted">
              Save a lesson that interests you. Come back to it when you have a moment.
            </p>
            <Link to="/learning" className="mt-4 block text-xs font-semibold text-accent-700">
              Find something to learn →
            </Link>
          </>
        ) : null}
      </section>
      <section className="rounded-2xl bg-[#F7F8FA] p-5">
        <div className="mb-3 flex items-center gap-2">
          <Bookmark size={16} />
          <h2 className="text-sm font-semibold">Your career shortlist</h2>
        </div>
        <ErrorBanner error={jobs.error} />
        {savedJobs.length ? (
          savedJobs.slice(0, 2).map((j) => (
            <Link key={j.id} to="/jobs" className="mb-3 block">
              <p className="text-sm font-medium">{j.title}</p>
              <p className="mt-1 text-xs text-muted">{j.organization}</p>
            </Link>
          ))
        ) : (
          <p className="text-xs leading-6 text-muted">
            Keep opportunities you’re considering in one place.
          </p>
        )}
        <Link to="/jobs" className="mt-3 inline-block text-xs font-semibold text-accent-700">
          Explore careers →
        </Link>
      </section>
    </div>
  );
  return (
    <AppShell right={right}>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your feed</h1>
        <Link to="/network" className="text-sm font-semibold text-accent-700">
          Find people
        </Link>
      </header>
      <MessageNotifications />
      <div className="mb-4 flex items-center justify-between text-xs text-muted">
        <span>Updates from your professional network</span>
        <button
          disabled={feed.isFetching}
          onClick={() => feed.refetch()}
          className="font-semibold text-accent-700 disabled:opacity-50"
        >
          {feed.isFetching ? "Checking…" : "Refresh updates"}
        </button>
      </div>
      <PostComposer scope={tab === "following" ? "following" : "everyone"} />
      <div className="my-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
          {[
            { key: "community", label: "Latest discussions", icon: Users },
            { key: "following", label: "Following", icon: Users },
            { key: "notices", label: "Official notices", icon: Bell },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              aria-pressed={tab === key}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${tab === key ? "bg-white text-accent-700 shadow-sm" : "text-muted"}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <Link
          to={tab !== "notices" ? "/community" : "/notices"}
          className="text-xs font-semibold text-accent-700"
        >
          View all →
        </Link>
      </div>
      {tab !== "notices" ? (
        <>
          <ErrorBanner error={feed.error} />
          {feed.isLoading ? (
            <SkeletonPost />
          ) : posts.length ? (
            <div className="space-y-5">
              {posts.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ) : !feed.error ? (
            <section className="social-card p-8 text-center">
              <Users className="mx-auto mb-3 text-accent-600" />
              <h2 className="font-semibold">There’s room for your perspective.</h2>
              <p className="mt-2 text-sm text-muted">
                Share the first update, or explore your professional network.
              </p>
              <Link to="/network" className="mt-4 inline-block text-sm text-accent-700">
                Meet your peers →
              </Link>
            </section>
          ) : null}
          {feed.hasNextPage && (
            <div className="mt-6 text-center">
              <Button
                variant="secondary"
                loading={feed.isFetchingNextPage}
                onClick={() => feed.fetchNextPage()}
              >
                Load more discussions
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <ErrorBanner error={notices.error} />
          {notices.isLoading ? (
            <SkeletonPost />
          ) : (
            <div className="space-y-4">
              {[...(notices.data?.items ?? [])]
                .reverse()
                .slice(0, 4)
                .map((n) => (
                  <Link key={n.id} to={`/notices/${n.id}`} className="social-card block p-5">
                    <SeverityChip severity={n.severity} />
                    <h2 className="mt-3 text-base font-semibold">{n.title}</h2>
                    <p className="mt-2 text-xs text-muted">
                      {formatRelative(n.published_at ?? n.created_at)}
                    </p>
                    <span className="mt-4 inline-block text-xs font-semibold text-accent-700">
                      Read notice →
                    </span>
                  </Link>
                ))}
              {!notices.data?.items.length && !notices.error && (
                <p className="social-card p-6 text-sm text-muted">No published notices yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
