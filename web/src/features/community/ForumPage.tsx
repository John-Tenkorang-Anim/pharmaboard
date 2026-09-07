import { useState, type FormEvent } from "react";
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
  }

  return (
    <Modal open={open} onClose={onClose} title="Ask the profession">
      <form onSubmit={submit} className="space-y-4">
        <TextInput
          id="title"
          label="Question"
          placeholder="What are colleagues using during the amoxicillin shortage?"
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
          placeholder="shortage, paediatrics"
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
  const { data, isLoading, error } = useThreads(search);

  return (
    <AppShell width="narrow">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-ink">Rx Forum</h1>
          <p className="mt-1 text-sm text-faint">
            Practice questions answered by verified colleagues.
          </p>
        </div>
        <Button onClick={() => setAskOpen(true)}>
          <Plus className="size-4" />
          Ask
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
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
      ) : data && data.items.length > 0 ? (
        <div className="list-card">
          {data.items.map((thread) => (
            <Link key={thread.id} to={`/forum/${thread.id}`} className="list-row">
              <div className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={thread.author.display_name}
                    size="sm"
                    verification={thread.author.verification_state}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-[0.9375rem] font-bold leading-snug text-ink">
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
                    <div className="mt-2.5 flex items-center gap-4 text-[0.8125rem] text-faint">
                      <span>{thread.author.display_name}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3.5" />
                        {thread.reply_count}
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

      <AskModal open={askOpen} onClose={() => setAskOpen(false)} />
    </AppShell>
  );
}
