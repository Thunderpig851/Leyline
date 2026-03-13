import { useNavigate } from "react-router-dom";

export type RoomCardData =
{
  id: string;
  title: string;
  hostName?: string;
  visibility?: "public" | "private";
  status?: "open" | "full";
  playersCount?: number;
  maxPlayers?: number;
  createdAt?: string;
};

type RoomCardProps =
{
  room: RoomCardData;
  onJoin?: (roomId: string) => void;
};

export default function RoomCard({ room, onJoin }: RoomCardProps)
{
  const navigate = useNavigate();

  const {
    id,
    title,
    hostName,
    visibility,
    status,
    playersCount = 0,
    maxPlayers = 4,
  } = room;

  function handleJoin()
  {
    navigate(`/rooms/${id}`);
  }

  const isFull = status === "full";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 ring-1 ring-white/5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/5 to-transparent" />
      <div className="pointer-events-none absolute inset-0 opacity-60 bg-gradient-to-br from-emerald-400/5 via-transparent to-cyan-300/5" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">
            {title}
          </div>
          <div className="mt-1 truncate text-xs text-slate-300">
            Host: {hostName || "Unknown"}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className={
              isFull
                ? "rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200"
                : "rounded-full border border-teal-300/30 bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-200"
            }
          >
            {status}
          </span>

          <span className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-200 capitalize">
            {visibility}
          </span>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-between text-xs text-slate-300">
        <span>
          Players: <span className="text-slate-100">{playersCount}</span>/{maxPlayers}
        </span>
      </div>

      <div className="relative mt-4">
        <button
          type="button"
          onClick={handleJoin}
          disabled={isFull}
          className="w-full rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                     px-3 py-2 text-sm font-medium text-slate-100
                     hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                     hover:shadow-lg hover:shadow-teal-400/25
                     disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-slate-100 disabled:hover:bg-transparent
                     transition-colors transition-shadow duration-150"
        >
          {isFull ? "Full" : "Join"}
        </button>
      </div>
    </div>
  );
}