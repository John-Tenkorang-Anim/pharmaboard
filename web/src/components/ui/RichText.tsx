import { useRef, useState, type ReactNode } from "react";
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|==[^=]+==|\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("==") ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5 text-slate-900">
        {part.slice(2, -2)}
      </mark>
    ) : part.startsWith("*") ? (
      <em key={i}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}
export function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-3 break-words text-sm leading-7">
      {text.split("\n").map((line, i) =>
        line.startsWith("## ") ? (
          <h3 key={i} className="pt-2 text-lg font-semibold">
            {inline(line.slice(3))}
          </h3>
        ) : line.startsWith("# ") ? (
          <h2 key={i} className="pt-3 text-xl font-semibold">
            {inline(line.slice(2))}
          </h2>
        ) : line.startsWith("- ") ? (
          <div key={i} className="flex gap-3 pl-3">
            <span aria-hidden="true">•</span>
            <p>{inline(line.slice(2))}</p>
          </div>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {inline(line) || " "}
          </p>
        ),
      )}
    </div>
  );
}
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  function format(before: string, after = "") {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    const selected = value.slice(start, end) || "text";
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }
  return (
    <div>
      <label htmlFor="notice-body" className="mb-2 block text-sm font-medium">
        Notice body
      </label>
      <div className="overflow-hidden rounded-lg border border-divider bg-white">
        <div
          role="toolbar"
          aria-label="Text formatting"
          className="flex flex-wrap gap-1 bg-slate-50 p-2"
        >
          {[
            { label: "Bold", before: "**", after: "**" },
            { label: "Italic", before: "*", after: "*" },
            { label: "Highlight", before: "==", after: "==" },
            { label: "Heading", before: "\n# ", after: "\n" },
            { label: "Subheading", before: "\n## ", after: "\n" },
            { label: "Bullet list", before: "\n- ", after: "\n" },
          ].map((f) => (
            <button
              key={f.label}
              disabled={preview}
              type="button"
              onClick={() => format(f.before, f.after)}
              className="rounded px-3 py-2 text-xs font-semibold hover:bg-white disabled:opacity-40"
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
            className="ml-auto rounded px-3 py-2 text-xs font-semibold text-accent-700"
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-48 p-4">
            <RichText text={value} />
          </div>
        ) : (
          <textarea
            id="notice-body"
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={10}
            required
            maxLength={20000}
            className="block w-full resize-y p-4 text-sm leading-7 outline-none"
            placeholder="Write your notice…"
          />
        )}
      </div>
    </div>
  );
}
