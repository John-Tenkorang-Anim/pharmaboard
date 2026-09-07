import { useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
export type ResourceKind = "learning" | "jobs" | "sessions";
export interface Resource {
  id: string;
  owner_id: string;
  kind: ResourceKind;
  title: string;
  description: string;
  category: string;
  organization: string;
  location: string;
  url: string;
  starts_at: string | null;
  created_at: string;
  saved: boolean;
  completed: boolean;
}
export function useResources(kind: ResourceKind, q = "", category = "", saved = false) {
  return useInfiniteQuery({
    queryKey: ["workspace", kind, q, category, saved],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch<{ items: Resource[]; has_more: boolean }>(
        `/workspace?kind=${kind}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&saved=${saved}&page=${pageParam}`,
      ),
    getNextPageParam: (last, _pages, page) => (last.has_more ? page + 1 : undefined),
  });
}
export function useResourceActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["workspace"] });
  const publish = useMutation({
    mutationFn: (v: Partial<Resource>) =>
      apiFetch(`/workspace/${v.id}`, { method: "PUT", body: v }),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: ({
      id,
      saved,
      completed = false,
    }: {
      id: string;
      saved: boolean;
      completed?: boolean;
    }) => apiFetch(`/workspace/${id}/saved`, { method: "PUT", body: { saved, completed } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/workspace/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  return { publish, save, remove };
}
export function youtubeId(url: string) {
  try {
    const u = new URL(url);
    const id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v");
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function meetingCode(id: string) {
  return id.replaceAll("-", "").slice(-12).toUpperCase().match(/.{4}/g)?.join("-") ?? "";
}
export function useJoinMeeting() {
  return useMutation({
    mutationFn: (code: string) =>
      apiFetch<Resource>(`/workspace/join/${encodeURIComponent(code.trim())}`),
  });
}
