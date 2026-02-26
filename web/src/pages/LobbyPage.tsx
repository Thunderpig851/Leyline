import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import CreateGamePopUp from "../components/CreateGamePopUp";
import GamesGrid from "../components/GamesGrid";

type Room =
{
  _id: string;
  title: string;
  visible: "public" | "private";
  status: "open" | "full";
};

type RoomsAllResponse =
{
  ok: boolean;
  rooms?: Room[];
  error?: string;
};

export default function LobbyPage()
{
  const [openCreate, setOpenCreate] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () =>
  {
    setLoading(true);
    setError(null);

    try
    {
      const res = await fetch("http://localhost:3001/api/rooms/all");
      const data: RoomsAllResponse = await res.json();

      if (!data.ok)
      {
        setError(data.error || "Failed to load rooms.");
        setRooms([]);
        return;
      }

      setRooms(data.rooms ?? []);
    }
    catch (err)
    {
      console.error("Failed to load rooms:", err);
      setError("Failed to load rooms. Please try again.");
      setRooms([]);
    }
    finally
    {
      setLoading(false);
    }
  }, []);

  useEffect(() =>
  {
    loadRooms();

    socket.on("rooms:changed", loadRooms);

    return () =>
    {
      socket.off("rooms:changed", loadRooms);
    };
  }, [loadRooms]);



  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Lobby
          </span>
        </h1>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                       hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                       hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
            onClick={() => setOpenCreate(true)}
          >
            Create Game
          </button>

          <button
            type="button"
            className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-500/20"
          >
            LFG Channel
          </button>
        </div>

        {openCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <CreateGamePopUp onClose={() => setOpenCreate(false)} />
          </div>
        )}

        

        <GamesGrid
          rooms={rooms}
          onOpenRoom={(id) => console.log("open", id)}
          onJoinRoom={(id) => console.log("join", id)}
        />

      </div>
    </div>
  );
}