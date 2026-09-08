import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Modal } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { useResources } from "./api";
import { Link } from "react-router-dom";
type Entry = {
  id: string;
  title: string;
  url: string;
  kind: string;
  notes: string;
  completed: boolean;
};
const kinds = ["book", "article", "video", "reference"];
export function LibraryPage() {
  const client = useQueryClient();
  const library = useQuery({
    queryKey: ["library"],
    queryFn: () => apiFetch<{ items: Entry[] }>("/library/"),
  });
  const learning = useResources("learning", "", "", true);
  const [draft, setDraft] = useState<Entry | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const save = useMutation({
    mutationFn: (v: Entry) => apiFetch(`/library/${v.id}`, { method: "PUT", body: v }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["library"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/library/${id}`, { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["library"] }),
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      setDraft(null);
    } catch {
      /* retain draft */
    }
  }
  const items = (library.data?.items ?? []).filter(
    (v) =>
      (filter === "all" || (filter === "completed" ? v.completed : v.kind === filter)) &&
      `${v.title} ${v.notes}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <AppShell>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
            A space for your next idea
          </p>
          <h1 className="mt-2 text-3xl font-semibold">My library</h1>
          <p className="mt-2 text-sm text-muted">
            Your private collection of books, articles, videos and study notes.
          </p>
        </div>
        <Button
          onClick={() => {
            save.reset();
            setDraft({
              id: crypto.randomUUID(),
              title: "",
              url: "",
              kind: "article",
              notes: "",
              completed: false,
            });
          }}
        >
          <Plus size={16} />
          Save a resource
        </Button>
      </header>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-3 text-muted" size={18} />
            <input
              aria-label="Search your library"
              placeholder="Search titles and notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white py-3 pl-10 pr-4 text-sm"
            />
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {["all", ...kinds, "completed"].map((k) => (
              <button
                key={k}
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
                className={`rounded-full px-4 py-2 text-sm capitalize ${filter === k ? "bg-blue-700 text-white" : "bg-white text-muted"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <ErrorBanner error={library.error ?? remove.error ?? save.error} />
          {library.isLoading ? (
            <p role="status">Loading your library…</p>
          ) : items.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((v) => (
                <article key={v.id} className="social-card flex flex-col p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-medium capitalize text-amber-900">
                      {v.kind}
                    </span>
                    <BookOpen size={20} className="text-blue-700" />
                  </div>
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold leading-7 hover:text-accent-700"
                  >
                    {v.title} <ExternalLink size={14} className="inline" />
                  </a>
                  <p className="mt-2 truncate text-xs text-muted">{new URL(v.url).hostname}</p>
                  <p className="my-4 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {v.notes || "Add your takeaways or a reminder of why you saved this."}
                  </p>
                  <div className="mt-auto flex items-center gap-3 pt-3">
                    <label className="mr-auto flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={v.completed}
                        disabled={save.isPending}
                        onChange={() => save.mutate({ ...v, completed: !v.completed })}
                      />
                      Finished reading
                    </label>
                    <button
                      aria-label={`Edit ${v.title}`}
                      onClick={() => {
                        save.reset();
                        setDraft(v);
                      }}
                      className="p-2"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={`Remove ${v.title}`}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove “${v.title}” from your library?`))
                          remove.mutate(v.id);
                      }}
                      className="p-2 text-muted"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : !library.error ? (
            <div className="social-card p-10 text-center">
              <BookOpen className="mx-auto mb-4 text-blue-700" />
              <h2 className="font-semibold">
                {search || filter !== "all"
                  ? "No matching resources"
                  : "Build your reading collection"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                Save a book or article URL, then add notes as you study.
              </p>
            </div>
          ) : null}
        </section>
        <aside className="social-card self-start p-5">
          <h2 className="font-semibold">Saved learning</h2>
          <p className="mb-4 mt-2 text-xs leading-5 text-muted">
            Lessons you bookmarked in Learning.
          </p>
          <ErrorBanner error={learning.error} />
          {learning.data?.pages
            .flatMap((p) => p.items)
            .map((v) => (
              <Link key={v.id} to="/learning" className="mb-4 block text-sm font-medium leading-6">
                {v.title}
                <span className="block text-xs font-normal text-muted">
                  {v.completed ? "Completed" : "Ready to continue"}
                </span>
              </Link>
            ))}
          {learning.hasNextPage && (
            <Button
              variant="secondary"
              onClick={() => learning.fetchNextPage()}
              loading={learning.isFetchingNextPage}
            >
              Show more
            </Button>
          )}
          <Link to="/learning" className="mt-3 block text-sm text-accent-700">
            Explore learning →
          </Link>
        </aside>
      </div>
      <Modal open={!!draft} onClose={() => setDraft(null)} title="Save to your library">
        {draft && (
          <form onSubmit={submit} className="space-y-4">
            {[
              { key: "title", label: "Title", type: "text" },
              { key: "url", label: "Resource URL", type: "url" },
            ].map((f) => (
              <label key={f.key} className="block text-sm font-medium">
                {f.label}
                <input
                  required
                  type={f.type}
                  maxLength={f.key === "title" ? 200 : 2000}
                  value={draft[f.key as "title" | "url"]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  className="mt-2 w-full rounded-lg border border-hairline p-3"
                />
              </label>
            ))}
            <label className="block text-sm font-medium">
              Resource type
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                className="mt-2 w-full rounded-lg border border-hairline p-3"
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Your notes
              <textarea
                value={draft.notes}
                maxLength={8000}
                rows={4}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="mt-2 w-full rounded-lg border border-hairline p-3"
              />
            </label>
            <ErrorBanner error={save.error} />
            <Button loading={save.isPending}>Save resource</Button>
          </form>
        )}
      </Modal>
    </AppShell>
  );
}
