import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { VerificationChip, SeverityChip } from "@/components/ui/Badge";
import { useAuth } from "@/features/auth/AuthContext";
import { useNotices } from "@/features/notices/api";
import { formatRelative } from "@/lib/format";
import { useCreatePost, useFeed, useSetReaction, useThreads, type FeedScope } from "./api";
import { PostCard } from "./PostCard";

/**
 * The profile rail. It shows only what the system can actually attest to —
 * verification state, account kind, the member's own ID — nothing invented.
 */
function ProfileRail() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!user) return null;

  async function copyId() {
    if (!user) return;
    await navigator.clipboard.writeText(user.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card>
      <CardBody className="flex flex-col items-center text-center">
        <Avatar name={user.display_name} size="lg" verification={user.verification_state} />
        <Link
          to={`/people/${user.id}`}
          className="mt-3 text-base font-semibold text-ink hover:underline"
        >
          {user.display_name}
        </Link>
        <p className="mt-0.5 text-xs capitalize text-muted">
          {user.account_kind.replace("_", " ")}
        </p>
        <div className="mt-2">
          <VerificationChip state={user.verification_state} />
        </div>

        <button
          onClick={copyId}
          title="Copy your member ID"
          className="mt-4 flex w-full items-center justify-center gap-1.5 border-t border-hairline pt-3 text-left"
        >
          <span className="truncate font-mono text-[0.6875rem] text-muted">{user.id}</span>
          {copied ? (
            <Check className="size-3 shrink-0 text-accent-600" />
          ) : (
            <Copy className="size-3 shrink-0 text-faint" />
          )}
        </button>

        {user.verification_state !== "verified" && (
          <p className="mt-3 text-left text-xs leading-relaxed text-muted">
            Verified members receive official notices. Ask an administrator to review your
            registration.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function TrendingRail() {
  const { data: threads } = useThreads("");
  const { data: notices } = useNotices(true);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Active in Rx Forum</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {(threads?.items ?? []).slice(0, 4).map((t) => (
            <Link key={t.id} to={`/forum/${t.id}`} className="group block">
              <p className="line-clamp-2 text-[0.8125rem] leading-snug text-ink group-hover:underline">
                {t.title}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {t.reply_count} {t.reply_count === 1 ? "answer" : "answers"}
                {t.has_accepted && " · resolved"}
              </p>
            </Link>
          ))}
          {(threads?.items?.length ?? 0) === 0 && (
            <p className="text-xs text-faint">No questions yet — ask the first one.</p>
          )}
          <Link
            to="/forum"
            className="block pt-1 text-xs font-medium text-accent-600 hover:underline"
          >
            Open Rx Forum →
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest notices</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {(notices?.items ?? [])
            .slice(-3)
            .reverse()
            .map((n) => (
              <Link key={n.id} to={`/notices/${n.id}`} className="group block">
                <SeverityChip severity={n.severity} />
                <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-ink group-hover:underline">
                  {n.title}
                </p>
                <p className="mt-0.5 text-xs text-faint tnum">
                  {formatRelative(n.published_at ?? n.created_at)}
                </p>
              </Link>
            ))}
          {(notices?.items?.length ?? 0) === 0 && (
            <p className="text-xs text-faint">No published notices yet.</p>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Composer({ scope }: { scope: FeedScope }) {
  const { user } = useAuth();
  const createPost = useCreatePost(scope);
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await createPost.mutateAsync(body);
    setBody("");
    setFocused(false);
  }

  return (
    <Card className="mb-6">
      <form onSubmit={submit} className="p-4">
        <div className="flex gap-3">
          {user && (
            <Avatar name={user.display_name} size="sm" verification={user.verification_state} />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setFocused(true)}
            rows={focused || body ? 3 : 1}
            placeholder="Share a clinical update, drug alert, or start a peer consult…"
            className="flex-1 resize-none border-b border-divider bg-transparent py-1.5 text-sm text-ink transition-colors placeholder:text-faint focus-visible:border-ink focus-visible:outline-none"
          />
        </div>
        {(focused || body) && (
          <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3">
            <p className="text-xs text-faint">Posts are attributed to your verified identity.</p>
            <Button type="submit" size="sm" loading={createPost.isPending} disabled={!body.trim()}>
              Post
            </Button>
          </div>
        )}
        {createPost.error ? (
          <div className="mt-3">
            <ErrorBanner error={createPost.error} />
          </div>
        ) : null}
      </form>
    </Card>
  );
}

export function HomePage() {
  const [scope, setScope] = useState<FeedScope>("everyone");
  const { data, isLoading, error } = useFeed(scope);
  const setReaction = useSetReaction(scope);

  return (
    <AppShell left={<ProfileRail />} right={<TrendingRail />}>
      <Composer scope={scope} />

      <div className="segment mb-5">
        {(
          [
            { value: "everyone", label: "All members" },
            { value: "following", label: "Following" },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            data-active={scope === value}
            className="segment-item"
          >
            {label}
          </button>
        ))}
      </div>

      <ErrorBanner error={error} />

      {isLoading ? (
        <div className="space-y-4">
          <SkeletonPost />
          <SkeletonPost />
          <SkeletonPost />
        </div>
      ) : data && data.items.length > 0 ? (
        <div className="space-y-4">
          {data.items.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onToggleReaction={(postId, on) => setReaction.mutate({ postId, on })}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title={scope === "following" ? "Your following feed is quiet" : "No posts yet"}
            description={
              scope === "following"
                ? "Follow colleagues from the Directory and their updates will appear here."
                : "Be the first to share something with the profession."
            }
            action={
              scope === "following" ? (
                <Link to="/network">
                  <Button size="sm">Open Directory</Button>
                </Link>
              ) : undefined
            }
          />
        </Card>
      )}
    </AppShell>
  );
}
