import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  MessageCircle,
  Plus,
  Send,
  Video,
  ArrowLeft,
  Users as UsersIcon,
  Lock,
  Search,
  Link2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthContext";
import { formatRelative, formatTime } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import {
  useMarkMessagesRead,
  useConversation,
  useConversations,
  useMessages,
  useSendMessage,
  useStartCall,
} from "./api";
import { MeetingRoom } from "./MeetingRoom";
import { NewConversationModal } from "./NewConversationModal";

function conversationLabel(conversation: Conversation, viewerId?: string): string {
  if (conversation.kind === "group") return conversation.title ?? "Group conversation";
  return (
    conversation.members
      ?.filter((m) => m.id !== viewerId)
      .map((m) => m.name)
      .join(", ") || "Direct message"
  );
}

function ConversationListItem({
  conversation,
  active,
  onClick,
}: {
  conversation: Conversation;
  active: boolean;
  onClick: () => void;
}) {
  const { user } = useAuth();
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        active ? "bg-accent-50" : "hover:bg-canvas",
      )}
    >
      {conversation.kind === "group" ? (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white">
          <UsersIcon className="size-5" />
        </div>
      ) : (
        <Avatar name={conversationLabel(conversation, user?.id)} size="md" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-[0.875rem] text-ink",
            active ? "font-bold" : "font-semibold",
          )}
        >
          {conversationLabel(conversation, user?.id)}
        </p>
        <p className="truncate text-[0.8125rem] text-faint">
          {conversation.last_message_at
            ? formatRelative(conversation.last_message_at)
            : "No messages yet"}
        </p>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  isOwn,
  onJoin,
  senderName,
}: {
  senderName?: string;
  message: Message;
  isOwn: boolean;
  onJoin: (url: string) => void;
}) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-md bg-slate-50 px-3 py-1 text-xs text-faint">
          {message.body}
          {message.body.match(/https:\/\/meet\.jit\.si\/[A-Za-z0-9-]+/) && (
            <button
              className="ml-3 font-semibold text-accent-600 underline"
              onClick={() =>
                onJoin(message.body.match(/https:\/\/meet\.jit\.si\/[A-Za-z0-9-]+/)![0])
              }
            >
              Join meeting
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className={clsx("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[75%] rounded-lg px-4 py-2.5 text-[0.9375rem] leading-relaxed",
          isOwn
            ? "rounded-br-md bg-accent-700 text-white"
            : "rounded-bl-md bg-surface text-ink border border-hairline",
        )}
      >
        {!isOwn && (
          <p className="mb-1 text-xs font-semibold text-accent-700">{senderName ?? "Member"}</p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className={clsx("mt-1 text-[0.625rem]", isOwn ? "text-hairline" : "text-faint")}>
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}

function ThreadView({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const { data: conversation } = useConversation(conversationId);
  const { messages, isLoading, error: messagesError } = useMessages(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const startCall = useStartCall(conversationId);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"chat" | "resources">("chat");
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = messages.at(-1);
  useMarkMessagesRead(
    conversationId,
    tab === "chat" && !search && latest?.conversation_id === conversationId ? latest.id : undefined,
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sendMessage.isPending) return;
    const body = draft;
    try {
      await sendMessage.mutateAsync(body);
      setDraft("");
    } catch {
      /* Keep draft available for retry. */
    }
  }

  async function handleStartCall() {
    try {
      const call = await startCall.mutateAsync();
      setRoom(call.room_url);
    } catch {
      /* Shown below. */
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-bold text-ink">
            {conversation ? conversationLabel(conversation, user?.id) : "Conversation"}
          </p>
          <p className="flex items-center gap-1 text-[0.8125rem] text-faint">
            <Lock className="size-3" />
            Not end-to-end encrypted
          </p>
        </div>
        <Button size="sm" loading={startCall.isPending} onClick={handleStartCall}>
          <Video className="size-4" />
          Video call
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-2">
        <button
          onClick={() => setTab("chat")}
          aria-pressed={tab === "chat"}
          className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === "chat" ? "bg-accent-50 text-accent-700" : "text-muted"}`}
        >
          Conversation
        </button>
        <button
          onClick={() => setTab("resources")}
          aria-pressed={tab === "resources"}
          className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === "resources" ? "bg-accent-50 text-accent-700" : "text-muted"}`}
        >
          Shared links
        </button>
        <label className="relative ml-auto">
          <Search size={13} className="absolute left-2 top-2 text-muted" />
          <input
            aria-label="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversation"
            className="w-40 rounded border border-hairline py-1.5 pl-7 pr-2 text-xs"
          />
        </label>
      </div>
      {room && <MeetingRoom url={room} title="Team meeting" onLeave={() => setRoom(null)} />}
      <ErrorBanner error={messagesError || startCall.error} />
      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto bg-canvas px-5 py-4"
      >
        {tab === "resources" ? (
          <div className="space-y-3">
            {Array.from(
              new Set(
                messages
                  .filter(
                    (m) => m.kind === "text" && m.body.toLowerCase().includes(search.toLowerCase()),
                  )
                  .flatMap((m) => m.body.match(/https:\/\/[^\s<>]+/g) ?? []),
              ),
            ).map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 break-all rounded-lg border border-hairline bg-white p-4 text-sm text-accent-700"
              >
                <Link2 size={18} className="shrink-0" />
                {url}
              </a>
            ))}
            <p className="text-xs text-muted">
              HTTPS links shared in this conversation appear here automatically.
            </p>
          </div>
        ) : isLoading ? (
          <SkeletonList rows={3} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="size-6" />}
            title="No messages yet"
            description="Say hello to start the conversation."
          />
        ) : (
          messages
            .filter((m) => m.body.toLowerCase().includes(search.toLowerCase()))
            .map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                isOwn={m.sender_id === user?.id}
                senderName={conversation?.members?.find((p) => p.id === m.sender_id)?.name}
                onJoin={setRoom}
              />
            ))
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-hairline bg-surface p-3"
      >
        <textarea
          aria-label="Message"
          maxLength={4000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          rows={1}
          placeholder="Write a message…"
          className="max-h-32 flex-1 resize-none rounded-lg border border-hairline bg-canvas px-4 py-2.5 text-sm transition-colors placeholder:text-faint focus-visible:border-accent-600 focus-visible:bg-surface focus-visible:outline-none"
        />
        <Button
          aria-label="Send message"
          type="submit"
          loading={sendMessage.isPending}
          disabled={!draft.trim()}
          className="!px-3"
        >
          <Send className="size-4" />
        </Button>
      </form>
      {sendMessage.error != null && (
        <div className="px-3 pb-3">
          <ErrorBanner error={sendMessage.error} />
        </div>
      )}
    </div>
  );
}

export function MessagingPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useConversations();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <AppShell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.75rem] font-semibold text-ink">Messages</h1>
          <p className="mt-1 text-sm text-faint">Direct and small-group conversations.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="size-4" />
          New
        </Button>
      </div>

      {conversationId && (
        <Button
          className="mb-3 md:hidden"
          variant="secondary"
          onClick={() => navigate("/messaging")}
        >
          <ArrowLeft size={15} />
          All conversations
        </Button>
      )}
      <Card className="flex min-h-[520px] h-[calc(100dvh-15rem)] overflow-hidden p-0">
        <aside
          className={clsx(
            "w-full md:w-64 shrink-0 flex-col border-r border-hairline",
            conversationId ? "hidden md:flex" : "flex",
          )}
        >
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {error != null && (
              <div className="p-4">
                <ErrorBanner error={error} />
              </div>
            )}
            {isLoading ? (
              <div className="p-4">
                <SkeletonList rows={4} />
              </div>
            ) : data && data.items.length > 0 ? (
              data.items.map((c) => (
                <ConversationListItem
                  key={c.id}
                  conversation={c}
                  active={c.id === conversationId}
                  onClick={() => navigate(`/messaging/${c.id}`)}
                />
              ))
            ) : (
              <EmptyState title="No conversations" description="Start one to reach a colleague." />
            )}
          </div>
        </aside>

        <div className={clsx("min-w-0 flex-1", !conversationId && "hidden md:block")}>
          {conversationId ? (
            <ThreadView key={conversationId} conversationId={conversationId} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={<MessageCircle className="size-6" />}
                title="Select a conversation"
                description="Choose one from the list, or start a new conversation."
                action={
                  <Button onClick={() => setModalOpen(true)}>
                    <Plus className="size-4" />
                    New conversation
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </Card>

      <NewConversationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          navigate(`/messaging/${id}`);
        }}
      />
    </AppShell>
  );
}
