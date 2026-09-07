import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";

export function useAuditEvents() {
  return useQuery({
    queryKey: ["audit-events"],
    queryFn: () => apiFetch<{ items: AuditEvent[] }>("/admin/audit-events?after=0&limit=100"),
  });
}

export function useBootstrap() {
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch("/admin/bootstrap", { method: "POST", body: { token } }),
  });
}

export function useGrantRole() {
  return useMutation({
    mutationFn: (input: { user_id: string; role: string }) =>
      apiFetch("/admin/roles", { method: "POST", body: input }),
  });
}

export function useVerifyUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      user_id: string;
      registration_number: string;
      evidence_source: string;
      reason: string;
    }) => apiFetch("/admin/verifications", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit-events"] }),
  });
}

export function useRevokeUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { user_id: string; reason: string }) =>
      apiFetch("/admin/revocations", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["audit-events"] }),
  });
}
