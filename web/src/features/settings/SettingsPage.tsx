import { useState } from "react";
import { Check, Palette, Type, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  applyAppearance,
  readAppearance,
  defaultAppearance,
  palettes,
  fonts,
  type Appearance,
} from "@/lib/appearance";

export function SettingsPage() {
  const [appearance, setAppearance] = useState(readAppearance);
  const [status, setStatus] = useState("");
  function update(value: Appearance) {
    setAppearance(value);
    applyAppearance(value);
    try {
      localStorage.setItem("pharmaboard.appearance", JSON.stringify(value));
      setStatus("Saved on this browser.");
    } catch {
      setStatus("Applied for now. Your browser could not save this preference.");
    }
  }
  return (
    <AppShell width="narrow">
      <header className="page-intro mb-8">
        <span className="eyebrow">Make yourself at home</span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Your space. Your style.</h1>
        <p className="mt-3 text-sm text-muted">
          A little more you. Choose the colours and typography you enjoy spending time with.
        </p>
      </header>
      <section className="social-card mb-6 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Palette size={20} className="text-accent-600" /> Colour palette
        </h2>
        <p className="mb-5 mt-2 text-sm text-muted">
          Expressive accents, with calm surfaces for reading.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(palettes).map(([key, p]) => (
            <button
              key={key}
              onClick={() => update({ ...appearance, palette: key as Appearance["palette"] })}
              aria-pressed={appearance.palette === key}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${appearance.palette === key ? "border-accent-600 bg-accent-50" : "border-transparent bg-slate-50 hover:border-slate-200"}`}
            >
              <span className="mb-4 flex gap-2">
                <span className="size-8 rounded-full" style={{ background: `rgb(${p.accent})` }} />
                <span className="size-8 rounded-full bg-rose-300" />
                <span className="size-8 rounded-full bg-amber-200" />
              </span>
              <span className="flex items-center justify-between font-semibold">
                {p.name}
                {appearance.palette === key && <Check size={16} />}
              </span>
              <span className="mt-1 block text-xs text-muted">{p.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="social-card mb-6 p-6">
        <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
          <Type size={20} className="text-accent-600" /> Typography
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(fonts).map(([key, f]) => (
            <button
              key={key}
              onClick={() => update({ ...appearance, font: key as Appearance["font"] })}
              aria-pressed={appearance.font === key}
              style={{ fontFamily: f.family }}
              className={`rounded-xl border-2 p-4 text-left ${appearance.font === key ? "border-accent-600 bg-accent-50" : "border-transparent bg-slate-50"}`}
            >
              <span className="mb-3 block text-3xl">Aa</span>
              <span className="block font-semibold">{f.name}</span>
              <span className="text-xs text-muted">{f.description}</span>
            </button>
          ))}
        </div>
        <label className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm font-medium">
          Text size
          <select
            value={appearance.size}
            onChange={(e) => update({ ...appearance, size: e.target.value as Appearance["size"] })}
            className="rounded-lg border border-hairline bg-white px-4 py-2"
          >
            <option value="standard">Standard</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>
      </section>
      <section className="social-card overflow-hidden">
        <div className="preview-cover h-20" />
        <div className="p-6">
          <span className="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700">
            Live preview
          </span>
          <h2 className="mt-4 text-xl font-semibold">Good ideas start with a conversation.</h2>
          <p className="mt-2 leading-7 text-muted">
            Share what you’re learning, meet someone new and make your next chapter a little
            brighter.
          </p>
          <button
            className="mt-5 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200 px-5 py-2 text-sm font-semibold text-slate-900"
            onClick={() =>
              setStatus("This is a style preview. Your choices already apply across the app.")
            }
          >
            Try the look
          </button>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted">
          {status || "Preferences are saved on this browser, not shared across devices."}
        </p>
        <button
          onClick={() => update(defaultAppearance)}
          className="flex items-center gap-2 text-sm font-medium text-accent-700"
        >
          <RotateCcw size={15} />
          Reset appearance
        </button>
      </div>
    </AppShell>
  );
}
