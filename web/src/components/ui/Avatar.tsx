import clsx from "clsx";
import { initials } from "@/lib/format";

// A ruled monogram, not a pastel circle. Reads as a stamp/initialed record
// rather than a social-network avatar.
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClasses = {
    sm: "size-7 text-[0.625rem]",
    md: "size-9 text-[0.6875rem]",
    lg: "size-12 text-[0.8125rem]",
  };
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-center border border-ink font-mono font-medium tracking-[0.06em] text-ink",
        sizeClasses[size],
        className,
      )}
      title={name}
    >
      {initials(name || "?")}
    </div>
  );
}
