import { useState } from "react";
import { apiPost } from "../lib/api";
import CreateGamePopUp from "../components/CreateGamePopUp";

export default function LobbyPage()
{
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Lobby
          </span>
        </h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-500/20"
                  onClick={() => setOpenCreate(true)}
          >
            Create Game
          </button>

          <button className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-500/20">
            LFG Channel
          </button>
        </div>

      {openCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <CreateGamePopUp openCreate={openCreate} onClose={() => setOpenCreate(false)} />
        </div>
      )}

    <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-sm font-medium text-slate-200">Rooms</h2>

          {/* Placeholder grid, still need to build card component */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200"
              >
                <div className="font-medium">Room {i + 1}</div>
                <div className="mt-1 text-xs text-slate-300">0/4 players</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
