import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/AuthContext";
import { formatRelative, formatTime } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import { useConversation, useConversations, useMessages, useSendMessage, useStartCall } from "./api";
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
        "flex w-full items-start gap-3 border-t border-rule px-5 py-4 text-left transition-colors",
        active ? "bg-paper-sunken" : "hover:bg-paper-sunken/60",
      )}
    >
      <Avatar name={conversationLabel(conversation)} size="sm" />
      <div className="min-w-0 flex-1">
        <p
          className={clsx(
            "truncate font-sans text-[0.8125rem] text-ink",
            active && "font-medium",
          )}
        >
          {conversationLabel(conversation)}
        </p>
        <p className="mt-0.5 font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
          {conversation.kind === "group" ? "Group" : "Direct"}
          <span className="px-1.5 text-rule">/</span>
          {conversation.last_message_at ? formatRelative(conversation.last_message_at) : "No messages"}
        </p>
      </div>
    </button>
  );
}

function MessageRow({ message, isOwn }: { message: Message; isOwn: boolean }) {
  if (message.kind === "system") {
    return (
      <div className="flex items-center gap-3 py-3">
        <span className="h-px flex-1 bg-rule" />
        <span className="label-caps text-ink-faint">{message.body}</span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }

  // Correspondence, not chat bubbles: sender rule, then the text at a
  // readable measure. Own messages are marked by the rule side and label.
  return (
    <div className={clsx("py-3.5", isOwn ? "pl-10" : "pr-10")}>
      <div className={clsx("border-l-2 pl-4", isOwn ? "border-ink" : "border-rule")}>
        <p className="label-caps text-ink-faint">
          {isOwn ? "You" : "Correspondent"}
          <span className="px-1.5 text-rule">/</span>
          <span className="font-mono normal-case tracking-normal">
            {formatTime(message.created_at)}
          </span>
        </p>
        <p className="mt-1.5 whitespace-pre-wrap font-display text-[0.9375rem] leading-[1.65] text-ink">
          {message.body}
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
      <div className="flex items-start justify-between gap-4 border-b border-rule px-7 py-4">
        <div>
          <p className="font-display text-display-sm text-ink">
            {conversation ? conversationLabel(conversation) : "Conversation"}
          </p>
          {conversation && (
            <p className="mt-1 max-w-measure font-sans text-meta leading-relaxed text-ink-faint">
              {conversation.encryption_notice}
            </p>
          )}
        </div>
        <Button size="sm" variant="secondary" loading={startCall.isPending} onClick={handleStartCall}>
          Start video call
        </Button>
      </div>

      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto px-7 py-4">
        {isLoading ? (
          <SkeletonList rows={3} />
        ) : messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Send the first message to open this correspondence."
          />
        ) : (
          messages.map((m) => (
            <MessageRow key={m.id} message={m} isOwn={m.sender_id === user?.id} />
          ))
        )}
      </div>

      {startCall.data && (
        <div className="border-t border-rule bg-paper-sunken px-7 py-3">
          <p className="kicker text-signal-urgent">Third-party provider</p>
          <p className="mt-1 font-sans text-meta leading-relaxed text-ink-muted">
            {startCall.data.provider_notice}
          </p>
        </div>
      )}

      <form onSubmit={handleSend} className="border-t border-rule px-7 py-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          rows={2}
          placeholder="Write a message…"
          className="w-full resize-none border border-rule bg-paper-raised px-3.5 py-3 font-display text-[0.9375rem] leading-relaxed text-ink placeholder:font-sans placeholder:text-[0.8125rem] placeholder:text-ink-faint focus-visible:border-ink focus-visible:outline-none"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.06em] text-ink-faint">
            Return to send · Shift + Return for a new line
          </span>
          <Button type="submit" size="sm" loading={sendMessage.isPending} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
        {sendMessage.error != null && (
          <div className="mt-3">
            <ErrorBanner error={sendMessage.error} />
          </div>
        )}
      </form>
    </div>
  );
}

export function MessagingPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useConversations();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <AppShell
      kicker="Direct"
      title="Messages"
      actions={
        <Button size="sm" onClick={() => setModalOpen(true)}>
          New conversation
        </Button>
      }
    >
      <div className="flex h-[calc(100vh-14rem)] border border-rule bg-paper-raised">
        <aside className="flex w-72 shrink-0 flex-col border-r border-rule">
          <p className="label-caps px-5 py-4 text-ink-faint">Correspondence</p>
          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {error != null && (
              <div className="px-5 py-4">
                <ErrorBanner error={error} />
              </div>
            )}
            {isLoading ? (
              <div className="px-5">
                <SkeletonList rows={4} />
              </div>
            ) : data && data.items.length > 0 ? (
              <>
                {data.items.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conversation={c}
                    active={c.id === conversationId}
                    onClick={() => navigate(`/messaging/${c.id}`)}
                  />
                ))}
                <div className="border-t border-rule" />
              </>
            ) : (
              <div className="px-5">
                <EmptyState title="None yet" description="Start one to reach a colleague directly." />
              </div>
            )}
          </div>
        </aside>

        <div className="flex-1">
          {conversationId ? (
            <ThreadView conversationId={conversationId} />
          ) : (
            <div className="flex h-full items-center justify-center px-8">
              <div className="max-w-measure text-center">
                <p className="font-display text-display-sm text-ink">Select a conversation</p>
                <p className="mt-2 font-sans text-[0.8125rem] leading-relaxed text-ink-muted">
                  Choose a correspondence from the list, or start a new one. Messages are not
                  end-to-end encrypted — see the notice shown in every conversation.
                </p>
                <div className="mt-6 flex justify-center">
                  <Button size="sm" onClick={() => setModalOpen(true)}>
                    New conversation
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
