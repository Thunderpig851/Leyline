import { useEffect, useMemo, useState } from "react";
import RoomCard, { type RoomCardData } from "./RoomCard";

type GridRoom =
{
  _id: string;
  title: string;
  hostName?: string;
  visible?: "public" | "private";
  status?: "open" | "full";
  playersCount?: number;
  maxPlayers?: number;
  createdAt?: string;
};

type GamesGridProps =
{
  rooms: GridRoom[];
  onJoinRoom?: (roomId: string) => void;
};

const PAGE_SIZE = 9;

export default function GamesGrid({ rooms, onJoinRoom }: GamesGridProps)
{
  const [page, setPage] = useState(1);

  const cards: RoomCardData[] = useMemo(() =>
    rooms.map((r) =>
    ({
      id: r._id,
      title: r.title,
      hostName: r.hostName,
      visibility: r.visible ?? "public",
      status: r.status === "full" ? "full" : (r.status ?? "open"),
      playersCount: r.playersCount ?? 0,
      maxPlayers: r.maxPlayers ?? 4,
      createdAt: r.createdAt,
    })),
  [rooms]);

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));

  useEffect(() =>
  {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageCards = useMemo(() =>
  {
    const start = (page - 1) * PAGE_SIZE;
    return cards.slice(start, start + PAGE_SIZE);
  }, [cards, page]);

  const startNum = cards.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endNum = Math.min(page * PAGE_SIZE, cards.length);

  return (
    <div className="mt-8">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 ring-1 ring-white/5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-400/5 via-teal-400/5 to-cyan-300/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-300">
            Showing <span className="font-semibold text-slate-100">{startNum}</span>
            {" - "}
            <span className="font-semibold text-slate-100">{endNum}</span>
            {" "}of{" "}
            <span className="font-semibold text-slate-100">{cards.length}</span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-xs text-slate-100
                           hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           hover:shadow-lg hover:shadow-teal-400/25
                           disabled:cursor-not-allowed disabled:opacity-50
                           transition-colors transition-shadow duration-150"
              >
                Prev
              </button>

              <div className="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                Page <span className="font-semibold text-slate-100">{page}</span> of{" "}
                <span className="font-semibold text-slate-100">{totalPages}</span>
              </div>

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-xs text-slate-100
                           hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           hover:shadow-lg hover:shadow-teal-400/25
                           disabled:cursor-not-allowed disabled:opacity-50
                           transition-colors transition-shadow duration-150"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageCards.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            onJoin={onJoinRoom}
          />
        ))}
      </div>
    </div>
  );
}