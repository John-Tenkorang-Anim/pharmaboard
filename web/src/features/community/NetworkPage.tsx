import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Users, MapPin, ArrowUpRight, Check, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { VerificationChip } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useNetwork, type NetworkView, useProfile, useSetFollow } from "./api";

function ProfilePreview({ id, onClose }: { id: string | undefined; onClose: () => void }) {
  const { data, isLoading, error } = useProfile(id);
  const follow = useSetFollow();
  return (
    <Modal open={!!id} onClose={onClose} title="Profile preview">
      {isLoading ? (
        <SkeletonList rows={3} />
      ) : data ? (
        <div>
          <div className="flex items-center gap-4">
            <Avatar
              userId={data.profile.id}
              name={data.profile.display_name}
              size="xl"
              verification={data.profile.verification_state}
            />
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold">{data.profile.display_name}</h2>
              <p className="mt-1 text-sm capitalize text-muted">
                {data.profile.practice_area || data.profile.account_kind}
              </p>
              {data.profile.region_code && (
                <p className="mt-2 flex items-center gap-1 text-xs text-faint">
                  <MapPin size={13} />
                  {data.profile.region_code}
                </p>
              )}
            </div>
          </div>
          <div className="mt-5">
            <VerificationChip state={data.profile.verification_state} />
          </div>
          <div className="my-6 grid grid-cols-3 rounded-xl bg-slate-50 p-4 text-center">
            {Object.entries(data.stats).map(([label, value]) => (
              <div key={label}>
                <strong className="block text-lg">{value}</strong>
                <span className="text-xs capitalize text-muted">{label}</span>
              </div>
            ))}
          </div>
          <ErrorBanner error={follow.error} />
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={follow.isPending}
              variant={data.viewer_follows ? "secondary" : "primary"}
              onClick={() => follow.mutate({ userId: data.profile.id, on: !data.viewer_follows })}
            >
              {data.viewer_follows ? <Check size={15} /> : <Plus size={15} />}{" "}
              {data.viewer_follows ? "Following" : "Follow"}
            </Button>
            <Link to={`/people/${data.profile.id}`}>
              <Button variant="secondary">
                View full profile <ArrowUpRight size={15} />
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-faint">
            Follow to see this colleague’s posts in your Following feed.
          </p>
        </div>
      ) : (
        <ErrorBanner error={error} />
      )}
    </Modal>
  );
}
export function NetworkPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("view");
  const view: NetworkView =
    initial === "followers" || initial === "discover" || initial === "suggested"
      ? initial
      : params.has("q") && !initial
        ? "discover"
        : "following";
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(term);
  const [selected, setSelected] = useState<string>();
  const follow = useSetFollow();
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  const network = useNetwork(view, debounced);
  const people = network.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">
          {view === "following"
            ? "My network"
            : view === "followers"
              ? "Your followers"
              : view === "suggested"
                ? "People you may know"
                : "Discover people"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {view === "following"
            ? "People you follow, all in one place."
            : view === "suggested"
              ? "Suggestions from people you follow, your school and your field."
              : "Explore public member profiles and follow people you’d like to learn from."}
        </p>
      </header>
      <nav aria-label="Network views" className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["following", "Following"],
            ["followers", "Followers"],
            ["discover", "Discover people"],
            ["suggested", "Suggested"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={view === key}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? "bg-accent-600 text-white" : "bg-white text-muted"}`}
            onClick={() => {
              setTerm("");
              setDebounced("");
              setParams({ view: key });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <label className="relative mb-6 block max-w-xl">
        <Search size={17} className="absolute left-3 top-3.5 text-muted" />
        <input
          aria-label="Search network"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={view === "following" ? "Search people you follow…" : "Search people…"}
          className="w-full rounded-lg border border-hairline bg-white py-3 pl-10 pr-4 text-sm"
        />
      </label>
      <ErrorBanner error={network.error || follow.error} />
      {network.isLoading ? (
        <SkeletonList rows={5} />
      ) : people.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {people.map((person) => (
            <article key={person.id} className="social-card flex flex-col p-5">
              <Link to={`/people/${person.id}`} className="flex items-center gap-3">
                <Avatar
                  userId={person.id}
                  name={person.display_name}
                  size="lg"
                  verification={person.verification_state}
                />
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{person.display_name}</h2>
                  <p className="mt-1 text-xs capitalize text-muted">
                    {person.practice_area || person.account_kind}
                  </p>
                </div>
              </Link>
              {person.institution && (
                <p className="mt-3 text-sm text-muted">{person.institution}</p>
              )}
              {view === "suggested" && (
                <p className="mt-3 text-xs text-accent-700">
                  {person.suggestion_reason}
                  {person.mutual_count > 0 ? ` · ${person.mutual_count}` : ""}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                <Button
                  variant={person.viewer_follows ? "secondary" : "primary"}
                  disabled={follow.isPending}
                  onClick={() => follow.mutate({ userId: person.id, on: !person.viewer_follows })}
                  aria-label={`${person.viewer_follows ? "Unfollow" : "Follow"} ${person.display_name}`}
                >
                  {person.viewer_follows ? <Check size={15} /> : <Plus size={15} />}{" "}
                  {person.viewer_follows ? "Following" : "Follow"}
                </Button>
                <button
                  className="text-xs font-semibold text-muted hover:underline"
                  onClick={() => setSelected(person.id)}
                >
                  Quick view
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : !network.error ? (
        <EmptyState
          icon={<Users size={24} />}
          title={
            view === "following" && !term ? "Your network starts here" : "No people on this page"
          }
          description={
            view === "following" && !term
              ? "Discover colleagues and follow them to add them to your network."
              : "Try another search or explore more members."
          }
          action={
            <Button
              onClick={() => {
                setTerm("");
                setDebounced("");
                setParams({ view: "discover" });
              }}
            >
              Discover people
            </Button>
          }
        />
      ) : null}
      {network.hasNextPage && (
        <div className="mt-6">
          <Button
            variant="secondary"
            loading={network.isFetchingNextPage}
            onClick={() => network.fetchNextPage()}
          >
            Show more people
          </Button>
        </div>
      )}
      <ProfilePreview
        key={selected ?? "closed"}
        id={selected}
        onClose={() => setSelected(undefined)}
      />
    </AppShell>
  );
}
