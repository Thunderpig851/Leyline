import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../lib/socket";
import CreateGamePopUp from "../components/CreateGamePopUp";
import GamesGrid from "../components/GamesGrid";

type RoomSeat =
{
  role: "host" | "player" | "spectator";
  username: string;
  seatNumber?: number;
  commanders?: string[];
};

type Room =
{
  _id: string;
  title: string;
  description?: string;
  hostName?: string;
  visibility: "public" | "private";
  status: "open" | "full";
  members: string[];
  seats?: RoomSeat[];
  createdAt: string;
  settings:
  {
    format: string;
    bracket: string;
    maxPlayers: number;
    allowSpectators: boolean;
  };
};

type RoomsAllResponse =
{
  ok: boolean;
  rooms?: Room[];
  error?: string;
};

export default function LobbyPage()
{
  const navigate = useNavigate();

  const [openCreate, setOpenCreate] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "full">("all");
  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "private">("all");
  const [filterFormat, setFilterFormat] = useState<"all" | "commander">("all");
  const [filterBracket, setFilterBracket] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
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
      if (filterVisibility !== "all" && room.visibility !== filterVisibility) return false;

      const roomFormat = room.settings?.format ?? "";
      const roomBracket = room.settings?.bracket ?? "";

      if (filterFormat !== "all" && roomFormat !== filterFormat) return false;

      if (filterFormat === "commander" && filterBracket !== "all")
      {
        const selectedBracket = Number(filterBracket);
        const roomBracketNumber = Number(roomBracket || "0");

        if (roomBracketNumber < 1 || roomBracketNumber > selectedBracket) return false;
      }

      return true;
    });

    if (sortBy === "title")
    {
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
    }
    else
    {
      result = [...result].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return result;
  }, [rooms, query, filterStatus, filterVisibility, filterFormat, filterBracket, sortBy]);

  const hasFilters =
    query.trim().length > 0 ||
    filterStatus !== "all" ||
    filterVisibility !== "all" ||
    filterFormat !== "all" ||
    filterBracket !== "all" ||
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

        <div
          className="relative mt-6 rounded-2xl border border-white/10 bg-slate-200/10 p-3 ring-1 ring-white/5"
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-400/10 via-teal-400/10 to-cyan-300/10" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

          <div className="relative flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                         transition-colors transition-shadow duration-150
                         hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
              onClick={() => setOpenCreate(true)}
            >
              Create Game
            </button>

            <button
              type="button"
              onClick={() => navigate("/lfg")}
              className="shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                         transition-colors transition-shadow duration-150
                         hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
            >
              LFG Channel
            </button>

            <div className="min-w-[240px] flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rooms"
                className="w-full rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm text-slate-100
                           placeholder:text-slate-300/80
                           transition-colors
                           hover:border-teal-200/40 hover:bg-teal-500/15
                           focus:outline-none focus-visible:border-teal-200/50 focus-visible:ring-2 focus-visible:ring-teal-300/40"
              />
            </div>

            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "newest" | "title")}
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

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm
                           transition-colors transition-shadow duration-150
                           hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
              >
                Filters
              </button>

              {showFilters && (
                <div
                  className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[320px] rounded-2xl border border-white/10
                             bg-slate-950/95 p-4 shadow-2xl ring-1 ring-white/5 backdrop-blur"
                >
                  <div className="grid grid-cols-1 gap-3">
                    <label className="block">
                      <span className="text-xs text-slate-300">Status</span>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as "all" | "open" | "full")}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none
                                   focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                      >
                        <option value="all">All status</option>
                        <option value="open">Open</option>
                        <option value="full">Full</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs text-slate-300">Visibility</span>
                      <select
                        value={filterVisibility}
                        onChange={(e) => setFilterVisibility(e.target.value as "all" | "public" | "private")}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none
                                   focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                      >
                        <option value="all">All visibility</option>
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-xs text-slate-300">Format</span>
                      <select
                        value={filterFormat}
                        onChange={(e) => setFilterFormat(e.target.value as "all" | "commander")}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none
                                   focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                      >
                        <option value="all">All formats</option>
                        <option value="commander">Commander</option>
                      </select>
                    </label>

                    {filterFormat === "commander" && (
                      <label className="block">
                        <span className="text-xs text-slate-300">Bracket</span>
                        <select
                          value={filterBracket}
                          onChange={(e) => setFilterBracket(e.target.value as "all" | "1" | "2" | "3" | "4" | "5")}
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none
                                     focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                        >
                          <option value="all">Any bracket</option>
                          <option value="1">1 or lower</option>
                          <option value="2">2 or lower</option>
                          <option value="3">3 or lower</option>
                          <option value="4">4 or lower</option>
                          <option value="5">5 or lower</option>
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                      {
                        setQuery("");
                        setFilterStatus("all");
                        setFilterVisibility("all");
                        setFilterFormat("all");
                        setFilterBracket("all");
                        setSortBy("newest");
                      }}
                      disabled={!hasFilters}
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200
                                 hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-100
                                 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-300 ring-1 ring-white/5">
            Loading rooms...
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-red-300/20 bg-red-500/10 p-6 text-sm text-red-100 ring-1 ring-red-300/10">
            {error}
          </div>
        ) : (
          <GamesGrid rooms={filteredRooms} />
        )}
      </div>

      {openCreate && <CreateGamePopUp onClose={() => setOpenCreate(false)} />}
    </div>
  );
}