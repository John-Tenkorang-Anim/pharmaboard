import { ProfilePhotoEditor } from "./ProfilePhotoEditor";
import { useCreateConversation } from "@/features/messaging/api";
import { useParams, useNavigate } from "react-router-dom";
import { MapPin, Briefcase, MessageCircle, BadgeCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SkeletonPost } from "@/components/ui/Skeleton";
import { VerificationChip } from "@/components/ui/Badge";
import { useProfile, useSetFollow } from "./api";
import { ProfilePortfolio } from "./ProfilePortfolio";
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
  const conversation = useCreateConversation();
  const navigate = useNavigate();

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
      <Card className="social-card mb-5 overflow-hidden">
        <div className="h-24 bg-slate-50" />
        <div className="px-6 pb-5">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <Avatar
              userId={profile.id}
              name={profile.display_name}
              size="xl"
              verification={profile.verification_state}
            />
            <div className="flex items-center gap-2 pb-1">
              {!is_self && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={conversation.isPending}
                    onClick={() =>
                      conversation.mutate(
                        { participant_ids: [profile.id] },
                        { onSuccess: (c) => navigate(`/messaging/${c.id}`) },
                      )
                    }
                  >
                    <MessageCircle className="size-4" />
                    Message
                  </Button>
                  <Button
                    variant={viewer_follows ? "secondary" : "primary"}
                    size="sm"
                    disabled={setFollow.isPending}
                    onClick={() => setFollow.mutate({ userId: profile.id, on: !viewer_follows })}
                  >
                    {viewer_follows ? "Following" : "+ Follow"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {is_self && <ProfilePhotoEditor userId={profile.id} />}
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

          {profile.institution && <p className="mt-3 text-sm text-muted">{profile.institution}</p>}
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

      <ErrorBanner error={setFollow.error || conversation.error} />
      <ProfilePortfolio key={profile.id} userId={profile.id} isSelf={is_self} />
      <h2 className="mb-3 mt-8 px-1 text-sm font-bold text-muted">Recent activity</h2>

      {posts.length > 0 ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
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
