import { platform } from "@/lib/platform";
import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare, CheckCircle2, Search, Plus, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { TextInput, TextArea } from "@/components/ui/Field";
import { formatRelative } from "@/lib/format";
import { useCreateThread, useThreads } from "./api";

function AskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createThread = useCreateThread();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await createThread.mutateAsync({
        title,
        body,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 5),
      });
      setTitle("");
      setBody("");
      setTags("");
      onClose();
    } catch {
      /* Keep the draft available for retry. */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Ask the profession">
      <form onSubmit={submit} className="space-y-4">
        <TextInput
          id="title"
          label="Question"
          placeholder="How do you organise peer learning in a busy practice?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={5}
          maxLength={200}
          required
        />
        <TextArea
          id="body"
          label="Details"
          rows={6}
          placeholder="Give enough context for a colleague to answer well."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <TextInput
          id="tags"
          label="Tags"
          placeholder="professional-development, practice"
          hint="Up to five, comma separated."
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[0.8125rem] leading-relaxed text-amber-800">
          Patient-specific advice is not permitted. Keep questions about practice, guidance and
          supply — never an individual patient's care.
        </p>
        <ErrorBanner error={createThread.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createThread.isPending}>
            Post question
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ForumPage() {
  const [search, setSearch] = useState("");
  const [askOpen, setAskOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, isLoading, error } = useThreads(query);
  const threads = (data?.items ?? []).filter(
    (t) => filter === "all" || (filter === "answered" ? t.has_accepted : t.reply_count === 0),
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-700">
            Knowledge shared, practice improved
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{platform.forumName}</h1>
          <p className="mt-1 text-sm text-faint">
            Ask a thoughtful question. Share your experience. Learn with your colleagues.
          </p>
        </div>
        <Button onClick={() => setAskOpen(true)}>
          <Plus className="size-4" />
          Ask a question
        </Button>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_270px]">
        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap gap-2">
            {[
              ["all", "Latest discussions"],
              ["unanswered", "Needs an answer"],
              ["answered", "Answered"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value!)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${filter === value ? "bg-ink text-white" : "bg-slate-50 text-muted hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative mb-6">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              aria-label="Search forum questions"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="w-full rounded-md border border-hairline bg-surface py-3 pl-10 pr-4 text-sm transition-colors placeholder:text-faint focus-visible:border-accent-600 focus-visible:outline-none"
            />
          </div>

          <ErrorBanner error={error} />

          {isLoading ? (
            <Card>
              <CardBody>
                <SkeletonList rows={4} />
              </CardBody>
            </Card>
          ) : threads.length > 0 ? (
            <div className="space-y-4">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  to={`/forum/${thread.id}`}
                  className="social-card block p-2 transition-shadow hover:shadow-md"
                >
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <Avatar
                        name={thread.author.display_name}
                        size="sm"
                        verification={thread.author.verification_state}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="text-lg font-semibold leading-7 text-ink">
                            {thread.title}
                          </h2>
                          {thread.has_accepted && (
                            <Chip className="shrink-0 bg-accent-50 text-accent-700">
                              <CheckCircle2 className="size-3" />
                              Answered
                            </Chip>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-faint">
                          {thread.body}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          {thread.tags.map((tag) => (
                            <Chip key={tag} className="bg-hairline text-muted">
                              #{tag}
                            </Chip>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-4 text-[0.8125rem] text-faint">
                          <span>{thread.author.display_name}</span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="size-3.5" />
                            {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
                          </span>
                          <span>{formatRelative(thread.last_activity_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<MessagesSquare className="size-6" />}
                title={search ? "No questions match that search" : "No questions yet"}
                description="Ask the first question and colleagues can answer it."
                action={<Button onClick={() => setAskOpen(true)}>Ask a question</Button>}
              />
            </Card>
          )}
        </section>
        <aside className="space-y-6">
          <section className="rounded-xl bg-slate-50 p-5">
            <MessagesSquare className="mb-4 size-5 text-accent-700" />
            <h2 className="font-semibold">Good questions start here</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Describe what you’re trying to understand, share relevant context and add a few topic
              tags. Specific questions make it easier for colleagues to help.
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => setAskOpen(true)}>
              Start a discussion
            </Button>
          </section>
          <section className="px-1">
            <h2 className="text-sm font-semibold">Make every answer useful</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Share your experience, link to guidance where helpful, and keep identifiable patient
              details out of discussions. Question authors can mark an answer as accepted.
            </p>
            <Link to="/community" className="mt-4 inline-block text-sm font-medium text-accent-700">
              Explore Community ↗
            </Link>
          </section>
        </aside>
      </div>
      <AskModal open={askOpen} onClose={() => setAskOpen(false)} />
    </AppShell>
  );
}
