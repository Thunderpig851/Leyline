import { useState, useEffect, useCallback, useMemo } from "react";
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

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "full">("all");
  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "private">("all");
  const [sortBy, setSortBy] = useState<"newest" | "title">("newest");

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

  const filteredRooms = useMemo(() =>
  {
    const q = query.trim().toLowerCase();

    let result = rooms.filter((room) =>
    {
      if (q && !room.title.toLowerCase().includes(q)) return false;
      if (filterStatus !== "all" && room.status !== filterStatus) return false;
      if (filterVisibility !== "all" && room.visible !== filterVisibility) return false;
      return true;
    });

    if (sortBy === "title")
    {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }
    else
    {
      result = [...result].reverse();
    }

    return result;
  }, [rooms, query, filterStatus, filterVisibility, sortBy]);

  const hasFilters =
    query.trim().length > 0 ||
    filterStatus !== "all" ||
    filterVisibility !== "all" ||
    sortBy !== "newest";

  const selectClass =
    "appearance-none rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 pr-10 text-sm text-slate-100 " +
    "shadow-sm shadow-black/20 " +
    "hover:bg-teal-500/15 hover:border-teal-200/40 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/40 focus-visible:border-teal-200/50 " +
    "transition-colors";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Lobby
          </span>
        </h1>

        {/* Filters bar w/ room-card style gradient */}
        <div
          className="relative mt-6 flex items-center flex-nowrap gap-3 overflow-x-auto rounded-2xl border border-white/10
                     bg-slate-200/10 p-3 ring-1 ring-white/5"
        >
          {/* matches RoomCard button gradient: from-emerald -> via-teal -> to-cyan */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-400/10 via-teal-400/10 to-cyan-300/10" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

          <button
            type="button"
            className="relative shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                       hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                       hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
            onClick={() => setOpenCreate(true)}
          >
            Create Game
          </button>

          <button
            type="button"
            className="relative shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-500/20"
          >
            LFG Channel
          </button>

          <div className="relative flex-1 min-w-[220px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm text-slate-100
                        placeholder:text-slate-300/80
                        hover:bg-teal-500/15 hover:border-teal-200/40
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/40 focus-visible:border-teal-200/50
                        transition-colors"
            />
          </div>

          {/* Status dropdown (enhanced) */}
          <div className="relative shrink-0">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className={selectClass}
            >
              <option value="all">All status</option>
              <option value="open">Open</option>
              <option value="full">Full</option>
            </select>

            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-200/70"
              fill="currentColor"
            >
              <path d="M5.4 7.6a1 1 0 0 1 1.4 0L10 10.8l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L5.4 9a1 1 0 0 1 0-1.4Z" />
            </svg>

            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />
          </div>

          {/* Visibility dropdown (enhanced) */}
          <div className="relative shrink-0">
            <select
              value={filterVisibility}
              onChange={(e) => setFilterVisibility(e.target.value as any)}
              className={selectClass}
            >
              <option value="all">All visibility</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>

            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-200/70"
              fill="currentColor"
            >
              <path d="M5.4 7.6a1 1 0 0 1 1.4 0L10 10.8l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L5.4 9a1 1 0 0 1 0-1.4Z" />
            </svg>

            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />
          </div>

          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={selectClass}
            >
              <option value="newest">Newest</option>
              <option value="title">Title</option>
            </select>

            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-200/70"
              fill="currentColor"
            >
              <path d="M5.4 7.6a1 1 0 0 1 1.4 0L10 10.8l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L5.4 9a1 1 0 0 1 0-1.4Z" />
            </svg>

            <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={() =>
              {
                setQuery("");
                setFilterStatus("all");
                setFilterVisibility("all");
                setSortBy("newest");
              }}
              className="relative shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                         hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                         hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
            >
              Clear
            </button>
          )}
        </div>

        {openCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <CreateGamePopUp onClose={() => setOpenCreate(false)} />
          </div>
        )}

        <GamesGrid
          rooms={filteredRooms}
          onJoinRoom={(id) => console.log("join", id)}
        />
      </div>
    </div>
  );
}