// web/src/components/GamesGrid.tsx
import { useEffect, useMemo, useState } from "react";
import RoomCard, { type RoomCardData } from "./RoomCard";

type Room =
{
  _id: string;
  title: string;
  hostName?: string;
  visible?: "public" | "private";
  status?: "open" | "full" | "closed";
  playersCount?: number;
  maxPlayers?: number;
  createdAt?: string;
};

type GamesGridProps =
{
  rooms: Room[];
  onOpenRoom?: (roomId: string) => void;
  onJoinRoom?: (roomId: string) => void;
};

const PAGE_SIZE = 9;

export default function GamesGrid({ rooms, onOpenRoom, onJoinRoom }: GamesGridProps)
{
  const [page, setPage] = useState(1);

  const cards: RoomCardData[] = useMemo(() =>
    rooms.map((r) =>
    ({
      id: r._id,
      title: r.title,
      hostName: r.hostName,
      visibility: r.visible ?? "public",
      status: r.status === "full" ? "closed" : (r.status ?? "open"),
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Games</div>
          <div className="mt-1 text-xs text-slate-400">
            Showing {startNum}-{endNum} of {cards.length}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-white/5
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>

            <div className="text-xs text-slate-300">
              Page <span className="font-semibold text-slate-100">{page}</span> of{" "}
              <span className="font-semibold text-slate-100">{totalPages}</span>
            </div>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 hover:bg-white/5
                         disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pageCards.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            onOpen={onOpenRoom}
            onJoin={onJoinRoom}
          />
        ))}
      </div>
    </div>
  );
}