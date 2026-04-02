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

function LFGLeylineBackdrop()
{
  return (
    <>
      <style>{`
        @keyframes leylineDriftA {
          0% { transform: translate3d(-6%, 0%, 0) scale(1); opacity: 0.46; }
          50% { transform: translate3d(6%, -4%, 0) scale(1.08); opacity: 0.72; }
          100% { transform: translate3d(11%, 3%, 0) scale(1.03); opacity: 0.54; }
        }

        @keyframes leylineDriftB {
          0% { transform: translate3d(8%, 2%, 0) scale(1.08); opacity: 0.36; }
          50% { transform: translate3d(-4%, -5%, 0) scale(1.01); opacity: 0.58; }
          100% { transform: translate3d(-11%, 5%, 0) scale(1.12); opacity: 0.42; }
        }

        @keyframes leylinePulse {
          0%, 100% { opacity: 0.24; transform: scale(0.98); }
          50% { opacity: 0.4; transform: scale(1.06); }
        }

        @keyframes leylineHueShift {
          0% { filter: hue-rotate(0deg) saturate(1.04) brightness(1); }
          25% { filter: hue-rotate(18deg) saturate(1.15) brightness(1.03); }
          50% { filter: hue-rotate(-14deg) saturate(1.22) brightness(1.05); }
          75% { filter: hue-rotate(28deg) saturate(1.16) brightness(1.02); }
          100% { filter: hue-rotate(0deg) saturate(1.04) brightness(1); }
        }

        @keyframes leylinePathFloat {
          0% { transform: translate3d(-1.5%, 0%, 0) scale(1); opacity: 0.42; }
          50% { transform: translate3d(2%, -1.8%, 0) scale(1.025); opacity: 0.68; }
          100% { transform: translate3d(-1.5%, 1.2%, 0) scale(1); opacity: 0.48; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),transparent_38%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.16),transparent_48%),radial-gradient(circle_at_center,rgba(34,211,238,0.1),transparent_56%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.44)_0%,rgba(2,6,23,0.62)_24%,rgba(2,6,23,0.78)_100%)]" />

        <div
          className="absolute -left-[12%] top-[-4%] h-[58%] w-[72%] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.34)_0%,rgba(34,211,238,0.2)_28%,rgba(16,185,129,0.12)_46%,rgba(0,0,0,0)_74%)] blur-[100px]"
          style={{ animation: "leylineDriftA 22s ease-in-out infinite alternate, leylineHueShift 18s ease-in-out infinite" }}
        />

        <div
          className="absolute right-[-14%] top-[4%] h-[60%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.28)_0%,rgba(45,212,191,0.15)_30%,rgba(59,130,246,0.1)_46%,rgba(0,0,0,0)_74%)] blur-[96px]"
          style={{ animation: "leylineDriftB 28s ease-in-out infinite alternate, leylineHueShift 22s ease-in-out infinite reverse" }}
        />

        <div
          className="absolute -left-[8%] bottom-[-12%] h-[52%] w-[66%] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.24)_0%,rgba(45,212,191,0.14)_32%,rgba(168,85,247,0.1)_48%,rgba(0,0,0,0)_74%)] blur-[104px]"
          style={{ animation: "leylineDriftB 32s ease-in-out infinite alternate-reverse, leylineHueShift 26s ease-in-out infinite" }}
        />

        <div
          className="absolute inset-[3%] opacity-100 mix-blend-screen"
          style={{ animation: "leylinePathFloat 16s ease-in-out infinite, leylineHueShift 16s ease-in-out infinite" }}
        >
          <svg viewBox="0 0 1600 1000" className="h-full w-full">
            <defs>
              <linearGradient id="lfgLeylineStrokeA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(16,185,129,0)" />
                <stop offset="24%" stopColor="rgba(45,212,191,0.52)" />
                <stop offset="50%" stopColor="rgba(125,211,252,0.46)" />
                <stop offset="76%" stopColor="rgba(52,211,153,0.5)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0)" />
              </linearGradient>
              <linearGradient id="lfgLeylineStrokeB" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(34,211,238,0)" />
                <stop offset="28%" stopColor="rgba(34,211,238,0.42)" />
                <stop offset="54%" stopColor="rgba(16,185,129,0.5)" />
                <stop offset="76%" stopColor="rgba(168,85,247,0.34)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </linearGradient>
              <linearGradient id="lfgLeylineStrokeC" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(125,211,252,0)" />
                <stop offset="36%" stopColor="rgba(45,212,191,0.36)" />
                <stop offset="58%" stopColor="rgba(56,189,248,0.42)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0)" />
              </linearGradient>
            </defs>

            <path
              d="M -40 260 C 180 180, 360 360, 560 280 S 980 170, 1180 260 S 1460 380, 1660 250"
              fill="none"
              stroke="url(#lfgLeylineStrokeA)"
              strokeWidth="4.4"
              strokeLinecap="round"
            />
            <path
              d="M -20 620 C 220 540, 420 720, 640 640 S 1040 520, 1260 600 S 1480 720, 1660 640"
              fill="none"
              stroke="url(#lfgLeylineStrokeB)"
              strokeWidth="3.8"
              strokeLinecap="round"
            />
            <path
              d="M 120 930 C 330 760, 500 770, 700 860 S 1060 980, 1440 820"
              fill="none"
              stroke="url(#lfgLeylineStrokeA)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 220 120 C 420 210, 520 150, 760 210 S 1180 320, 1520 160"
              fill="none"
              stroke="url(#lfgLeylineStrokeC)"
              strokeWidth="2.6"
              strokeLinecap="round"
              opacity="0.8"
            />
          </svg>
        </div>

        <div
          className="absolute left-[12%] top-[16%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.3)_0%,rgba(34,211,238,0.18)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 9s ease-in-out infinite, leylineHueShift 16s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[16%] top-[50%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.26)_0%,rgba(16,185,129,0.16)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 12s ease-in-out infinite, leylineHueShift 20s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute left-[40%] bottom-[6%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.22)_0%,rgba(168,85,247,0.14)_38%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 15s ease-in-out infinite, leylineHueShift 24s ease-in-out infinite" }}
        />
      </div>
    </>
  );
}

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

    socket.on("connect", loadGames);
    socket.on("rooms:changed", loadGames);
    socket.on("lfg:games-changed", loadGames);
    socket.on("lfg-chat:new-message", handleIncomingMessage);

    return () =>
    {
      socket.off("connect", loadGames);
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
    <div className="relative isolate min-h-screen overflow-hidden bg-slate-950 text-slate-100 lg:h-screen lg:overflow-hidden">
      <LFGLeylineBackdrop />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-6 lg:h-screen lg:min-h-0">
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