import { platform } from "@/lib/platform";
export function PlatformBrand({ large = false }: { large?: boolean }) {
  return (
    <div className="min-w-0">
      {platform.logo && (
        <img
          src={platform.logo}
          alt={platform.logoAlt}
          width={897}
          height={356}
          className={`h-auto max-w-full object-contain ${large ? "w-72 rounded-lg bg-white p-3" : "w-48"}`}
        />
      )}
      <p
        className={`${platform.logo ? "mt-1" : ""} ${large ? "text-lg" : "text-xs"} font-semibold tracking-tight`}
      >
        {platform.name}
      </p>
    </div>
  );
}
