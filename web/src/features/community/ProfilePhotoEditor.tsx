import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { apiFetch } from "@/lib/api";
export function ProfilePhotoEditor({ userId, cover = false }: { userId: string; cover?: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  async function save(image: string) {
    await apiFetch(cover ? "/auth/cover" : "/auth/photo", { method: "PUT", body: { image } });
    await client.invalidateQueries({
      queryKey: [cover ? "profile-cover" : "profile-photo", userId],
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error("Choose a JPEG or PNG under 10 MB.");
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = cover ? 1024 : 512;
      canvas.height = cover ? 320 : 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image processing is unavailable.");
      const ratio = canvas.width / canvas.height;
      const cropWidth = Math.min(bitmap.width, bitmap.height * ratio);
      const cropHeight = cropWidth / ratio;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        bitmap,
        (bitmap.width - cropWidth) / 2,
        (bitmap.height - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      bitmap.close();
      await save(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="mt-4">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        aria-label={cover ? "Choose profile cover" : "Choose profile photo"}
        className="sr-only"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <div className="flex gap-4">
        <button
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex items-center gap-2 text-sm font-semibold text-accent-700"
        >
          <Camera size={16} />
          {busy ? "Saving…" : cover ? "Change cover" : "Add or change photo"}
        </button>
        <button
          disabled={busy}
          className="text-xs text-muted hover:underline"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await save("");
            } catch {
              setError("Unable to remove photo");
            } finally {
              setBusy(false);
            }
          }}
        >
          {cover ? "Remove cover" : "Remove photo"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
