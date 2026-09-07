import { useState, useEffect, type FormEvent } from "react";
import { Search, X, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useDirectory } from "@/features/community/api";
import { useAuth } from "@/features/auth/AuthContext";
import { useCreateConversation } from "./api";
export function NewConversationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<{ id: string; display_name: string }[]>([]);
  const [title, setTitle] = useState("");
  const create = useCreateConversation();
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, error, isLoading } = useDirectory(term);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected.length) return;
    try {
      const result = await create.mutateAsync({
        participant_ids: selected.map((p) => p.id),
        title: selected.length > 1 ? title : undefined,
      });
      setSelected([]);
      setTitle("");
      setSearch("");
      onCreated(result.id);
    } catch {
      /* rendered below */
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Start a conversation">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-6 text-muted">
          Choose a colleague for a direct message, or bring several people together for a team
          conversation. Up to 20 members, including you.
        </p>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-muted" />
          <input
            aria-label="Find colleagues"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search colleagues by name"
            className="w-full rounded-lg border border-divider py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(selected.filter((s) => s.id !== p.id))}
              className="flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1.5 text-xs text-accent-700"
              aria-label={`Remove ${p.display_name}`}
            >
              {p.display_name}
              <X size={13} />
            </button>
          ))}
        </div>
        <div className="max-h-52 overflow-y-auto rounded-lg border border-hairline">
          {isLoading ? (
            <p className="p-4 text-sm text-muted">Finding colleagues…</p>
          ) : (
            (data?.items ?? [])
              .filter((p) => p.id !== user?.id && !selected.some((s) => s.id === p.id))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={selected.length >= 19}
                  onClick={() => setSelected([...selected, p])}
                  className="flex w-full items-center gap-3 border-b border-hairline p-3 text-left hover:bg-canvas disabled:opacity-40"
                >
                  <Avatar name={p.display_name} size="sm" />
                  <span>
                    <span className="block text-sm font-medium">{p.display_name}</span>
                    <span className="text-xs capitalize text-muted">{p.account_kind}</span>
                  </span>
                </button>
              ))
          )}
          {!isLoading && !data?.items.length && (
            <p className="p-4 text-sm text-muted">No colleagues match your search.</p>
          )}
        </div>
        {selected.length > 1 && (
          <label className="block text-sm font-medium">
            Team name
            <input
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Research group · Journal club"
              className="mt-2 w-full rounded-lg border border-divider p-2.5 text-sm"
            />
          </label>
        )}
        <ErrorBanner error={error || create.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected.length} loading={create.isPending}>
            <Users size={16} />
            {selected.length > 1 ? "Create team conversation" : "Start conversation"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
