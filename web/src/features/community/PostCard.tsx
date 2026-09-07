import { Link } from "react-router-dom";
import clsx from "clsx";
import { Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { formatRelative } from "@/lib/format";
import type { FeedPost } from "@/lib/types";

const YOUTUBE_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/;

/** Pulls the first YouTube video id out of a post body, if there is one. */
export function youTubeId(text: string): string | null {
  const match = text.match(YOUTUBE_PATTERN);
  return match?.[1] ?? null;
}

function LinkifiedBody({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-ink">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-600 underline underline-offset-2 hover:text-accent-700"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function PostCard({
  post,
  onToggleReaction,
}: {
  post: FeedPost;
  onToggleReaction: (postId: string, on: boolean) => void;
}) {
  const videoId = youTubeId(post.body);

  return (
    <article className="card overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4">
        <Link to={`/people/${post.author.id}`}>
          <Avatar
            name={post.author.display_name}
            size="sm"
            verification={post.author.verification_state}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/people/${post.author.id}`}
            className="text-sm font-semibold text-ink hover:underline"
          >
            {post.author.display_name}
          </Link>
          <span className="mx-1.5 text-faint">·</span>
          <span className="text-xs text-faint">{formatRelative(post.created_at)}</span>
          <p className="truncate text-xs capitalize text-muted">
            {[post.author.practice_area, post.author.region_code].filter(Boolean).join(" · ") ||
              post.author.account_kind.replace("_", " ")}
          </p>
        </div>
      </div>

      <div className="px-4 py-3">
        <LinkifiedBody text={post.body} />
      </div>

      {videoId && (
        <div className="border-y border-hairline bg-ink">
          <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="Embedded video"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
              className="absolute inset-0 size-full"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 border-t border-hairline px-4 py-2.5 text-xs">
        <button
          onClick={() => onToggleReaction(post.id, !post.viewer_reacted)}
          className={clsx(
            "flex items-center gap-1.5 font-medium transition-colors",
            post.viewer_reacted ? "text-accent-700" : "text-muted hover:text-ink",
          )}
        >
          <Check className="size-3.5" strokeWidth={2.5} />
          Endorse{post.reaction_count > 0 && ` · ${post.reaction_count}`}
        </button>
        <Link
          to={`/people/${post.author.id}`}
          className="font-medium text-muted transition-colors hover:text-ink"
        >
          Reply
        </Link>
        <button
          onClick={() => navigator.clipboard?.writeText(post.body)}
          className="font-medium text-muted transition-colors hover:text-ink"
        >
          Copy
        </button>
      </div>
    </article>
  );
}
