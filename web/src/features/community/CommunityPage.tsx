import { MediaPicker } from "@/features/media/Media";
import { platform } from "@/lib/platform";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Users, ArrowUpRight, MessageSquare, PenLine, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Modal } from "@/components/ui/Modal";
import { RichTextEditor } from "@/components/ui/RichText";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthContext";
import type { Community } from "@/lib/types";
import { useCreatePost, useDirectory, useThreads, usePost, type FeedScope } from "./api";
import { PostCard } from "./PostCard";

function PostComposerModal({
  open,
  onClose,
  scope,
  channels,
  defaultChannelId = "",
}: {
  open: boolean;
  onClose: () => void;
  scope: FeedScope;
  channels: Community[];
  defaultChannelId?: string;
}) {
  const create = useCreatePost(scope);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [channelId, setChannelId] = useState(defaultChannelId);
  // Same render-time reset as RxForum's AskModal: the picked community
  // snaps to the caller's default the instant the dialog opens, with no
  // stale-selection frame from the last time it was open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChannelId(defaultChannelId);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if ((!body.trim() && !media.length) || uploading) return;
    try {
      await create.mutateAsync({
        body: [body, ...media.map((id) => `[media:${id}]`)].join("\n"),
        channel_id: channelId || undefined,
      });
      setMedia([]);
      setBody("");
      onClose();
    } catch {
      /* Keep draft available for retry. */
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Write a post">
      <form onSubmit={submit} className="space-y-4">
        {channels.length > 0 && (
          <div>
            <label
              htmlFor="post-community"
              className="mb-1.5 block text-[0.8125rem] font-medium text-ink"
            >
              Community
            </label>
            <select
              id="post-community"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded border border-divider bg-surface px-3 py-2 text-sm text-ink focus-visible:border-accent-600 focus-visible:outline-none"
            >
              <option value="">Everyone (uncategorized)</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <RichTextEditor
          label="Post"
          placeholder="What’s on your mind?"
          value={body}
          onChange={setBody}
        />
        <MediaPicker value={media} onChange={setMedia} onBusy={setUploading} />
        <p className="text-xs text-muted">
          Share an idea, experience, or useful link. No patient information.
        </p>
        <ErrorBanner error={create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={create.isPending}
            disabled={(!body.trim() && !media.length) || uploading}
          >
            <PenLine size={14} />
            Publish post
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PostComposer({
  scope = "everyone",
  channels = [],
  defaultChannelId,
}: {
  scope?: FeedScope;
  channels?: Community[];
  defaultChannelId?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="Create or start a discussion" className="rounded-xl bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        {user && (
          <div className="hidden shrink-0 sm:block">
            <Avatar userId={user.id} name={user.display_name} size="sm" />
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          <PenLine size={17} className="shrink-0" />
          Write a post
        </button>
        <Link
          to="/forum?ask=1"
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
        >
          <MessageSquare size={17} className="shrink-0" />
          <span>
            <span className="hidden sm:inline">Ask in </span>
            {platform.forumName}
          </span>
        </Link>
      </div>
      <PostComposerModal
        open={open}
        onClose={() => setOpen(false)}
        scope={scope}
        channels={channels}
        defaultChannelId={defaultChannelId}
      />
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
export function PostPage() {
  const { id } = useParams();
  const post = usePost(id);
  return (
    <AppShell right={<CommunitySidebar />}>
      <Link to="/home" className="mb-5 inline-flex items-center gap-2 text-sm text-muted">
        <ArrowLeft size={16} />
        Back to Overview
      </Link>
      <h1 className="mb-5 text-2xl font-semibold">Conversation</h1>
      <ErrorBanner error={post.error} />
      {post.isLoading ? <SkeletonPost /> : post.data ? <PostCard post={post.data} /> : null}
    </AppShell>
  );
}
