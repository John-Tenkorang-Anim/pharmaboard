import { RichTextEditor } from "@/components/ui/RichText";
import { platform } from "@/lib/platform";
import { useState, useEffect, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessagesSquare, CheckCircle2, Search, SquarePen, MessageSquare, Hash } from "lucide-react";
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
import type { Community } from "@/lib/types";
import { useChannels, useCreateChannel, useCreateThread, useThreads } from "./api";

function AskModal({
  open,
  onClose,
  channels,
  defaultChannelId,
}: {
  open: boolean;
  onClose: () => void;
  channels: Community[];
  defaultChannelId: string;
}) {
  const createThread = useCreateThread();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [channelId, setChannelId] = useState(defaultChannelId);
  // Reset the picked channel to the caller's default each time the dialog
  // opens — adjusted during render (not an effect) so the very first paint
  // of the reopened dialog already reflects the new default, with no frame
  // where a stale selection from the last time it was open is visible.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChannelId(defaultChannelId);
  }

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
        channel_id: channelId || undefined,
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
    <Modal open={open} onClose={onClose} title="Start a study discussion">
      <form onSubmit={submit} className="space-y-4">
        {channels.length > 0 && (
          <div>
            <label
              htmlFor="thread-channel"
              className="mb-1.5 block text-[0.8125rem] font-medium text-ink"
            >
              Channel
            </label>
            <select
              id="thread-channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full rounded border border-divider bg-surface px-3 py-2 text-sm text-ink focus-visible:border-accent-600 focus-visible:outline-none"
            >
              <option value="">Uncategorized</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
        <div className="flex flex-wrap gap-2">
          {["Concept explanation", "Study group", "Research discussion"].map((kind) => (
            <button
              key={kind}
              type="button"
              className="rounded-full bg-blue-50 px-3 py-2 text-xs text-blue-800"
              onClick={() => {
                if (!body.trim())
                  setBody(
                    kind === "Concept explanation"
                      ? "# What I am studying\n\n# What I understand so far\n\n# My question\n"
                      : kind === "Study group"
                        ? "# Study topic\n\n# Learning objectives\n\n# Plan and availability\n"
                        : "# Research question\n\n# Source or article URL\n\n# Points for discussion\n",
                  );
                setTags(kind.toLowerCase().replaceAll(" ", "-"));
              }}
            >
              {kind}
            </button>
          ))}
        </div>
        <RichTextEditor
          label="Discussion details"
          placeholder="Set out what you're studying and where you'd like input…"
          value={body}
          onChange={setBody}
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
            Publish discussion
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateChannelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createChannel = useCreateChannel();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await createChannel.mutateAsync({ name, description });
      setName("");
      setDescription("");
      onClose();
    } catch {
      /* Keep the draft available for retry. */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create a channel">
      <form onSubmit={submit} className="space-y-4">
        <TextInput
          id="channel-name"
          label="Channel name"
          placeholder="Community Pharmacy"
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={80}
          required
        />
        <TextArea
          id="channel-description"
          label="Description"
          placeholder="What belongs in this channel?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          rows={3}
        />
        <ErrorBanner error={createChannel.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={createChannel.isPending}>
            Create channel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ForumPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [askOpen, setAskOpen] = useState(() => searchParams.get("ask") === "1");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState("all");
  const [channelId, setChannelId] = useState("");

  useEffect(() => {
    if (searchParams.has("ask")) {
      const next = new URLSearchParams(searchParams);
      next.delete("ask");
      setSearchParams(next, { replace: true });
    }
    // Only ever consume the query param once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const channels = useChannels();
  const channelItems = channels.data?.items ?? [];
  const { data, isLoading, error } = useThreads(query, channelId || undefined);
  const threads = (data?.items ?? []).filter(
    (t) =>
      (!topic || t.tags.includes(topic)) &&
      (filter === "all" || (filter === "answered" ? t.has_accepted : t.reply_count === 0)),
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent-700">
            THE STUDY ROOM
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{platform.forumName}</h1>
          <p className="mt-1 text-sm text-faint">
            Work through concepts, compare research, and prepare together.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAskOpen(true)}>
          <SquarePen className="size-4" />
          Start discussion
        </Button>
      </div>

      <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)_270px]">
        <aside className="space-y-1">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-faint">Channels</h2>
            <button
              type="button"
              aria-label="Create a channel"
              onClick={() => setCreateChannelOpen(true)}
              className="rounded p-1 text-muted hover:bg-slate-50 hover:text-accent-700"
            >
              <SquarePen className="size-4" />
            </button>
          </div>
          <button
            onClick={() => setChannelId("")}
            aria-pressed={channelId === ""}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${channelId === "" ? "bg-ink text-white" : "text-muted hover:bg-slate-50"}`}
          >
            All channels
          </button>
          {channelItems.map((c) => (
            <button
              key={c.id}
              onClick={() => setChannelId(c.id)}
              aria-pressed={channelId === c.id}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${channelId === c.id ? "bg-ink text-white" : "text-muted hover:bg-slate-50"}`}
              title={c.description || c.name}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Hash className="size-3.5 shrink-0" />
                <span className="truncate">{c.name}</span>
              </span>
              <span
                className={`shrink-0 text-xs ${channelId === c.id ? "text-white/70" : "text-faint"}`}
              >
                {c.thread_count}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCreateChannelOpen(true)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm text-accent-700 hover:bg-accent-50"
          >
            <SquarePen className="size-3.5" />
            New channel
          </button>
        </aside>
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

          <div className="mb-5 flex flex-wrap gap-2" aria-label="Discussion topics">
            {["", ...new Set((data?.items ?? []).flatMap((t) => t.tags))].map((t) => (
              <button
                key={t}
                aria-pressed={topic === t}
                onClick={() => setTopic(t)}
                className={`rounded-full px-3 py-2 text-xs ${topic === t ? "bg-blue-100 text-blue-900" : "bg-white text-muted"}`}
              >
                {t || "All topics"}
              </button>
            ))}
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
              {threads.map((thread) => {
                const channel = channelItems.find((c) => c.id === thread.channel_id);
                return (
                  <Link
                    key={thread.id}
                    to={`/forum/${thread.id}`}
                    className="social-card block p-2 transition-shadow hover:shadow-md"
                  >
                    <div className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <Avatar
                          userId={thread.author.id}
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
                            {thread.body.replace(/[#*=]/g, "")}
                          </p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {channel && (
                              <Chip className="bg-blue-50 text-blue-800">
                                <Hash className="size-3" />
                                {channel.name}
                              </Chip>
                            )}
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
                );
              })}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<MessagesSquare className="size-6" />}
                title={
                  search || topic || filter !== "all" || channelId
                    ? "No discussions match these filters"
                    : "Start the first study discussion"
                }
                description="Ask the first question and colleagues can answer it."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setAskOpen(true)}>
                    Start discussion
                  </Button>
                }
              />
            </Card>
          )}
        </section>
        <aside className="space-y-6">
          <section className="social-card p-5">
            <h2 className="font-semibold">Your study library</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Keep books, articles and useful references together for your next discussion.
            </p>
            <Link className="mt-4 inline-block text-sm font-medium text-accent-700" to="/library">
              Open my library →
            </Link>
          </section>
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
            <Link to="/home" className="mt-4 inline-block text-sm font-medium text-accent-700">
              Explore Community ↗
            </Link>
          </section>
        </aside>
      </div>
      <AskModal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        channels={channelItems}
        defaultChannelId={channelId}
      />
      <CreateChannelModal open={createChannelOpen} onClose={() => setCreateChannelOpen(false)} />
    </AppShell>
  );
}
