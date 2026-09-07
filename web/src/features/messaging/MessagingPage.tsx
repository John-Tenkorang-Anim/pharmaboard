import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  MessageCircle,
  Plus,
  Send,
  Video,
  ShieldAlert,
  Users as UsersIcon,
  Lock,
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
  useConversation,
  useConversations,
  useMessages,
  useSendMessage,
  useStartCall,
} from "./api";
import { NewConversationModal } from "./NewConversationModal";

function conversationLabel(conversation: Conversation): string {
  if (conversation.kind === "group") return conversation.title ?? "Group conversation";
  return "Direct message";
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
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        active ? "bg-accent-50" : "hover:bg-canvas",
      )}
    >
      {conversation.kind === "group" ? (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-navy-400 to-navy-600 text-white">
          <UsersIcon className="size-5" />
        </div>
      ) : (
        <Avatar name={conversationLabel(conversation)} size="md" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate text-[0.875rem] text-ink",
            active ? "font-bold" : "font-semibold",
          )}
        >
          {conversationLabel(conversation)}
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

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  if (message.kind === "system") {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full border border-hairline bg-canvas px-3 py-1 text-xs text-faint">
          {message.body}
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
        <p className="whitespace-pre-wrap">{message.body}</p>
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
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage(conversationId);
  const startCall = useStartCall(conversationId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const body = draft;
    setDraft("");
    await sendMessage.mutateAsync(body);
  }

  async function handleStartCall() {
    const call = await startCall.mutateAsync();
    window.open(call.room_url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-bold text-ink">
            {conversation ? conversationLabel(conversation) : "Conversation"}
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

      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto bg-canvas px-5 py-4"
      >
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="size-6" />}
            title="No messages yet"
            description="Say hello to start the conversation."
          />
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} isOwn={m.sender_id === user?.id} />
          ))
        )}
      </div>

      {startCall.data && (
        <div className="flex items-start gap-2 border-t border-amber-50 bg-amber-50 px-5 py-2.5 text-[0.8125rem] text-amber-800">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          {startCall.data.provider_notice}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="flex items-end gap-2 border-t border-hairline bg-surface p-3"
      >
        <textarea
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
          type="submit"
          loading={sendMessage.isPending}
          disabled={!draft.trim()}
          className="rounded-full !px-3"
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

      <Card className="flex h-[calc(100vh-15rem)] overflow-hidden p-0">
        <aside className="flex w-72 shrink-0 flex-col border-r border-hairline">
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

        <div className="min-w-0 flex-1">
          {conversationId ? (
            <ThreadView conversationId={conversationId} />
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
