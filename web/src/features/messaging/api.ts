import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  CallSession,
  Conversation,
  ConversationListResponse,
  Message,
  MessageListResponse,
} from "@/lib/types";

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: () => apiFetch<ConversationListResponse>("/messaging/conversations?limit=100"),
    refetchInterval: 4000,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => apiFetch<Conversation>(`/messaging/conversations/${id}`),
    enabled: !!id,
  });
}

/**
 * useMessages polls incrementally using the safe-watermark cursor the
 * backend already returns (see internal/platform/changelog.PageByAudience)
 * instead of re-fetching the whole history every tick: each poll asks only
 * for entries after the last cursor seen, and new messages are merged in.
 * This is the same shape a "load more" / infinite-scroll implementation
 * would use going backward — polling forward is the mirror of it.
 */
export function useMessages(conversationId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const cursorRef = useRef(0);

  useEffect(() => {
    setMessages([]);
    cursorRef.current = 0;
  }, [conversationId]);

  const query = useQuery({
    queryKey: ["messages", conversationId, "poll", cursorRef.current],
    queryFn: () =>
      apiFetch<MessageListResponse>(
        `/messaging/conversations/${conversationId}/messages?after=${cursorRef.current}&limit=200`,
      ),
    enabled: !!conversationId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!query.data) return;
    if (query.data.items.length > 0) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = query.data!.items.filter((m) => !seen.has(m.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
    }
    cursorRef.current = query.data.next_cursor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  return { messages, isLoading: query.isLoading && messages.length === 0, error: query.error };
}

export function useSendMessage(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<Message>(`/messaging/conversations/${conversationId}/messages`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId, "poll"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

interface CreateConversationInput {
  participant_ids: string[];
  title?: string;
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      apiFetch<Conversation>("/messaging/conversations", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export function useAddParticipant(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/messaging/conversations/${conversationId}/participants`, {
        method: "POST",
        body: { user_id: userId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["conversations", conversationId] }),
  });
}

export function useStartCall(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<CallSession>(`/messaging/conversations/${conversationId}/calls`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId, "poll"] }),
  });
}

export function useUnreadMessages() {
  return useQuery({
    queryKey: ["unread-messages"],
    queryFn: () =>
      apiFetch<{
        count: number;
        items: { conversation_id: string; count: number; title: string }[];
      }>("/messaging/unread"),
    refetchInterval: 4000,
  });
}
export function useMarkMessagesRead(conversationId: string, throughMessageId?: string) {
  const client = useQueryClient();
  useEffect(() => {
    if (!throughMessageId) return;
    let active = true;
    const mark = async () => {
      if (document.visibilityState !== "visible" || !active) return;
      try {
        await apiFetch(`/messaging/conversations/${conversationId}/read`, {
          method: "POST",
          body: { through_message_id: throughMessageId },
        });
        if (active) client.invalidateQueries({ queryKey: ["unread-messages"] });
      } catch {
        /* Retry while the visible conversation remains open. */
      }
    };
    void mark();
    document.addEventListener("visibilitychange", mark);
    const timer = window.setInterval(mark, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [conversationId, throughMessageId, client]);
}
