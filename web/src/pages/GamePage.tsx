import { useEffect, useMemo, useState } from "react";
import { useGameSession } from "../context/GameSession";
import SidePanel from "../components/panels/SidePanel";

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const { session, isHydrated } = useGameSession();

  // const sessionDebug = useMemo(() => ({
  //   roomId: session.roomId,
  //   roomTitle: session.roomTitle ?? null,
  //   playerId: session.playerId || null,
  //   selectedVideoId: session.selectedVideoId,
  //   selectedAudioId: session.selectedAudioId,
  //   camEnabled: session.camEnabled,
  //   micEnabled: session.micEnabled,
  //   isHydrated,
  // }), [session, isHydrated]);

  // useEffect(() =>
  // {
  //   if (!isHydrated) return;
  //   else 
  //   console.log("GameSession:", sessionDebug);
  // }, [isHydrated, sessionDebug]);

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight" />
            <div className="mt-0.5 truncate text-xs text-slate-400">
              Room: <span className="text-slate-200">{session.roomTitle || "Placeholder Room"}</span>{" "}
              <span className="text-slate-600">·</span>{" "}
              Turn: <span className="text-slate-200">1</span>
              <button className="ml-2 text-slate-200 transition-colors hover:text-red-500">
                Leave Game
              </button>
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

        <SidePanel
          side="left"
          open={leftOpen}
          title="Left Panel"
          description="Placeholder for chat, card log, notifications."
          onToggle={() => setLeftOpen((v) => !v)}
        />

        <SidePanel
          side="right"
          open={rightOpen}
          title="Right Panel"
          description="Placeholder for players list, actions, settings."
          onToggle={() => setRightOpen((v) => !v)}
        />
      </div>
    </div>
  );
}