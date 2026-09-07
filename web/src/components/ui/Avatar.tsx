import clsx from "clsx";
import { Check } from "lucide-react";
import { initials } from "@/lib/format";
import type { VerificationState } from "@/lib/types";

const tones = [
  "bg-[#3A3D42] text-white",
  "bg-[#5B5D63] text-white",
  "bg-[#2463D4] text-white",
  "bg-[#3B5A78] text-white",
  "bg-[#6B5A3F] text-white",
  "bg-hairline text-ink",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return tones[hash % tones.length]!;
}

const sizeClasses = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-[0.8125rem]",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
};

export function Avatar({
  name,
  size = "md",
  verification,
  className,
}: {
  name: string;
  size?: keyof typeof sizeClasses;
  verification?: VerificationState;
  className?: string;
}) {
  return (
    <div className={clsx("relative shrink-0", className)}>
      <div
        className={clsx(
          "flex items-center justify-center rounded-full font-semibold",
          sizeClasses[size],
          toneFor(name || "?"),
        )}
        title={name}
      >
        {initials(name || "?")}
      </div>
      {verification === "verified" && (
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-canvas bg-accent-600 text-white",
            size === "xl" ? "size-6" : size === "lg" ? "size-5" : "size-3.5",
          )}
        >
          <Check className={size === "xl" ? "size-3.5" : "size-2.5"} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}
