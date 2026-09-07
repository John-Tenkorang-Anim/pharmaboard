import { useState, useRef, useEffect } from "react";
import { PhoneOff, Video, ExternalLink, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Embed the media service; PharmaBoard retains the surrounding workspace. */
export function MeetingRoom({
  url,
  title,
  onLeave,
}: {
  url: string;
  title: string;
  onLeave: () => void;
}) {
  const [joined, setJoined] = useState(false);
  const container = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [frameError, setFrameError] = useState("");
  useEffect(() => {
    const change = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  async function expand() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await container.current?.requestFullscreen();
    } catch {
      setFrameError(
        "Fullscreen is unavailable in this browser. You can open the meeting separately below.",
      );
    }
  }

  let safe = false;
  try {
    const parsed = new URL(url);
    safe = parsed.protocol === "https:" && parsed.hostname === "meet.jit.si" && !parsed.username;
  } catch {
    /* Reject malformed provider URLs. */
  }
  if (!safe) return <p role="alert">This meeting provider is not supported in the workspace.</p>;
  return (
    <section
      ref={container}
      className={`meeting-room flex shrink-0 flex-col overflow-hidden rounded-md bg-[#151C27] text-white ${fullscreen ? "h-screen" : ""}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Video size={17} />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen meeting"}
            onClick={expand}
            className="rounded p-2 hover:bg-white/10"
          >
            {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
          </button>
          <Button variant="danger" size="sm" onClick={onLeave}>
            <PhoneOff size={15} />
            Leave
          </Button>
        </div>
      </div>
      {joined ? (
        <iframe
          title={`${title} video conference`}
          src={`${url}#config.prejoinConfig.enabled=true&config.startWithAudioMuted=true&config.startWithVideoMuted=true`}
          allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
          allowFullScreen
          className={
            fullscreen
              ? "min-h-0 w-full flex-1 border-0"
              : "aspect-video min-h-[300px] max-h-[65dvh] w-full border-0 sm:min-h-[360px]"
          }
        />
      ) : (
        <div className="flex min-h-[280px] flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <span className="mb-4 rounded-2xl bg-white/10 p-4">
            <Video size={32} />
          </span>
          <h3 className="text-xl font-semibold">Ready when you are.</h3>
          <p className="mb-6 mt-3 max-w-md text-sm leading-6 text-slate-300">
            Join with camera and microphone off, then choose your devices. Video, screen sharing,
            meeting chat, hand raising, and participant controls are available inside the meeting.
          </p>
          <Button onClick={() => setJoined(true)}>Enter meeting</Button>
        </div>
      )}
      {frameError && (
        <p role="status" className="px-4 py-2 text-xs text-amber-200">
          {frameError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 text-[11px] leading-5 text-slate-300">
        <p>
          Powered by Jitsi. The host must sign in to Jitsi on the public service. Anyone with the
          room link may join; use the meeting lobby.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          Open meeting separately <ExternalLink size={12} />
        </a>
      </div>
    </section>
  );
}
