import { useState } from "react";
import { ArrowLeft, Check, Maximize2, Minimize2, Play } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { type Resource, useResourceActions, youtubeId } from "./api";

export function LearningRoom({
  lesson,
  lessons,
  onSelect,
  onBack,
}: {
  lesson: Resource;
  lessons: Resource[];
  onSelect: (v: Resource) => void;
  onBack: () => void;
}) {
  const [focus, setFocus] = useState(false);
  const { save } = useResourceActions();
  const id = youtubeId(lesson.url);
  const directVideo = /^https:\/\/[^\s]+\.(mp4|webm)(\?[^\s]*)?$/i.test(lesson.url);
  return (
    <AppShell focusMode={focus}>
      <div className={`min-h-0 ${focus ? "overflow-y-auto" : ""}`}>
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft size={16} />
            Learning library
          </Button>
          <Button variant="secondary" onClick={() => setFocus(!focus)}>
            {focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{" "}
            {focus ? "Exit focus" : "Focus on learning"}
          </Button>
        </header>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0">
            <div className="overflow-hidden rounded-xl bg-slate-950">
              {lesson.id.startsWith("00000000-") ? (
                <p className="p-12 text-center text-white">
                  This sample lesson needs a recording. Choose another lesson to start watching.
                </p>
              ) : id ? (
                <iframe
                  key={lesson.id}
                  className="aspect-video w-full"
                  src={`https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`}
                  title={lesson.title}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : directVideo ? (
                <video
                  key={lesson.id}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full"
                  src={lesson.url}
                />
              ) : (
                <p className="p-12 text-center leading-7 text-white">
                  This resource does not have an embeddable recording yet. The author can update it
                  with a YouTube video or a direct MP4/WebM recording.
                </p>
              )}
            </div>
            <div className="social-card mt-5 p-6">
              <p className="text-sm text-accent-700">
                {lesson.organization} · {lesson.category}
              </p>
              <h1 className="mt-2 text-2xl font-semibold">{lesson.title}</h1>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted">
                {lesson.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate({ id: lesson.id, saved: true, completed: !lesson.completed })
                  }
                >
                  <Check size={16} />
                  {lesson.completed ? "Mark incomplete" : "Mark complete"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={save.isPending}
                  onClick={() =>
                    save.mutate({
                      id: lesson.id,
                      saved: !lesson.saved,
                      completed: lesson.completed,
                    })
                  }
                >
                  {lesson.saved ? "Remove from my learning" : "Save to my learning"}
                </Button>
              </div>
              <ErrorBanner error={save.error} />
              <p className="mt-3 text-xs text-muted">
                Completion is self-reported. It does not award accredited credits.
              </p>
            </div>
          </section>
          <aside className="social-card overflow-hidden">
            <h2 className="px-5 py-4 font-semibold">More in your learning library</h2>
            {lessons.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                aria-current={item.id === lesson.id ? "true" : undefined}
                className={`flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-slate-50 ${item.id === lesson.id ? "bg-accent-50" : ""}`}
              >
                {item.completed ? (
                  <Check size={17} className="mt-1 shrink-0 text-accent-700" />
                ) : (
                  <Play size={17} className="mt-1 shrink-0 text-muted" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block text-xs text-muted">{item.organization}</span>
                </span>
              </button>
            ))}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
