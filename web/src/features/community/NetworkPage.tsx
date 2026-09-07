import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Users, MapPin, Briefcase } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonList } from "@/components/ui/Skeleton";
import { VerificationChip } from "@/components/ui/Badge";
import { useAuth } from "@/features/auth/AuthContext";
import { useDirectory, useSetFollow } from "./api";

export function NetworkPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(term);
  const setFollow = useSetFollow();

  // Debounce so a directory search doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(term);
      setParams(term ? { q: term } : {}, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [term, setParams]);

  const { data, isLoading, error } = useDirectory(debounced);
  const others = (data?.items ?? []).filter((p) => p.id !== user?.id);

  return (
    <AppShell width="narrow">
      <div className="mb-5">
        <h1 className="text-[1.75rem] font-semibold text-ink">Directory</h1>
        <p className="mt-1 text-sm text-faint">
          Find verified pharmacists and colleagues across the profession.
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name…"
          autoFocus
          className="w-full rounded-md border border-hairline bg-surface py-3 pl-10 pr-4 text-sm transition-colors placeholder:text-faint focus-visible:border-accent-600 focus-visible:outline-none"
        />
      </div>

      <ErrorBanner error={error} />

      {isLoading ? (
        <Card>
          <CardBody>
            <SkeletonList rows={5} />
          </CardBody>
        </Card>
      ) : others.length > 0 ? (
        <div className="list-card">
          {others.map((person) => (
            <div key={person.id} className="list-row flex items-center gap-4 px-4 py-3.5">
              <Link to={`/people/${person.id}`}>
                <Avatar
                  name={person.display_name}
                  size="md"
                  verification={person.verification_state}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/people/${person.id}`}
                  className="text-[0.9375rem] font-bold text-ink hover:text-accent-700 hover:underline"
                >
                  {person.display_name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-faint">
                  <span className="flex items-center gap-1 capitalize">
                    <Briefcase className="size-3" />
                    {person.practice_area || person.account_kind}
                  </span>
                  {person.region_code && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {person.region_code}
                    </span>
                  )}
                </div>
                <div className="mt-1.5">
                  <VerificationChip state={person.verification_state} />
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFollow.mutate({ userId: person.id, on: true })}
              >
                + Follow
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title={debounced ? "No colleagues match that search" : "No other members yet"}
            description={
              debounced
                ? "Try a different name, or check the spelling."
                : "As colleagues join, they'll appear here."
            }
          />
        </Card>
      )}
    </AppShell>
  );
}
