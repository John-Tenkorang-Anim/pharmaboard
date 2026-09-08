import { useState, useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  ThumbsUp,
  Share2,
  Send,
  X,
  CornerDownRight,
  Flag,
  Play,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/features/auth/AuthContext";
import { formatRelative } from "@/lib/format";
import type { FeedPost } from "@/lib/types";
import { useComments, usePostActions, type PostComment } from "./api";
const YOUTUBE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/;
export function youTubeId(text: string) {
  return text.match(YOUTUBE_PATTERN)?.[1] ?? null;
}
function Body({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-ink">
      {text.split(/(\s+)/).map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-accent-700 underline underline-offset-2"
          >
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  );
}
export function PostCard({ post }: { post: FeedPost }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<unknown>(null);
  const [play, setPlay] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const { comment, remove, react, report } = usePostActions(post.id);
  const comments = useComments(post.id, expanded);
  const rows = comments.data?.pages.flatMap((p) => p.items) ?? [];
  const roots = rows.filter((c) => !c.parent_id);
  const video = youTubeId(post.body);
  const reacted = react.isPending ? react.variables : post.viewer_reacted;
  const count =
    post.reaction_count +
    (react.isPending && react.variables !== post.viewer_reacted ? (react.variables ? 1 : -1) : 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim() || comment.isPending) return;
    try {
      await comment.mutateAsync({ id: draftId, body, parent_id: replyTo?.id ?? null });
      setBody("");
      setDraftId(crypto.randomUUID());
      setReplyTo(null);
    } catch {
      /* Draft retained for retry. */
    }
  }
  function target(c: PostComment) {
    setReplyTo({ id: c.parent_id ?? c.id, name: c.author.display_name });
    input.current?.focus();
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community/posts/${post.id}`);
      setCopied(true);
      setShareError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError(
        new Error("Could not copy the link. Open the conversation and copy its address."),
      );
    }
  }
  function renderComment(c: PostComment) {
    return (
      <div key={c.id} className="flex min-w-0 gap-2.5">
        <Avatar userId={c.author.id} name={c.author.display_name} size="xs" />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-[#F6F7F9] px-3.5 py-2.5">
            <div className="mb-1 flex flex-wrap items-center gap-x-2">
              <Link
                to={`/people/${c.author.id}`}
                className="text-xs font-semibold text-ink hover:underline"
              >
                {c.author.display_name}
              </Link>
              <span className="text-[10px] text-muted">{formatRelative(c.created_at)}</span>
            </div>
            {c.deleted ? (
              <p className="text-sm italic text-muted">This reply was removed.</p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{c.body}</p>
            )}
          </div>
          <div className="mt-1 flex gap-4 px-1 text-[11px] text-muted">
            {!c.deleted && (
              <button
                className="py-1 font-semibold hover:text-accent-700"
                onClick={() => target(c)}
              >
                Reply
              </button>
            )}
            {!c.deleted && c.author.id === user?.id && (
              <button className="py-1 hover:text-red-700" onClick={() => setRemoveId(c.id)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <article
      className="social-card overflow-hidden"
      aria-label={`Post by ${post.author.display_name}`}
    >
      <header className="flex items-start gap-3 px-5 pt-5">
        <Link to={`/people/${post.author.id}`}>
          <Avatar
            userId={post.author.id}
            name={post.author.display_name}
            size="md"
            verification={post.author.verification_state}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/people/${post.author.id}`} className="text-sm font-semibold hover:underline">
            {post.author.display_name}
          </Link>
          <p className="mt-0.5 truncate text-xs capitalize text-muted">
            {post.author.practice_area || post.author.account_kind.replace("_", " ")}
            {post.author.region_code && ` · ${post.author.region_code}`}
          </p>
          <Link
            to={`/community/posts/${post.id}`}
            className="mt-1 inline-block text-[11px] text-muted hover:underline"
          >
            {formatRelative(post.created_at)} · Community
          </Link>
        </div>
        <button
          aria-label="Report post"
          onClick={() => setReportOpen(true)}
          className="rounded-md p-2 text-muted hover:bg-slate-50"
        >
          <Flag size={15} />
        </button>
      </header>
      <div className="px-5 pb-4 pt-4">
        <Body text={post.body} />
      </div>
      {video && (
        <div className="mx-5 mb-4 aspect-video overflow-hidden rounded-lg bg-slate-900">
          {play ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${video}`}
              title="Video shared in this post"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              className="relative flex h-full w-full items-center justify-center"
              aria-label="Play shared video"
              onClick={() => setPlay(true)}
            >
              <img
                alt=""
                loading="lazy"
                src={`https://i.ytimg.com/vi/${video}/hqdefault.jpg`}
                className="absolute inset-0 h-full w-full object-cover opacity-75"
              />
              <span className="relative rounded-lg bg-white p-3 text-ink">
                <Play fill="currentColor" size={24} />
              </span>
            </button>
          )}
        </div>
      )}
      <div className="flex items-center justify-between px-5 pb-2 text-xs text-muted">
        <span>
          {count
            ? `${count} ${count === 1 ? "endorsement" : "endorsements"}`
            : "Be the first to endorse"}
        </span>
        <button
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-slate-50 hover:underline"
        >
          <MessageCircle size={15} aria-hidden="true" />
          {post.reply_count ?? 0} {(post.reply_count ?? 0) === 1 ? "reply" : "replies"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1 px-3 pb-3">
        <button
          disabled={react.isPending}
          aria-pressed={!!reacted}
          onClick={() => react.mutate(!reacted)}
          className={`social-action ${reacted ? "text-accent-700" : "text-muted"}`}
        >
          <ThumbsUp size={17} fill={reacted ? "currentColor" : "none"} />
          Endorse
        </button>
        <button onClick={share} className="social-action text-muted">
          <Share2 size={17} />
          {copied ? "Link copied" : "Share"}
        </button>
      </div>
      {!!(react.error || shareError) && (
        <div className="px-5 pb-4">
          <ErrorBanner error={react.error || shareError} />
        </div>
      )}
      {expanded && (
        <section aria-label="Post replies" className="px-5 pb-5">
          <div className="mb-4 rounded-lg bg-blue-50/60 px-3 py-2 text-xs text-muted">
            Keep the discussion respectful. Avoid sharing private personal information.
          </div>
          <ErrorBanner error={comments.error} />
          {comments.isLoading ? (
            <p role="status" className="py-3 text-sm text-muted">
              Loading conversation…
            </p>
          ) : (
            <div className="space-y-3">
              {roots.map((c) => (
                <div key={c.id}>
                  {renderComment(c)}
                  <div className="ml-5 mt-2 space-y-2 sm:ml-9">
                    {rows.filter((r) => r.parent_id === c.id).map(renderComment)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {comments.hasNextPage && (
            <Button
              className="mt-3"
              variant="quiet"
              loading={comments.isFetchingNextPage}
              onClick={() => comments.fetchNextPage()}
            >
              More replies
            </Button>
          )}
          {!comments.isLoading && !comments.error && rows.length === 0 && (
            <p className="mb-4 text-sm text-muted">
              Start the conversation. Share a perspective or ask a question.
            </p>
          )}
          <form onSubmit={submit} className="mt-4">
            <div className="flex gap-2.5">
              {user && <Avatar userId={user.id} name={user.display_name} size="sm" />}
              <div className="min-w-0 flex-1">
                {replyTo && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-accent-700">
                    <CornerDownRight size={13} />
                    Replying to {replyTo.name}
                    <button
                      type="button"
                      aria-label="Cancel reply target"
                      onClick={() => setReplyTo(null)}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}
                <textarea
                  ref={input}
                  aria-label="Write a reply"
                  value={body}
                  maxLength={2000}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={replyTo ? `Reply to ${replyTo.name}…` : "Add to the conversation…"}
                  rows={2}
                  className="w-full resize-y rounded-xl border border-hairline bg-white px-3 py-2 text-sm leading-6"
                />
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted">{body.length}/2,000</span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!body.trim()}
                    loading={comment.isPending}
                  >
                    <Send size={13} />
                    Post reply
                  </Button>
                </div>
                <ErrorBanner error={comment.error} />
              </div>
            </div>
          </form>
        </section>
      )}
      <Modal open={!!removeId} onClose={() => setRemoveId(null)} title="Remove your reply?">
        <p className="mb-4 text-sm text-muted">
          Your reply will be replaced with a removal notice. Other members’ responses remain in the
          conversation.
        </p>
        <ErrorBanner error={remove.error} />
        <Button
          variant="danger"
          loading={remove.isPending}
          onClick={async () => {
            if (removeId)
              try {
                await remove.mutateAsync(removeId);
                setRemoveId(null);
              } catch {
                /* visible */
              }
          }}
        >
          Remove reply
        </Button>
      </Modal>
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this post">
        {report.isSuccess ? (
          <p role="status" className="text-sm">
            Your report has been submitted for review.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              report.mutate(reason);
            }}
            className="space-y-4"
          >
            <label className="block text-sm">
              Reason
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-lg border border-hairline p-3"
                rows={3}
              />
            </label>
            <ErrorBanner error={report.error} />
            <Button loading={report.isPending} disabled={!reason.trim()}>
              Submit report
            </Button>
          </form>
        )}
      </Modal>
    </article>
  );
}
