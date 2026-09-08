import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { apiFetch } from "@/lib/api";
export function ProfilePhotoEditor({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  async function save(image: string) {
    await apiFetch("/auth/photo", { method: "PUT", body: { image } });
    await client.invalidateQueries({ queryKey: ["profile-photo", userId] });
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
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image processing is unavailable.");
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        512,
        512,
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
        aria-label="Choose profile photo"
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
          {busy ? "Saving…" : "Add or change photo"}
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
          Remove photo
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        JPEG or PNG · Your photo is cropped to a square and visible to signed-in members.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
