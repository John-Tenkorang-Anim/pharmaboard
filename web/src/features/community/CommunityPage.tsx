import { MediaPicker } from "@/features/media/Media";
import { platform } from "@/lib/platform";
import { useState, useEffect, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Users,
  ArrowUpRight,
  MessageSquare,
  PenLine,
  Compass,
  ArrowLeft,
  Search,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthContext";
import {
  useCommunityFeed,
  useCreatePost,
  useDirectory,
  useThreads,
  usePost,
  type FeedScope,
} from "./api";
import { PostCard } from "./PostCard";
export function PostComposer({ scope = "everyone" }: { scope?: FeedScope }) {
  const { user } = useAuth();
  const create = useCreatePost(scope);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((!body.trim() && !media.length) || uploading) return;
    try {
      await create.mutateAsync([body, ...media.map((id) => `[media:${id}]`)].join("\n"));
      setMedia([]);
      setBody("");
      setOpen(false);
    } catch {
      /* Keep draft available. */
    }
  }
  return (
    <section className="social-card p-5">
      <form onSubmit={submit}>
        <div className="flex items-start gap-3">
          {user && <Avatar userId={user.id} name={user.display_name} size="md" />}
          <textarea
            aria-label="Create a post"
            onFocus={() => setOpen(true)}
            value={body}
            maxLength={3800}
            onChange={(e) => setBody(e.target.value)}
            rows={open ? 4 : 1}
            placeholder="What’s on your mind?"
            className="min-w-0 flex-1 resize-none rounded-xl bg-[#F6F7F9] px-4 py-3 text-sm leading-6 placeholder:text-muted focus:outline-none"
          />
        </div>
        <MediaPicker
          value={media}
          onChange={(v) => {
            setMedia(v);
            setOpen(true);
          }}
          onBusy={setUploading}
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  document
                    .querySelector<HTMLTextAreaElement>('textarea[aria-label="Create a post"]')
                    ?.focus();
                }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-50"
              >
                <PenLine size={16} />
                Write a post
              </button>
              <Link
                to="/forum"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-50"
              >
                <MessageSquare size={16} />
                Ask in {platform.forumName}
              </Link>
            </>
          }
        />
        {open || media.length ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              Share an idea, experience, or useful link. No patient information.
            </p>
            <Button
              loading={create.isPending}
              disabled={(!body.trim() && !media.length) || uploading}
            >
              <PenLine size={14} />
              Publish post
            </Button>
          </div>
        ) : null}
        <ErrorBanner error={create.error} />
      </form>
    </section>
  );
}
export function CommunitySidebar() {
  const { user } = useAuth();
  const people = useDirectory("");
  const threads = useThreads("");
  return (
    <div className="space-y-5">
      <section className="social-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users size={18} className="text-accent-600" />
          <h2 className="text-sm font-semibold">Meet your community</h2>
        </div>
        <ErrorBanner error={people.error} />
        <div className="space-y-4">
          {people.data?.items
            .filter((p) => p.id !== user?.id)
            .slice(0, 4)
            .map((p) => (
              <Link key={p.id} to={`/people/${p.id}`} className="flex items-center gap-3">
                <Avatar userId={p.id} name={p.display_name} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{p.display_name}</p>
                  <p className="mt-1 text-[11px] capitalize text-muted">
                    {p.practice_area || p.account_kind}
                  </p>
                </div>
                <ArrowUpRight size={14} className="ml-auto shrink-0 text-muted" />
              </Link>
            ))}
        </div>
        <Link to="/network" className="mt-5 block text-xs font-medium text-accent-700">
          Explore the network →
        </Link>
      </section>
      <section className="social-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Questions worth discussing</h2>
        <ErrorBanner error={threads.error} />
        <div className="space-y-4">
          {threads.data?.items.slice(0, 3).map((t) => (
            <Link key={t.id} to={`/forum/${t.id}`} className="block">
              <p className="text-sm leading-5 hover:text-accent-700">{t.title}</p>
              <p className="mt-1 text-[11px] text-muted">
                {t.reply_count} answers{t.has_accepted ? " · Answer accepted" : ""}
              </p>
            </Link>
          ))}
        </div>
        <Link to="/forum" className="mt-5 block text-xs font-medium text-accent-700">
          Explore {platform.forumName} →
        </Link>
      </section>
      <p className="px-1 text-xs leading-6 text-muted">
        A place for thoughtful professional exchange. Be constructive, credit your sources, and
        respect each other.
      </p>
    </div>
  );
}
export function CommunityPage() {
  const [scope, setScope] = useState<FeedScope>("everyone");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const feed = useCommunityFeed(scope, query);
  const posts = feed.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <AppShell right={<CommunitySidebar />}>
      <div className="mb-6">
        <p className="eyebrow text-accent-700">THE COMMUNITY</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Ideas grow through conversation.
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Discover perspectives, share what you know, and connect with your peers.
        </p>
      </div>
      <PostComposer scope={scope} />
      <div className="relative mt-5">
        <Search size={16} className="absolute left-3 top-3 text-muted" />
        <input
          aria-label="Search community posts"
          value={search}
          maxLength={200}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations and shared ideas"
          className="w-full rounded-xl border border-hairline bg-white py-2.5 pl-10 pr-3 text-sm"
        />
      </div>
      <div className="my-5 flex items-center justify-between">
        <div className="flex gap-1 rounded-lg bg-slate-50 p-1">
          {(
            [
              { key: "everyone", label: "Discover", icon: Compass },
              { key: "following", label: "Following", icon: Users },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              aria-pressed={scope === key}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold ${scope === key ? "bg-white text-accent-700 shadow-sm" : "text-muted"}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <button
          className="flex items-center gap-2 text-xs text-muted"
          onClick={() => feed.refetch()}
          disabled={feed.isFetching}
        >
          <RefreshCw size={13} className={feed.isFetching ? "animate-spin" : ""} />
          Latest posts
        </button>
      </div>
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
        <div className="social-card px-6 py-12 text-center">
          <MessageSquare size={28} className="mx-auto mb-3 text-accent-600" />
          <h2 className="font-semibold">
            {scope === "following"
              ? "Make this feed your own"
              : "The next conversation starts with you"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {scope === "following"
              ? "Follow colleagues from their profiles to see their posts here."
              : "Share a question, reflection, or useful resource above."}
          </p>
          {scope === "following" && (
            <Link to="/network" className="mt-4 inline-block text-sm text-accent-700">
              Find people to follow →
            </Link>
          )}
        </div>
      ) : null}
      {feed.hasNextPage && (
        <div className="mt-6 text-center">
          <Button
            variant="secondary"
            loading={feed.isFetchingNextPage}
            onClick={() => feed.fetchNextPage()}
          >
            Load more conversations
          </Button>
        </div>
      )}
    </AppShell>
  );
}
export function PostPage() {
  const { id } = useParams();
  const post = usePost(id);
  return (
    <AppShell right={<CommunitySidebar />}>
      <Link to="/community" className="mb-5 inline-flex items-center gap-2 text-sm text-muted">
        <ArrowLeft size={16} />
        Back to Community
      </Link>
      <h1 className="mb-5 text-2xl font-semibold">Conversation</h1>
      <ErrorBanner error={post.error} />
      {post.isLoading ? <SkeletonPost /> : post.data ? <PostCard post={post.data} /> : null}
    </AppShell>
  );
}
