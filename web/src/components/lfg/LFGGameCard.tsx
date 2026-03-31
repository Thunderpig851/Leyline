import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

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

export default function LFGGameCard({ room }: LFGGameCardProps)
{
  const navigate = useNavigate();

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
              <Chip>Host {room.hostName ?? "Unknown"}</Chip>
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
                    <div className="flex items-center">
                      <span className="rounded-full border border-white/10 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                        P{displaySeatNumber}
                      </span>
                    </div>

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
                        commanderNames.map((name) => (
                          <span
                            key={name}
                            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-0.5 text-[11px] text-cyan-100"
                          >
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full border border-dashed border-white/10 bg-slate-950/40 px-2.5 py-0.5 text-[11px] text-slate-400">
                          No commander selected
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end">
                      {isHostSeat ? (
                        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-emerald-200">
                          Host
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