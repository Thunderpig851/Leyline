import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Crown } from "lucide-react"

type LFGSeat =
{
  role: "host" | "player" | "spectator";
  username: string;
  seatNumber?: number;
  commanders?: string[];
};

type LFGGameCardProps =
{
  room:
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
    seats?: LFGSeat[];
  };
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

export default function LFGGameCard({ room }: LFGGameCardProps)
{
  const navigate = useNavigate();
  const [commanderVisualMap, setCommanderVisualMap] = useState<Record<string, CommanderVisual | null>>({});

  const seats = Array.isArray(room.seats)
    ? room.seats
      .filter((seat) => seat.role !== "spectator")
      .sort((a, b) => (a.seatNumber ?? 99) - (b.seatNumber ?? 99))
    : [];

  const playersCount = seats.length;
  const maxPlayers = room.settings?.maxPlayers ?? 4;
  const openSeats = Math.max(0, maxPlayers - playersCount);
  const format = room.settings?.format ?? "commander";
  const bracket = room.settings?.bracket;
  const isNearlyFull = openSeats === 1;
  const description = room.description?.trim();

  useEffect(() =>
  {
    const commanderNames = seats
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
  }, [seats, commanderVisualMap]);

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-4 ring-1 ring-white/5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-400/12 via-transparent to-cyan-300/10" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200/35 to-transparent" />

      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 text-lg font-semibold tracking-tight text-slate-100">
                {room.title}
              </h2>

              {isNearlyFull ? <GlowChip>1 seat left</GlowChip> : null}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>{format}</Chip>
              {bracket && format.toLowerCase() === "commander" ? (
                <Chip>Bracket {bracket}</Chip>
              ) : null}
              <Chip>{playersCount}/{maxPlayers}</Chip>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/rooms/${room._id}`)}
            className="shrink-0 rounded-xl border border-teal-300/35 bg-teal-500/10 px-4 py-2 text-sm text-slate-100 transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25"
          >
            Join
          </button>
        </div>

        {description ? (
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {description}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          {seats.length > 0 ? (
            seats.map((seat, index) =>
            {
              const isHostSeat = seat.role === "host" || seat.username === room.hostName;
              const commanderNames = (seat.commanders ?? []).filter(Boolean);
              const displaySeatNumber =
                typeof seat.seatNumber === "number" && Number.isFinite(seat.seatNumber)
                  ? seat.seatNumber
                  : index + 1;

              return (
                <div
                  key={`${seat.username}-${displaySeatNumber}`}
                  className="rounded-2xl border border-white/10 bg-slate-900/65 px-3 py-2.5"
                >
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">

                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={
                          isHostSeat
                            ? "truncate text-sm font-medium text-emerald-100"
                            : "truncate text-sm font-medium text-slate-100"
                        }
                      >
                        {seat.username}
                      </span>

                      {commanderNames.length > 0 ? (
                        commanderNames.map((name) =>
                        {
                          const textStyle = buildCommanderTextStyle(
                            commanderVisualMap[name]?.colors || []
                          );

                          return (
                            <span
                              key={name}
                              className="rounded-full border border-white/10 bg-slate-950/90 px-2.5 py-0.5 text-[11px] font-medium shadow-inner"
                              style={textStyle}
                            >
                              {name}
                            </span>
                          );
                        })
                      ) : (
                        <span className="rounded-full border border-dashed border-white/10 bg-slate-950/40 px-2.5 py-0.5 text-[11px] text-slate-400">
                          No commander selected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end">
                      {isHostSeat ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-emerald-200">
                          <Crown className="h-3 w-3" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="h-5 w-5" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/55 px-4 py-6 text-sm text-slate-400">
              No players listed yet.
            </div>
          )}

          {openSeats > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {Array.from({ length: openSeats }).map((_, index) => (
                <span
                  key={`open-${index}`}
                  className="rounded-full border border-dashed border-teal-300/20 bg-teal-500/5 px-3 py-1 text-xs text-slate-400"
                >
                  Open Seat
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3 text-xs text-slate-400">
          <div>Listed {formatRelativeDate(room.createdAt)}</div>
        </div>
      </div>
    </article>
  );
}

function Chip({ children }: { children: ReactNode })
{
  return (
    <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs capitalize text-slate-200">
      {children}
    </span>
  );
}

function GlowChip({ children }: { children: ReactNode })
{
  return (
    <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.15em] text-emerald-200">
      {children}
    </span>
  );
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