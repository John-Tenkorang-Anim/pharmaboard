import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse bg-paper-sunken", className)} />;
}

/** Placeholder shaped like the real thing: kicker, headline, meta line,
 *  separated by the same hairlines the loaded list uses. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-t border-rule py-5">
          <Skeleton className="h-2 w-20" />
          <Skeleton className="mt-3 h-5 w-2/3" />
          <Skeleton className="mt-2.5 h-2 w-40" />
        </div>
      ))}
    </div>
  );
}
