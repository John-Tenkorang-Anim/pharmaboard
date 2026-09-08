import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
export function ProfileCover({ userId }: { userId: string }) {
  const { data } = useQuery({
    queryKey: ["profile-cover", userId],
    queryFn: () => apiFetch<{ image: string }>(`/users/${userId}/cover`),
    staleTime: 60000,
  });
  return (
    <div className="h-40 overflow-hidden bg-slate-100 sm:h-56">
      {data?.image?.startsWith("data:image/jpeg;base64,") && (
        <img src={data.image} alt="Profile cover" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
