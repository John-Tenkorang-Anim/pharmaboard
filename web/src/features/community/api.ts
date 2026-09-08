import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  DirectoryResponse,
  FeedPost,
  FeedResponse,
  ForumThreadSummary,
  ProfileView,
  ThreadDetail,
} from "@/lib/types";

export type FeedScope = "everyone" | "following";

export function useFeed(scope: FeedScope) {
  return useQuery({
    queryKey: ["feed", scope],
    queryFn: () => apiFetch<FeedResponse>(`/community/feed?scope=${scope}&limit=30`),
  });
}

export function useCreatePost(scope: FeedScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<FeedPost>("/community/feed", { method: "POST", body: { body } }),
    // The new post appears in the feed immediately rather than after a
    // refetch round-trip — the difference between "app" and "web form".
    onSuccess: (post) => {
      queryClient.setQueryData<FeedResponse>(["feed", scope], (prev) =>
        prev ? { ...prev, items: [post, ...prev.items] } : { items: [post] },
      );
      queryClient.invalidateQueries({ queryKey: ["feed"] });
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });
}

/**
 * useSetReaction updates the count and the pressed state optimistically, then
 * rolls back if the server disagrees. Waiting ~150ms for a round-trip before
 * a like registers is the single most "dead-feeling" thing a social UI can
 * do, so it is deliberately not done that way here.
 */
export function useSetReaction(scope: FeedScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, on }: { postId: string; on: boolean }) =>
      apiFetch(`/community/posts/${postId}/reaction`, { method: on ? "PUT" : "DELETE" }),
    onMutate: async ({ postId, on }) => {
      const key = ["feed", scope];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<FeedResponse>(key);
      queryClient.setQueryData<FeedResponse>(key, (prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((p) =>
                p.id === postId
                  ? {
                      ...p,
                      viewer_reacted: on,
                      reaction_count: Math.max(0, p.reaction_count + (on ? 1 : -1)),
                    }
                  : p,
              ),
            }
          : prev,
      );
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => apiFetch<ProfileView>(`/community/people/${userId}`),
    enabled: !!userId,
  });
}

export function useSetFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, on }: { userId: string; on: boolean }) =>
      apiFetch(`/community/people/${userId}/follow`, { method: on ? "PUT" : "DELETE" }),
    onMutate: async ({ userId, on }) => {
      const key = ["profile", userId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProfileView>(key);
      queryClient.setQueryData<ProfileView>(key, (prev) =>
        prev
          ? {
              ...prev,
              viewer_follows: on,
              stats: {
                ...prev.stats,
                followers: Math.max(0, prev.stats.followers + (on ? 1 : -1)),
              },
            }
          : prev,
      );
      return { previous, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["network"] });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      void queryClient.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });
}

export function useDirectory(search: string) {
  return useQuery({
    queryKey: ["directory", search],
    queryFn: () => apiFetch<DirectoryResponse>(`/users?q=${encodeURIComponent(search)}&limit=30`),
  });
}

export function useThreads(search: string) {
  return useQuery({
    queryKey: ["forum", search],
    queryFn: () =>
      apiFetch<{ items: ForumThreadSummary[] }>(
        `/community/forum?q=${encodeURIComponent(search)}&limit=30`,
      ),
  });
}

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: ["forum", "thread", id],
    queryFn: () => apiFetch<ThreadDetail>(`/community/forum/${id}`),
    enabled: !!id,
  });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string; tags: string[] }) =>
      apiFetch<{ id: string }>("/community/forum", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forum"] }),
  });
}

export function useReply(threadId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<{ id: string }>(`/community/forum/${threadId}/replies`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forum"] }),
  });
}

export function useAcceptReply(threadId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (replyId: string) =>
      apiFetch(`/community/forum/${threadId}/accepted-reply`, {
        method: "PUT",
        body: { reply_id: replyId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forum"] }),
  });
}

export function useCommunityFeed(scope: FeedScope, search = "") {
  return useInfiniteQuery({
    queryKey: ["community-feed", scope, search],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiFetch<FeedResponse>(
        `/community/feed?scope=${scope}&q=${encodeURIComponent(search)}&limit=20${pageParam ? `&before=${pageParam}` : ""}`,
      ),
    getNextPageParam: (last) => (last.items.length === 20 ? last.next_cursor : undefined),
  });
}
export function usePost(id: string | undefined) {
  return useQuery({
    queryKey: ["post", id],
    queryFn: () => apiFetch<FeedPost>(`/community/posts/${id}`),
    enabled: !!id,
  });
}
export interface PostComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  author: FeedPost["author"];
  created_at: string;
  deleted: boolean;
}
export function useComments(postId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["comments", postId],
    refetchInterval: enabled ? 15000 : false,
    refetchOnWindowFocus: true,
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: PostComment[]; has_more: boolean }>(
        `/community/posts/${postId}/comments?page=${pageParam}`,
      ),
    getNextPageParam: (last, _pages, page) => (last.has_more ? page + 1 : undefined),
  });
}
export function usePostActions(postId: string) {
  const client = useQueryClient();
  const refresh = () => {
    for (const key of ["feed", "community-feed", "post", "profile", "comments"])
      void client.invalidateQueries({ queryKey: [key] });
  };
  const comment = useMutation({
    mutationFn: (input: { id: string; body: string; parent_id: string | null }) =>
      apiFetch(`/community/posts/${postId}/comments/${input.id}`, { method: "PUT", body: input }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/community/posts/${postId}/comments/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const react = useMutation({
    mutationFn: (on: boolean) =>
      apiFetch(`/community/posts/${postId}/reaction`, { method: on ? "PUT" : "DELETE" }),
    onSuccess: refresh,
  });
  const report = useMutation({
    mutationFn: (reason: string) =>
      apiFetch(`/community/posts/${postId}/report`, { method: "POST", body: { reason } }),
  });
  return { comment, remove, react, report };
}

export type NetworkView = "following" | "followers" | "discover" | "suggested";
export function useNetwork(view: NetworkView, search: string) {
  return useInfiniteQuery({
    queryKey: ["network", view, search],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      apiFetch<{
        items: (DirectoryResponse["items"][number] & {
          viewer_follows: boolean;
          mutual_count: number;
          suggestion_reason: string;
        })[];
        next_cursor: string;
      }>(`/community/network?view=${view}&q=${encodeURIComponent(search)}&after=${pageParam}`),
    getNextPageParam: (last) => last.next_cursor || undefined,
  });
}
