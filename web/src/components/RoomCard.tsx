import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Crown, Eye, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";
import { socket } from "../lib/socket";
import { useGameSession } from "../context/GameSession";
import { useMediaSession } from "../context/MediaSession";

type RoomSeat =
{
  role: "host" | "player" | "spectator";
  username: string;
  seatNumber?: number;
  commanders?: string[];
};

type RoomCardRejoin =
{
  canRejoin?: boolean;
  role?: "player" | "spectator" | null;
  connectionStatus?: "connected" | "reconnecting" | "away" | null;
};

export type RoomCardData =
{
  id: string;
  title: string;
  description?: string;
  hostName?: string;
  visibility?: "public" | "private";
  status?: "open" | "full";
  playersCount?: number;
  maxPlayers?: number;
  bracket?: string;
  format?: string;
  seats?: RoomSeat[];
  activeGameId?: string | null;
  spectatorCount?: number;
  maxSpectators?: number;
  createdAt?: string;
  rejoin?: RoomCardRejoin;
};

type RoomCardProps =
{
  room: RoomCardData;
  onJoin?: (roomId: string) => void;
};

type CommanderVisual =
{
  colors: string[];
};

const WUBRG_ORDER = ["W", "U", "B", "R", "G"] as const;

const MTG_TEXT_COLORS: Record<string, string> =
{
  W: "#f3e7b3",
  U: "#67b7ff",
  B: "#b78cff",
  R: "#ff7b72",
  G: "#49c47a",
};

const commanderVisualCache = new Map<string, CommanderVisual | null>();
const commanderVisualRequests = new Map<string, Promise<CommanderVisual | null>>();

function getCardColors(card: any): string[]
{
  const rootColors = Array.isArray(card?.colors) ? card.colors : [];

  if (rootColors.length > 0)
  {
    return rootColors;
  }

  const faceColors = Array.isArray(card?.card_faces)
    ? card.card_faces.flatMap((face: any) => Array.isArray(face?.colors) ? face.colors : [])
    : [];

  return Array.from(new Set(faceColors));
}

async function fetchCommanderVisual(name: string): Promise<CommanderVisual | null>
{
  const cached = commanderVisualCache.get(name);
  if (cached !== undefined)
  {
    return cached;
  }

  const existingRequest = commanderVisualRequests.get(name);
  if (existingRequest)
  {
    return existingRequest;
  }

  const request = (async () =>
  {
    try
    {
      const response = await fetch(
        `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
      );

      if (!response.ok)
      {
        commanderVisualCache.set(name, null);
        return null;
      }

      const card = await response.json();
      const visual = {
        colors: getCardColors(card),
      };

      commanderVisualCache.set(name, visual);
      return visual;
    }
    catch
    {
      commanderVisualCache.set(name, null);
      return null;
    }
    finally
    {
      commanderVisualRequests.delete(name);
    }
  })();

  commanderVisualRequests.set(name, request);
  return request;
}

function sortColorsWubrg(colors: string[])
{
  const unique = Array.from(new Set(colors.filter(Boolean)));

  return unique.sort(
    (a, b) =>
      WUBRG_ORDER.indexOf(a as (typeof WUBRG_ORDER)[number]) -
      WUBRG_ORDER.indexOf(b as (typeof WUBRG_ORDER)[number])
  );
}

function buildGradient(colors: string[])
{
  const ordered = sortColorsWubrg(colors);

  if (ordered.length === 0)
  {
    return "";
  }

  if (ordered.length === 1)
  {
    return MTG_TEXT_COLORS[ordered[0]];
  }

  const stops = ordered.map((color, index) =>
  {
    const percent = ordered.length === 1
      ? 0
      : Math.round((index / (ordered.length - 1)) * 100);

    return `${MTG_TEXT_COLORS[color]} ${percent}%`;
  });

  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function buildCommanderTextStyle(colors: string[]): CSSProperties
{
  const ordered = sortColorsWubrg(colors);

  if (ordered.length === 0)
  {
    return {
      color: "#e2e8f0",
    };
  }

  if (ordered.length === 1)
  {
    return {
      color: MTG_TEXT_COLORS[ordered[0]],
    };
  }

  return {
    backgroundImage: buildGradient(ordered),
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };
}

function formatRelativeDate(value?: string)
{
  if (!value) return "recently";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "recently";

  const deltaMs = Date.now() - timestamp;
  const deltaMinutes = Math.max(1, Math.floor(deltaMs / 60000));

  if (deltaMinutes < 60)
  {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24)
  {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function formatLabel(value?: string)
{
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRejoinStatus(value?: RoomCardRejoin["connectionStatus"])
{
  if (value === "reconnecting")
  {
    return "Reconnecting";
  }

  if (value === "away")
  {
    return "Away";
  }

  if (value === "connected")
  {
    return "Connected";
  }

  return "Rejoin";
}

function MetaPill(
  {
    children,
    tone = "default",
  }: {
    children: ReactNode;
    tone?: "default" | "accent" | "danger" | "rejoin";
  }
)
{
  const toneClass =
    tone === "accent"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : tone === "danger"
        ? "border-red-300/20 bg-red-400/10 text-red-200"
        : tone === "rejoin"
          ? "border-amber-300/25 bg-amber-400/12 text-amber-100"
          : "border-white/10 bg-slate-900/80 text-slate-200";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight whitespace-nowrap ${toneClass}`}
    >
      {children}
    </span>
  );
}

export default function RoomCard({ room, onJoin }: RoomCardProps)
{
  const navigate = useNavigate();
  const { setRoom, setViewerMode } = useGameSession();
  const { stopPreview, disconnectFromSFU } = useMediaSession();
  const [commanderVisualMap, setCommanderVisualMap] = useState<Record<string, CommanderVisual | null>>({});
  const [watching, setWatching] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    id,
    title,
    description,
    hostName,
    visibility,
    status,
    playersCount = 0,
    maxPlayers = 4,
    bracket,
    format,
    seats = [],
    activeGameId,
    spectatorCount = 0,
    maxSpectators = 4,
    createdAt,
    rejoin,
  } = room;

  const sortedSeats = useMemo(() =>
    [...seats]
      .filter((seat) => seat.role !== "spectator")
      .sort((a, b) => Number(a.seatNumber ?? 99) - Number(b.seatNumber ?? 99)),
  [seats]);

  const isFull = status === "full";
  const showBracket = format?.toLowerCase() === "commander" && bracket;
  const trimmedDescription = description?.trim();
  const canDirectWatch = Boolean(activeGameId) && visibility !== "private";
  const showWatchButton = canDirectWatch && isFull;
  const spectatorsFull = spectatorCount >= maxSpectators;
  const canRejoin = Boolean(rejoin?.canRejoin && activeGameId);
  const rejoinRole = rejoin?.role === "spectator" ? "spectator" : "player";
  const isRejoinCard = canRejoin;

  useEffect(() =>
  {
    const commanderNames = sortedSeats
      .flatMap((seat) => seat.commanders ?? [])
      .filter(Boolean)
      .filter((name) => !(name in commanderVisualMap));

    if (commanderNames.length === 0)
    {
      return;
    }

    let cancelled = false;

    void Promise.all(
      commanderNames.map(async (name) => [name, await fetchCommanderVisual(name)] as const)
    ).then((entries) =>
    {
      if (cancelled)
      {
        return;
      }

      setCommanderVisualMap((current) =>
      {
        const next = { ...current };

        for (const [name, visual] of entries)
        {
          next[name] = visual;
        }

        return next;
      });
    });

    return () =>
    {
      cancelled = true;
    };
  }, [sortedSeats, commanderVisualMap]);

  function handleJoin()
  {
    if (onJoin)
    {
      onJoin(id);
      return;
    }

    navigate(`/rooms/${id}`);
  }

  async function handleWatch()
  {
    if (!canDirectWatch || spectatorsFull || watching)
    {
      return;
    }

    setWatching(true);
    setActionError(null);

    try
    {
      disconnectFromSFU();
      stopPreview();
      setRoom(id, title);
      setViewerMode("spectator");

      const roomJoinResult = await apiPost<{ ok: boolean }>(`/api/rooms/${id}/join`, {
        role: "spectator",
      });

      if (!roomJoinResult.ok)
      {
        setActionError(roomJoinResult.error || "Failed to join as spectator.");
        return;
      }

      if (socket.connected)
      {
        socket.emit("room:join", { roomId: id });
      }

      navigate(`/rooms/${id}/game`);
    }
    catch (error)
    {
      console.error("Failed to watch room:", error);
      setActionError("Failed to join as spectator.");
    }
    finally
    {
      setWatching(false);
    }
  }

  async function handleRejoin()
  {
    if (!canRejoin || rejoining)
    {
      return;
    }

    setRejoining(true);
    setActionError(null);

    try
    {
      disconnectFromSFU();
      stopPreview();
      setRoom(id, title);
      setViewerMode(rejoinRole);
      navigate(`/rooms/${id}`, {
        state: {
          rejoin: true,
          role: rejoinRole,
        },
      });
    }
    catch (error)
    {
      console.error("Failed to route back to room:", error);
      setActionError("Failed to open the room.");
    }
    finally
    {
      setRejoining(false);
    }
  }

  const articleClass = isRejoinCard
    ? "group relative h-full min-h-[410px] overflow-hidden rounded-[24px] border border-amber-200/35 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.94))] p-4 ring-1 ring-amber-100/15 shadow-[0_0_0_1px_rgba(245,158,11,0.12),0_22px_80px_-34px_rgba(245,158,11,0.34)] backdrop-blur-sm"
    : "group relative h-full min-h-[410px] overflow-hidden rounded-[24px] border border-emerald-200/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.92))] p-4 ring-1 ring-white/8 shadow-[0_20px_70px_-38px_rgba(15,23,42,0.95),0_0_0_1px_rgba(16,185,129,0.12)] backdrop-blur-sm";

  const topGlowClass = isRejoinCard
    ? "pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-200/18 via-transparent to-yellow-100/10"
    : "pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-300/18 via-transparent to-teal-200/10";

  const accentLineClass = isRejoinCard
    ? "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/70 to-transparent"
    : "pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/55 to-transparent";

  return (
    <article className={articleClass}>
      <div className={topGlowClass} />
      <div className={accentLineClass} />

      <div className="relative flex h-full flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-slate-100">
              {title}
            </h2>
          </div>

          <div className="flex items-start gap-2">
            {isRejoinCard ? (
              <button
                type="button"
                onClick={() => { void handleRejoin(); }}
                disabled={rejoining}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-100/60 bg-gradient-to-r from-amber-300/24 via-yellow-200/20 to-amber-300/22 px-3 text-xs font-medium text-amber-50 transition-colors transition-shadow duration-150 hover:border-amber-50 hover:bg-amber-200 hover:text-slate-950 hover:shadow-lg hover:shadow-amber-300/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {rejoining ? "Rejoining..." : "Rejoin"}
              </button>
            ) : (
              <>
                {showWatchButton ? (
                  <button
                    type="button"
                    onClick={() => { void handleWatch(); }}
                    disabled={spectatorsFull || watching}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 text-xs font-medium text-slate-100 transition-colors transition-shadow duration-150 hover:border-emerald-200 hover:bg-emerald-300 hover:text-slate-900 hover:shadow-lg hover:shadow-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {watching ? "Watching..." : spectatorsFull ? "Watch Full" : "Watch"}
                  </button>
                ) : null}

                {!isFull ? (
                  <button
                    type="button"
                    onClick={handleJoin}
                    className="h-8 shrink-0 self-start rounded-lg border border-teal-300/35 bg-teal-500/10 px-3 text-xs font-medium text-slate-100 transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
                  >
                    Join
                  </button>
                ) : null}
              </>
            )}
          </div>

          <div className="col-span-2 flex justify-end overflow-hidden">
            <div className="flex flex-nowrap items-center gap-1.5">
              {format ? (
                <MetaPill>{formatLabel(format)}</MetaPill>
              ) : null}

              {showBracket ? (
                <MetaPill tone={isRejoinCard ? "rejoin" : "accent"}>Bracket {bracket}</MetaPill>
              ) : null}

              {visibility ? (
                <MetaPill>{formatLabel(visibility)}</MetaPill>
              ) : null}

              {status ? (
                <MetaPill tone={isFull && !isRejoinCard ? "danger" : isRejoinCard ? "rejoin" : "accent"}>
                  {formatLabel(status)}
                </MetaPill>
              ) : null}
            </div>
          </div>
        </div>

        {isRejoinCard ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3.5 py-3 text-xs text-amber-50">
            <div className="min-w-0">
              <div className="font-medium text-amber-100">Would you like to rejoin?</div>
            </div>

            <div className="shrink-0 rounded-full border border-amber-200/20 bg-slate-950/35 px-2.5 py-1 text-[11px] font-medium text-amber-100">
              {formatRejoinStatus(rejoin?.connectionStatus)}
            </div>
          </div>
        ) : null}

        <div className="mt-3 min-h-[3rem]">
          {trimmedDescription ? (
            <p className="line-clamp-2 text-sm leading-6 text-slate-300">
              {trimmedDescription}
            </p>
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              No description added yet.
            </p>
          )}
        </div>

        {actionError ? (
          <div className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {actionError}
          </div>
        ) : null}

        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-2">
          {sortedSeats.length > 0 ? (
            sortedSeats.map((seat, index) =>
            {
              const commanderNames = (seat.commanders ?? []).filter(Boolean);
              const isHostSeat = seat.role === "host" || seat.username === hostName;

              return (
                <div
                  key={`${seat.username}-${seat.seatNumber ?? index}`}
                  className={isRejoinCard
                    ? "rounded-2xl border border-amber-200/18 bg-slate-900/78 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "rounded-2xl border border-white/10 bg-slate-900/72 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"}
                >
                  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {isHostSeat ? (
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-200">
                          <Crown className="h-3 w-3" />
                        </span>
                      ) : null}

                      <span className="truncate text-sm font-medium text-slate-100">
                        {seat.username}
                      </span>
                    </div>

                    <div className="min-w-0">
                      {commanderNames.length > 0 ? (
                        <div className="flex justify-end">
                          <span className="block max-w-full truncate rounded-full border border-white/10 bg-slate-950/90 px-2.5 py-1 text-[11px] font-medium shadow-inner">
                            {commanderNames.map((name, commanderIndex) =>
                            {
                              const textStyle = buildCommanderTextStyle(
                                commanderVisualMap[name]?.colors || []
                              );

                              return (
                                <span key={name}>
                                  {commanderIndex > 0 ? (
                                    <span className="px-1 text-slate-500">•</span>
                                  ) : null}

                                  <span style={textStyle}>{name}</span>
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <span className="block max-w-full truncate rounded-full border border-dashed border-white/10 bg-slate-950/40 px-2.5 py-1 text-[11px] text-slate-400">
                            No commander selected
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/55 px-4 py-5 text-sm text-slate-400">
              No players listed yet.
            </div>
          )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
          <div className={isRejoinCard
            ? "rounded-full border border-amber-200/25 bg-amber-300/12 px-2.5 py-1 text-amber-50 shadow-[0_0_24px_-16px_rgba(245,158,11,0.7)]"
            : "rounded-full border border-white/10 bg-slate-900/75 px-2.5 py-1 text-slate-300"}
          >
            {playersCount}/{maxPlayers} players
          </div>

          <div>Listed {formatRelativeDate(createdAt)}</div>
        </div>
      </div>
    </article>
  );
}
