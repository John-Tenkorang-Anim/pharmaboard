import { MessageNotifications } from "@/features/messaging/MessageNotifications";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  GraduationCap,
  Users,
  Bookmark,
  Video,
  Bell,
  Hash,
  Compass,
  ArrowLeft,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { useResources, meetingCode } from "@/features/workspace/api";
import { useNotices } from "@/features/notices/api";
import { SeverityChip } from "@/components/ui/Badge";
import { formatRelative } from "@/lib/format";
import type { Community } from "@/lib/types";
import { useChannels, useCommunityFeed, useSetChannelMembership } from "./api";
import { PostCard } from "./PostCard";
import { PostComposer } from "./CommunityPage";

function CommunityMembershipButton({ community }: { community: Community }) {
  const setMembership = useSetChannelMembership();
  return (
    <Button
      size="sm"
      variant={community.viewer_member ? "secondary" : "primary"}
      loading={setMembership.isPending}
      onClick={() => setMembership.mutate({ channelId: community.id, on: !community.viewer_member })}
    >
      {community.viewer_member ? "Joined" : "Join"}
    </Button>
  );
}

// CommunitiesTab is the LinkedIn-groups / X-Communities idea applied here:
// a directory of topic communities members can join, and — once inside one
// — a feed scoped to just that community's posts, instead of a second,
// near-duplicate copy of the main feed living on its own page.
function CommunitiesTab({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const channels = useChannels();
  const items = channels.data?.items ?? [];
  const active = items.find((c) => c.id === activeId) ?? null;
  const feed = useCommunityFeed("everyone", "", active?.id);
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];

  if (active) {
    return (
      <div>
        <button
          onClick={() => onSelect(null)}
          className="mb-4 flex items-center gap-2 text-sm font-semibold text-accent-700"
        >
          <ArrowLeft size={15} />
          All communities
        </button>
        <div className="mb-5 flex items-start justify-between gap-3 social-card p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-lg font-semibold">
              <Hash size={16} className="text-accent-600" />
              {active.name}
            </h2>
            {active.description && (
              <p className="mt-1 text-sm leading-6 text-muted">{active.description}</p>
            )}
            <p className="mt-2 text-xs text-faint">
              {active.member_count} {active.member_count === 1 ? "member" : "members"} ·{" "}
              {active.post_count} {active.post_count === 1 ? "post" : "posts"}
            </p>
          </div>
          <CommunityMembershipButton community={active} />
        </div>
        <PostComposer scope="everyone" channels={items} defaultChannelId={active.id} />
        <div className="mt-5">
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
              <Hash className="mx-auto mb-3 text-accent-600" />
              <h2 className="font-semibold">Nothing here yet.</h2>
              <p className="mt-2 text-sm text-muted">Be the first to post in this community.</p>
            </section>
          ) : null}
          {feed.hasNextPage && (
            <div className="mt-6 text-center">
              <Button
                variant="secondary"
                loading={feed.isFetchingNextPage}
                onClick={() => feed.fetchNextPage()}
              >
                Load more posts
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ErrorBanner error={channels.error} />
      {channels.isLoading ? (
        <SkeletonPost />
      ) : items.length ? (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="social-card flex items-center justify-between gap-3 p-4">
              <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left">
                <p className="flex items-center gap-1.5 font-semibold">
                  <Hash size={14} className="shrink-0 text-accent-600" />
                  <span className="truncate">{c.name}</span>
                </p>
                {c.description && (
                  <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-muted">
                    {c.description}
                  </p>
                )}
                <p className="mt-1.5 text-[11px] text-faint">
                  {c.member_count} {c.member_count === 1 ? "member" : "members"} · {c.post_count}{" "}
                  {c.post_count === 1 ? "post" : "posts"}
                </p>
              </button>
              <CommunityMembershipButton community={c} />
            </div>
          ))}
        </div>
      ) : (
        <section className="social-card p-8 text-center">
          <Compass className="mx-auto mb-3 text-accent-600" />
          <h2 className="font-semibold">No communities yet</h2>
          <p className="mt-2 text-sm text-muted">
            Communities are created from {""}
            <Link to="/forum" className="text-accent-700">
              RxForum
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}

export function HomePage() {
  const [tab, setTab] = useState<"community" | "following" | "communities" | "notices">(
    "community",
  );
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const feed = useCommunityFeed(tab === "following" ? "following" : "everyone");
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const notices = useNotices(true);
  const sessions = useResources("sessions");
  const learning = useResources("learning", "", "", true);
  const jobs = useResources("jobs", "", "", true);
  const joinedChannels = useChannels();
  const yourCommunities = (joinedChannels.data?.items ?? []).filter((c) => c.viewer_member);
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
          <Hash size={18} className="text-accent-600" />
          <h2 className="text-sm font-semibold">Your communities</h2>
        </div>
        {yourCommunities.length ? (
          <div className="space-y-3">
            {yourCommunities.slice(0, 5).map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setTab("communities");
                  setActiveChannelId(c.id);
                }}
                className="flex w-full items-center gap-2 text-left text-sm hover:text-accent-700"
              >
                <Hash size={13} className="shrink-0 text-faint" />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">
            Join a community to see it here, like a group you follow.
          </p>
        )}
        <button
          onClick={() => {
            setTab("communities");
            setActiveChannelId(null);
          }}
          className="mt-4 block text-xs font-semibold text-accent-700"
        >
          Browse communities →
        </button>
      </section>
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
      {tab !== "communities" && (
        <PostComposer
          scope={tab === "following" ? "following" : "everyone"}
          channels={joinedChannels.data?.items ?? []}
        />
      )}
      <div className="my-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
          {[
            { key: "community", label: "Discover", icon: Users },
            { key: "following", label: "Following", icon: Users },
            { key: "communities", label: "Communities", icon: Hash },
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
        {tab === "notices" && (
          <Link to="/notices" className="text-xs font-semibold text-accent-700">
            View all →
          </Link>
        )}
      </div>
      {tab === "communities" ? (
        <CommunitiesTab activeId={activeChannelId} onSelect={setActiveChannelId} />
      ) : tab !== "notices" ? (
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
