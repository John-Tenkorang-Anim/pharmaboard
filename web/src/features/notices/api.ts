import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type {
  AudienceRule,
  DeliveryReport,
  Notice,
  NoticeListResponse,
  NoticeSeverity,
} from "@/lib/types";

export function useNotices(publishedOnly: boolean) {
  return useQuery({
    queryKey: ["notices", { publishedOnly }],
    queryFn: async () => {
      const items: Notice[] = [];
      let cursor = "";
      // Follow the existing cursor API so search never silently stops at 100 notices.
      while (true) {
        const page = await apiFetch<NoticeListResponse>(
          `/notices?published_only=${publishedOnly}&limit=100${cursor ? `&after=${cursor}` : ""}`,
        );
        items.push(...page.items);
        if (page.items.length < 100 || !page.next_cursor || page.next_cursor === cursor) break;
        cursor = page.next_cursor;
      }
      return { items };
    },
  });
}

export function useNotice(id: string | undefined) {
  return useQuery({
    queryKey: ["notices", id],
    queryFn: () => apiFetch<Notice>(`/notices/${id}`),
    enabled: !!id,
  });
}

// Delivery is asynchronous (an outbox-driven worker, not inline with the
// request), so this polls while a publisher is actively watching a notice —
// see docs/technical-design.md section 9.
export function useDeliveryReport(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["notices", id, "report"],
    queryFn: () => apiFetch<DeliveryReport>(`/notices/${id}/report`),
    enabled: !!id && enabled,
    refetchInterval: 3000,
  });
}

interface CreateNoticeInput {
  title: string;
  body_markdown: string;
  severity: NoticeSeverity;
  audience_rule: AudienceRule;
}

export function useCreateNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateNoticeInput) =>
      apiFetch<Notice>("/notices", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notices"] }),
  });
}

function useTransition(path: (id: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      version,
      ...rest
    }: {
      id: string;
      version: number;
      [key: string]: unknown;
    }) => apiFetch(path(id), { method: "POST", body: { version, ...rest } }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notices", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["notices", { publishedOnly: false }] });
      queryClient.invalidateQueries({ queryKey: ["notices", { publishedOnly: true }] });
    },
  });
}

export function useSubmitNotice() {
  return useTransition((id) => `/notices/${id}/submit`);
}

export function useRequestChanges() {
  return useTransition((id) => `/notices/${id}/request-changes`);
}

export function useApproveNotice() {
  return useTransition((id) => `/notices/${id}/approve`);
}

export function usePublishNotice() {
  return useTransition((id) => `/notices/${id}/publish`);
}

export function useWithdrawNotice() {
  return useTransition((id) => `/notices/${id}/withdraw`);
}

export function useAcknowledgeNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notices/${id}/ack`, { method: "POST" }),
    onSuccess: (_data, id) => queryClient.invalidateQueries({ queryKey: ["notices", id] }),
  });
}
