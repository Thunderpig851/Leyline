import { useState, useEffect } from "react";
import CreateGamePopUp from "../components/CreateGamePopUp";
import GamesGrid from "../components/GamesGrid";

export default function LobbyPage()
{
  const [openCreate, setOpenCreate] = useState(false);
  const [games, setGames] = useState([])

 

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Lobby
          </span>
        </h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm 
                             hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                             hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
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
          <CreateGamePopUp onClose={() => setOpenCreate(false)} />
        </div>
      )}

        <GamesGrid />
      </div>
    </div>
  );
}
