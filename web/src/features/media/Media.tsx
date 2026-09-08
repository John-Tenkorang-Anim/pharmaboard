import { useEffect, useRef, useState } from "react";
import { ImagePlus, Video, X } from "lucide-react";
import { getToken } from "@/lib/api";
const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/v1";
export const mediaPattern = /\[media:([a-f0-9-]{36})\]/g;
export function mediaIDs(body: string) {
  return [...new Set([...body.matchAll(mediaPattern)].map((m) => m[1]!))];
}
export function withoutMedia(body: string) {
  return body.replace(mediaPattern, "").trim();
}
export function MediaItem({ id, source, kind }: { id: string; source?: string; kind?: string }) {
  const [item, setItem] = useState<{ url: string; type: string }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let url = "";
    const controller = new AbortController();
    setItem(undefined);
    setError(false);
    fetch(`${base}/media/${id}?source=${source ?? ""}&kind=${kind ?? ""}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const blob = await response.blob();
        if (!active) return;
        url = URL.createObjectURL(blob);
        setItem({ url, type: blob.type });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, source, kind]);
  if (error)
    return (
      <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-muted">
        Attachment unavailable. Refresh to try again.
      </p>
    );
  if (!item)
    return (
      <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-muted">
        Loading attachment…
      </p>
    );
  return item.type.startsWith("video/") ? (
    <video
      controls
      playsInline
      preload="metadata"
      src={item.url}
      className="max-h-[65dvh] w-full rounded-lg bg-black"
    />
  ) : (
    <img
      src={item.url}
      alt="Attached image"
      className="max-h-[65dvh] w-full rounded-lg object-contain"
    />
  );
}
export function MediaAttachments({
  body,
  source,
  kind,
}: {
  body: string;
  source: string;
  kind: string;
}) {
  return (
    <div className="space-y-3">
      {mediaIDs(body)
        .slice(0, 4)
        .map((id) => (
          <MediaItem key={id} id={id} source={source} kind={kind} />
        ))}
    </div>
  );
}
export function MediaPicker({
  value,
  onChange,
  onBusy,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Choose a photo or video under 20 MB.");
      let body: Blob = file;
      if (file.type.startsWith("image/")) {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image processing unavailable");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        body = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (v) => (v ? resolve(v) : reject(new Error("Could not prepare image"))),
            "image/jpeg",
            0.85,
          ),
        );
      }
      const response = await fetch(`${base}/media/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": body.type },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Upload failed");
      onChange([...value, result.id]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      onBusy?.(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="mt-4">
      <input
        ref={input}
        type="file"
        className="sr-only"
        aria-label="Attach photo or video"
        accept="image/jpeg,image/png,video/mp4,video/webm"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy || value.length >= 4}
        onClick={() => input.current?.click()}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50"
      >
        <ImagePlus size={18} />
        <Video size={18} />
        {busy ? "Uploading…" : "Photo / video"}
      </button>
      {value.length > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {value.map((id) => (
            <div key={id} className="relative rounded-lg border border-hairline p-2">
              <MediaItem id={id} />
              <button
                type="button"
                disabled={busy}
                aria-label="Remove attachment from draft"
                onClick={() => onChange(value.filter((v) => v !== id))}
                className="absolute right-3 top-3 rounded-full bg-white p-2 shadow"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
