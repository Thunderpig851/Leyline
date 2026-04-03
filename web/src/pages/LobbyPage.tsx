import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Search, X } from "lucide-react";
import { socket } from "../lib/socket";
import CreateGamePopUp from "../components/CreateGamePopUp";
import GamesGrid from "../components/GamesGrid";
import ActionableErrorPanel from "../components/ActionableErrorPanel";
import { apiGet, apiPost, isAuthErrorMessage, isNetworkErrorMessage } from "../lib/api";

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
  activeGameId?: string | null;
  spectatorCount?: number;
  maxSpectators?: number;
  rejoin?:
  {
    canRejoin?: boolean;
    role?: "player" | "spectator" | null;
    connectionStatus?: "connected" | "reconnecting" | "away" | null;
  };
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

type PrivateRoomLookupResponse =
{
  ok: boolean;
  room?:
  {
    _id: string;
    title: string;
    visibility: "private";
  };
  error?: string;
};

function normalizePrivateCode(value: string)
{
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function ActiveFilterChip(
{
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
})
{
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-2 rounded-full border border-teal-300/25 bg-teal-500/10 px-3 py-1 text-xs text-teal-100 transition-colors hover:border-teal-200/40 hover:bg-teal-400/15"
    >
      <span>{label}</span>
      <X className="h-3 w-3" />
    </button>
  );
}

function JoinCodeModal(
{
  open,
  value,
  loading,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  value: string;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
})
{
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() =>
  {
    if (!open) return;

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() =>
  {
    if (!open) return;

    function handleEscape(event: KeyboardEvent)
    {
      if (event.key === "Escape")
      {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open)
  {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-teal-300/20 bg-slate-950/95 shadow-[0_0_0_1px_rgba(45,212,191,0.1),0_32px_120px_-40px_rgba(16,185,129,0.45)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-teal-400/18 via-cyan-400/10 to-transparent" />
        <div className="pointer-events-none absolute -right-12 top-8 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-2 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.26em] text-teal-100/90">
                <KeyRound className="h-3.5 w-3.5" />
                Private Game
              </div>

              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50">
                Enter Join Code
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                Use the 6-character room code from the host to jump straight into a private game.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-slate-100"
              aria-label="Close join code dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-6">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(event) => onChange(normalizePrivateCode(event.target.value))}
              onKeyDown={(event) =>
              {
                if (event.key === "Enter")
                {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              className="absolute inset-0 z-10 h-full w-full cursor-default opacity-0"
              maxLength={6}
              aria-label="Private room code"
            />

            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="grid w-full grid-cols-6 gap-2 sm:gap-3"
            >
              {Array.from({ length: 6 }).map((_, index) =>
              {
                const char = value[index] || "";
                const isActive = index === Math.min(value.length, 5) && value.length < 6;
                const isFilled = Boolean(char);

                return (
                  <span
                    key={index}
                    className={[
                      "flex aspect-square items-center justify-center rounded-2xl border text-xl font-semibold uppercase transition-all sm:text-2xl",
                      isFilled
                        ? "border-teal-200/55 bg-gradient-to-b from-teal-300/18 to-cyan-300/10 text-slate-50 shadow-[0_0_30px_-14px_rgba(45,212,191,0.55)]"
                        : isActive
                          ? "border-teal-300/50 bg-teal-400/10 text-teal-100 shadow-[0_0_30px_-14px_rgba(45,212,191,0.45)]"
                          : "border-white/10 bg-slate-900/80 text-slate-500",
                    ].join(" ")}
                  >
                    {char || "•"}
                  </span>
                );
              })}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>Letters and numbers only</span>
            <span>{value.length}/6</span>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSubmit}
              disabled={loading || value.length !== 6}
              className="flex-1 rounded-2xl border border-teal-200/45 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20 px-4 py-3 text-sm font-medium text-slate-50 transition-all hover:border-teal-100 hover:bg-teal-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function LobbyPage()
{
  const navigate = useNavigate();

  const [openCreate, setOpenCreate] = useState(false);
  const [openJoinByCode, setOpenJoinByCode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "full">("all");
  const [filterVisibility, setFilterVisibility] = useState<"all" | "public" | "private">("all");
  const [filterFormat, setFilterFormat] = useState<"all" | "commander" | "standard" | "">("all");
  const [filterBracket, setFilterBracket] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [sortBy, setSortBy] = useState<"newest" | "title">("newest");

  const [privateCode, setPrivateCode] = useState("");
  const [privateCodeLoading, setPrivateCodeLoading] = useState(false);
  const [privateCodeError, setPrivateCodeError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () =>
  {
    setLoading(true);
    setError(null);

    const result = await apiGet<RoomsAllResponse>("/api/rooms/all");

    if (!result.ok)
    {
      setError(result.error || "Failed to load rooms.");
      setRooms([]);
      setLoading(false);
      return;
    }

    setRooms(result.data.rooms ?? []);
    setLoading(false);
  }, []);

  useEffect(() =>
  {
    void loadRooms();

    socket.on("connect", loadRooms);
    socket.on("rooms:changed", loadRooms);

    return () =>
    {
      socket.off("connect", loadRooms);
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

    result = [...result].sort((a, b) =>
    {
      const aRejoin = a.rejoin?.canRejoin ? 1 : 0;
      const bRejoin = b.rejoin?.canRejoin ? 1 : 0;

      if (aRejoin !== bRejoin)
      {
        return bRejoin - aRejoin;
      }

      if (sortBy === "title")
      {
        return a.title.localeCompare(b.title);
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [rooms, query, filterStatus, filterVisibility, filterFormat, filterBracket, sortBy]);

  const hasFilters =
    query.trim().length > 0 ||
    filterStatus !== "all" ||
    filterVisibility !== "all" ||
    filterFormat !== "all" ||
    filterBracket !== "all" ||
    sortBy !== "newest";

  const activeFilterChips = [
    query.trim()
      ? {
          key: "query",
          label: `Search: ${query.trim()}`,
          onRemove: () => setQuery(""),
        }
      : null,
    filterStatus !== "all"
      ? {
          key: "status",
          label: `Status: ${filterStatus}`,
          onRemove: () => setFilterStatus("all"),
        }
      : null,
    filterVisibility !== "all"
      ? {
          key: "visibility",
          label: `Visibility: ${filterVisibility}`,
          onRemove: () => setFilterVisibility("all"),
        }
      : null,
    filterFormat !== "all"
      ? {
          key: "format",
          label: `Format: ${filterFormat}`,
          onRemove: () =>
          {
            setFilterFormat("all");
            setFilterBracket("all");
          },
        }
      : null,
    filterFormat === "commander" && filterBracket !== "all"
      ? {
          key: "bracket",
          label: `Bracket: ${filterBracket} or lower`,
          onRemove: () => setFilterBracket("all"),
        }
      : null,
    sortBy !== "newest"
      ? {
          key: "sort",
          label: `Sort: ${sortBy}`,
          onRemove: () => setSortBy("newest"),
        }
      : null,
  ].filter((entry): entry is { key: string; label: string; onRemove: () => void } => Boolean(entry));

  const selectClass =
    "appearance-none rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 pr-10 text-sm text-slate-100 " +
    "shadow-sm shadow-black/20 " +
    "hover:bg-teal-500/15 hover:border-teal-200/40 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/40 focus-visible:border-teal-200/50 " +
    "transition-colors";

  async function handleJoinPrivateRoom()
  {
    const normalizedCode = normalizePrivateCode(privateCode);

    setPrivateCode(normalizedCode);
    setPrivateCodeError(null);

    if (normalizedCode.length !== 6)
    {
      setPrivateCodeError("Enter the full 6-character private code.");
      return;
    }

    setPrivateCodeLoading(true);

    const result = await apiPost<PrivateRoomLookupResponse>("/api/rooms/private/lookup", {
      privateCode: normalizedCode,
    });

    setPrivateCodeLoading(false);

    if (!result.ok || !result.data.room?._id)
    {
      const lookupError = !result.ok ? result.error : undefined;
      setPrivateCodeError(result.ok ? "Private room not found." : lookupError || "Private room not found.");
      return;
    }

    setOpenJoinByCode(false);
    navigate(`/rooms/${result.data.room._id}?code=${encodeURIComponent(normalizedCode)}`);
  }

  return (
    <div className="relative flex min-h-0 flex-1 text-slate-100">
      <div className="relative mx-auto w-full max-w-5xl px-6 py-10">
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
              className="shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
              onClick={() => setOpenCreate(true)}
            >
              Create Game
            </button>

            <button
              type="button"
              onClick={() => navigate("/lfg")}
              className="shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
            >
              LFG Channel
            </button>

            <button
              type="button"
              onClick={() =>
              {
                setPrivateCodeError(null);
                setOpenJoinByCode(true);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
            >
              <KeyRound className="h-4 w-4" />
              Join with Code
            </button>

            <div className="min-w-[240px] flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-100/70" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search rooms"
                  className="w-full rounded-xl border border-teal-300/30 bg-teal-500/10 py-2 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-300/80 transition-colors hover:border-teal-200/40 hover:bg-teal-500/15 focus:outline-none focus-visible:border-teal-200/50 focus-visible:ring-2 focus-visible:ring-teal-300/40"
                />
              </div>
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
                className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
              >
                Filters
              </button>

              {showFilters && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-[320px] rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl ring-1 ring-white/5 backdrop-blur">
                  <div className="grid grid-cols-1 gap-3">
                    <label className="block">
                      <span className="text-xs text-slate-300">Status</span>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as "all" | "open" | "full")}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
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
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
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
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
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
                          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
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
                      className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFilters(false)}
                      className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-100 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-3 flex min-h-[2.5rem] flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            {activeFilterChips.length > 0 ? (
              <>
                {activeFilterChips.map((chip) => (
                  <ActiveFilterChip
                    key={chip.key}
                    label={chip.label}
                    onRemove={chip.onRemove}
                  />
                ))}

                <div className="ml-auto text-xs text-slate-400">
                  {filteredRooms.length} visible game{filteredRooms.length === 1 ? "" : "s"}
                </div>
              </>
            ): null}
          </div>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-300 ring-1 ring-white/5">
            Loading rooms...
          </div>
        ) : error ? (
          <div className="mt-8">
            <ActionableErrorPanel
              message={error}
              actionLabel={isAuthErrorMessage(error) ? "Log in" : isNetworkErrorMessage(error) ? "Retry" : undefined}
              actionHref={isAuthErrorMessage(error) ? "/login" : undefined}
              onAction={isNetworkErrorMessage(error) ? () => { void loadRooms(); } : undefined}
            />
          </div>
        ) : (
          <GamesGrid rooms={filteredRooms} />
        )}
      </div>

      {openCreate && <CreateGamePopUp onClose={() => setOpenCreate(false)} />}

      <JoinCodeModal
        open={openJoinByCode}
        value={privateCode}
        loading={privateCodeLoading}
        error={privateCodeError}
        onChange={setPrivateCode}
        onClose={() =>
        {
          setOpenJoinByCode(false);
          setPrivateCodeError(null);
        }}
        onSubmit={() => { void handleJoinPrivateRoom(); }}
      />
    </div>
  );
}