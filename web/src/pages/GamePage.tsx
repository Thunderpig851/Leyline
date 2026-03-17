import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useGameSession } from "../context/GameSession";
import { useMediaSession } from "../context/MediaSession";

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const leftPanelWidth = "clamp(260px, 22vw, 360px)";
  const rightPanelWidth = "clamp(260px, 22vw, 360px)";

  const { session } = useGameSession();
  const { } = useMediaSession();

//   const sessionDebug = useMemo(() => (
//   {
//     roomId: session.roomId,
//     roomTitle: session.roomTitle,
//     playerId: session.playerId,
//     selectedVideoId: session.selectedVideoId,
//     selectedAudioId: session.selectedAudioId,
//     camEnabled: session.camEnabled,
//     micEnabled: session.micEnabled,
//   }), [session]);

// useEffect(() =>
// {
//   console.log("Session debug", sessionDebug);
// }, [sessionDebug]);

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">
              Room: <span className="text-slate-200">Placeholder Room</span>{" "}
              <span className="text-slate-600">·</span>{" "}
              Turn: <span className="text-slate-200">1</span>
              <button className="ml-2 text-slate-200 hover:text-red-500">Leave Game</button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100vh-57px)] w-full overflow-hidden">
        <main className="h-full w-full px-6 py-6">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
              <div className="min-h-0 rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5" />
              <div className="min-h-0 rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5" />
              <div className="min-h-0 rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5" />
              <div className="min-h-0 rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5" />
            </div>
          </div>
        </main>

        <aside
          className="absolute left-0 top-0 z-30 h-full overflow-visible border-r border-white/10 bg-slate-950/90 ring-1 ring-white/5 backdrop-blur transition-transform duration-200"
          style={{
            width: leftPanelWidth,
            transform: leftOpen ? "translateX(0)" : "translateX(calc(-100% + 20px))"
          }}
        >
          <button
            type="button"
            onClick={() => setLeftOpen(v => !v)}
            aria-label={leftOpen ? "Collapse left panel" : "Expand left panel"}
            className="absolute right-2 top-1/2 z-40 -translate-y-1/2 rounded-full border border-teal-300/30 bg-slate-900/90 p-2 text-slate-200 shadow-lg shadow-black/30 backdrop-blur transition-all duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-teal-400/25"
          >
            {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

          <div className="relative p-4 pr-12">
            <div className="text-xs font-semibold text-slate-100">Left Panel</div>
            <div className="mt-2 text-xs text-slate-400">
              Placeholder for chat, card log, notifications.
            </div>
          </div>
        </aside>

        <aside
          className="absolute right-0 top-0 z-30 h-full overflow-visible border-l border-white/10 bg-slate-950/90 ring-1 ring-white/5 backdrop-blur transition-transform duration-200"
          style={{
            width: rightPanelWidth,
            transform: rightOpen ? "translateX(0)" : "translateX(calc(100% - 20px))"
          }}
        >
          <button
            type="button"
            onClick={() => setRightOpen(v => !v)}
            aria-label={rightOpen ? "Collapse right panel" : "Expand right panel"}
            className="absolute left-2 top-1/2 z-40 -translate-y-1/2 rounded-full border border-teal-300/30 bg-slate-900/90 p-2 text-slate-200 shadow-lg shadow-black/30 backdrop-blur transition-all duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-teal-400/25"
          >
            {rightOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

          <div className="relative p-4 pl-12">
            <div className="text-xs font-semibold text-slate-100">Right Panel</div>
            <div className="mt-2 text-xs text-slate-400">
              Placeholder for players list, actions, settings.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}