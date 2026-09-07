import { useParams, Link } from "react-router-dom";
import { MapPin, Briefcase, MessageCircle, BadgeCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { VerificationChip } from "@/components/ui/Badge";
import { useProfile, useSetFollow, useSetReaction } from "./api";
import { PostCard } from "./PostCard";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-ink">{value}</p>
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useProfile(id);
  const setFollow = useSetFollow();
  const setReaction = useSetReaction("everyone");

  if (isLoading) {
    return (
      <AppShell width="narrow">
        <Card className="mb-4 h-48 animate-pulse bg-canvas" />
        <SkeletonPost />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell width="narrow">
        <ErrorBanner error={error ?? new Error("Profile not found")} />
      </AppShell>
    );
  }

  const { profile, stats, viewer_follows, is_self, posts } = data;

  return (
    <AppShell width="narrow">
      <Card className="mb-4 overflow-hidden">
        <div className="h-28 bg-gradient-to-br from-accent-600 via-accent-700 to-accent-700" />
        <div className="px-6 pb-5">
          <div className="-mt-12 flex items-end justify-between">
            <Avatar
              name={profile.display_name}
              size="xl"
              verification={profile.verification_state}
            />
            <div className="flex items-center gap-2 pb-1">
              {!is_self && (
                <>
                  <Link to="/messaging">
                    <Button variant="secondary" size="sm">
                      <MessageCircle className="size-4" />
                      Message
                    </Button>
                  </Link>
                  <Button
                    variant={viewer_follows ? "secondary" : "primary"}
                    size="sm"
                    onClick={() => setFollow.mutate({ userId: profile.id, on: !viewer_follows })}
                  >
                    {viewer_follows ? "Following" : "+ Follow"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <h1 className="mt-3 text-2xl font-bold text-ink">{profile.display_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-faint">
            <span className="flex items-center gap-1.5 capitalize">
              <Briefcase className="size-3.5" />
              {profile.practice_area || profile.account_kind}
            </span>
            {profile.region_code && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {profile.region_code}
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <VerificationChip state={profile.verification_state} />
            {profile.council_reg_no && (
              <span className="flex items-center gap-1.5 text-[0.8125rem] text-faint">
                <BadgeCheck className="size-3.5 text-accent-700" />
                Council reg. {profile.council_reg_no}
              </span>
            )}
          </div>

          <div className="mt-5 flex gap-8 border-t border-hairline pt-4">
            <Stat label="Posts" value={stats.posts} />
            <Stat label="Followers" value={stats.followers} />
            <Stat label="Following" value={stats.following} />
          </div>
        </div>
      </Card>

      <h2 className="mb-3 px-1 text-sm font-bold text-muted">Recent activity</h2>

      {posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onToggleReaction={(postId, on) => setReaction.mutate({ postId, on })}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              title={is_self ? "You haven't posted yet" : "No posts yet"}
              description={
                is_self
                  ? "Share an update from the Home tab and it will appear here."
                  : "This member hasn't shared anything with the community yet."
              }
            />
          </CardBody>
        </Card>
      )}
    </AppShell>
  );
}
