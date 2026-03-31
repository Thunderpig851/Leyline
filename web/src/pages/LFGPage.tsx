import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreateGamePopUp from "../components/CreateGamePopUp";
import LFGChatPanel from "../components/lfg/LFGChatPanel";
import LFGGamesPanel from "../components/lfg/LFGGamesPanel";
import { apiGet } from "../lib/api";
import { socket } from "../lib/socket";

type RawCommander =
{
  name?: string;
};

type RawSeat =
{
  role?: "host" | "player" | "spectator";
  username?: string;
  seatNumber?: number;
  commanders?: Array<string | RawCommander | null | undefined>;
  userID?: { username?: string } | string;
};

type LFGSeat =
{
  role: "host" | "player" | "spectator";
  username: string;
  seatNumber?: number;
  commanders?: string[];
};

type RawLFGRoom =
{
  _id: string;
  title: string;
  description?: string;
  hostName?: string;
  createdAt?: string;
  settings?:
  {
    format?: string;
    bracket?: string;
    maxPlayers?: number;
  };
  seats?: RawSeat[];
  members?: RawSeat[];
};

type LFGRoom =
{
  _id: string;
  title: string;
  description?: string;
  hostName?: string;
  createdAt?: string;
  settings?:
  {
    format?: string;
    bracket?: string;
    maxPlayers?: number;
  };
  seats: LFGSeat[];
};

type LFGChatMessage =
{
  _id: string;
  authorUsername: string;
  body: string;
  createdAt: string;
};

type GamesResponse =
{
  ok: boolean;
  games: RawLFGRoom[];
};

type MessagesResponse =
{
  ok: boolean;
  messages: LFGChatMessage[];
};

export default function LFGPage()
{
  const navigate = useNavigate();

  const [openCreate, setOpenCreate] = useState(false);
  const [games, setGames] = useState<LFGRoom[]>([]);
  const [messages, setMessages] = useState<LFGChatMessage[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const loadGames = useCallback(async () =>
  {
    setGamesLoading(true);
    setGamesError(null);

    const result = await apiGet<GamesResponse>("/api/lfg/games");

    if (!result.ok)
    {
      setGames([]);
      setGamesError(result.error);
      setGamesLoading(false);
      return;
    }

    setGames((result.data.games ?? []).map(normalizeRoom));
    setGamesLoading(false);
  }, []);

  const loadMessages = useCallback(async () =>
  {
    setMessagesLoading(true);
    setMessagesError(null);

    const result = await apiGet<MessagesResponse>("/api/lfg/messages?limit=80");

    if (!result.ok)
    {
      setMessages([]);
      setMessagesError(result.error);
      setMessagesLoading(false);
      return;
    }

    setMessages(result.data.messages ?? []);
    setMessagesLoading(false);
  }, []);

  const appendMessage = useCallback((message: LFGChatMessage) =>
  {
    setMessages((current) =>
    {
      if (current.some((entry) => entry._id === message._id))
      {
        return current;
      }

      return [...current, message].slice(-80);
    });
  }, []);

  useEffect(() =>
  {
    void loadGames();
    void loadMessages();
  }, [loadGames, loadMessages]);

  useEffect(() =>
  {
    function handleIncomingMessage(payload: { message?: LFGChatMessage })
    {
      if (!payload.message) return;
      appendMessage(payload.message);
    }

    socket.on("rooms:changed", loadGames);
    socket.on("lfg:games-changed", loadGames);
    socket.on("lfg-chat:new-message", handleIncomingMessage);

    return () =>
    {
      socket.off("rooms:changed", loadGames);
      socket.off("lfg:games-changed", loadGames);
      socket.off("lfg-chat:new-message", handleIncomingMessage);
    };
  }, [appendMessage, loadGames]);

  const availableSeats = useMemo(() =>
  {
    return games.reduce((total, game) =>
    {
      const seatedPlayers = game.seats.filter((seat) => seat.role !== "spectator").length;
      const maxPlayers = Math.max(1, Number(game.settings?.maxPlayers ?? 4));
      return total + Math.max(0, maxPlayers - seatedPlayers);
    }, 0);
  }, [games]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-6 lg:h-screen lg:min-h-0">
        <h1 className="shrink-0 text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            LFG Channel
          </span>
        </h1>

        <div className="relative mt-6 shrink-0 rounded-2xl border border-white/10 bg-slate-200/10 p-3 ring-1 ring-white/5">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-emerald-400/10 via-teal-400/10 to-cyan-300/10" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

          <div className="relative flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenCreate(true)}
              className="shrink-0 rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
            >
              Create Game
            </button>

            <button
              type="button"
              onClick={() => navigate("/lobby")}
              className="shrink-0 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/5"
            >
              Back to Lobby
            </button>

            <div className="ml-auto rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-right leading-tight">
              <div className="text-sm font-medium text-slate-100">
                {availableSeats} available seats
              </div>
              <div className="text-[11px] text-slate-400">
                {games.length} open games
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <LFGGamesPanel
            games={games}
            loading={gamesLoading}
            error={gamesError}
          />

          <LFGChatPanel
            messages={messages}
            loading={messagesLoading}
            error={messagesError}
            onAppendMessage={appendMessage}
          />
        </div>
      </div>

      {openCreate ? <CreateGamePopUp onClose={() => setOpenCreate(false)} /> : null}
    </div>
  );
}

function normalizeRoom(room: RawLFGRoom): LFGRoom
{
  const rawSeats = Array.isArray(room.seats)
    ? room.seats
    : Array.isArray(room.members)
      ? room.members
      : [];

  const seats = rawSeats.map((seat, index) => normalizeSeat(seat, index, room.hostName));

  return {
    _id: room._id,
    title: room.title,
    description: room.description,
    hostName: room.hostName,
    createdAt: room.createdAt,
    settings: room.settings,
    seats,
  };
}

function normalizeSeat(
  seat: RawSeat,
  index: number,
  hostName?: string
): LFGSeat
{
  const username =
    seat.username ||
    (typeof seat.userID === "object" ? seat.userID?.username : undefined) ||
    (typeof seat.userID === "string" ? seat.userID : undefined) ||
    "Unknown";

  const commanders = Array.isArray(seat.commanders)
    ? seat.commanders
      .map((entry) =>
      {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object" && "name" in entry) return entry.name;
        return undefined;
      })
      .filter((name): name is string => Boolean(name))
    : [];

  const role = seat.role || (hostName && username === hostName ? "host" : "player");

  return {
    role,
    username,
    seatNumber:
      typeof seat.seatNumber === "number" && Number.isFinite(seat.seatNumber)
        ? seat.seatNumber
        : index + 1,
    commanders,
  };
}