import { platform } from "@/lib/platform";
import { useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import clsx from "clsx";
import { CheckCircle2, ArrowLeft, Heart } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Badge";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { RichText, RichTextEditor } from "@/components/ui/RichText";
import { formatRelative } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthContext";
import { useAcceptReply, useReply, useThread } from "./api";

export function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data, isLoading, error } = useThread(id);
  const reply = useReply(id);
  const acceptReply = useAcceptReply(id);
  const [body, setBody] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await reply.mutateAsync(body);
      setBody("");
    } catch {
      /* Keep draft for retry. */
    }
  }

  if (isLoading) {
    return (
      <AppShell width="narrow">
        <Card>
          <CardBody className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </CardBody>
        </Card>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell width="narrow">
        <ErrorBanner error={error ?? new Error("Question not found")} />
      </AppShell>
    );
  }

  const { thread, replies } = data;
  const isAsker = user?.id === thread.author.id;
  // Accepted answer first — the thing a reader came for shouldn't be buried.
  const ordered = [...replies].sort((a, b) => Number(b.accepted) - Number(a.accepted));

  return (
    <AppShell width="narrow">
      <Link
        to="/forum"
        className="mb-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-faint transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        {platform.forumName}
      </Link>

      <Card className="social-card mb-6">
        <CardBody>
          <div className="flex items-start gap-3">
            <Avatar
              userId={thread.author.id}
              name={thread.author.display_name}
              size="md"
              verification={thread.author.verification_state}
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-snug text-ink">{thread.title}</h1>
              <p className="mt-1 text-[0.8125rem] text-faint">
                <Link to={`/people/${thread.author.id}`} className="font-medium hover:underline">
                  {thread.author.display_name}
                </Link>
                {" · "}
                {formatRelative(thread.created_at)}
              </p>
              <div className="mt-5">
                <RichText text={thread.body} />
              </div>
              {thread.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {thread.tags.map((tag) => (
                    <Chip key={tag} className="bg-hairline text-muted">
                      #{tag}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <ErrorBanner error={acceptReply.error} />
      <h2 className="mb-3 px-1 text-sm font-bold text-muted">
        {replies.length} {replies.length === 1 ? "answer" : "answers"}
      </h2>

      <div className="mb-4 space-y-3">
        {ordered.map((r) => (
          <Card
            key={r.id}
            className={clsx(
              "social-card transition-colors",
              r.accepted && "border-accent-600 bg-accent-50",
            )}
          >
            <CardBody>
              {r.accepted && (
                <div className="mb-2.5 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-accent-700">
                  <CheckCircle2 className="size-4" />
                  Accepted answer
                </div>
              )}
              <div className="flex items-start gap-3">
                <Avatar
                  userId={r.author.id}
                  name={r.author.display_name}
                  size="sm"
                  verification={r.author.verification_state}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem]">
                    <Link
                      to={`/people/${r.author.id}`}
                      className="font-bold text-ink hover:underline"
                    >
                      {r.author.display_name}
                    </Link>
                    <span className="ml-2 text-[0.8125rem] text-faint">
                      {formatRelative(r.created_at)}
                    </span>
                  </p>
                  <div className="mt-3">
                    <RichText text={r.body} />
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-[0.8125rem] text-faint">
                      <Heart className="size-3.5" />
                      {r.reaction_count}
                    </span>
                    {isAsker && !r.accepted && (
                      <button
                        disabled={acceptReply.isPending}
                        onClick={() => acceptReply.mutate(r.id)}
                        className="text-[0.8125rem] font-semibold text-accent-700 transition-colors hover:text-accent-700"
                      >
                        Accept this answer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-3">
            <RichTextEditor
              label="Contribute to this discussion"
              placeholder="Answer from your own practice or study experience…"
              value={body}
              onChange={setBody}
            />
            <p className="text-xs text-muted">
              Explain your reasoning and include source URLs so others can study further.
            </p>
            <ErrorBanner error={reply.error} />
            <div className="flex justify-end">
              <Button type="submit" loading={reply.isPending} disabled={!body.trim()}>
                Post answer
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </AppShell>
  );
}
