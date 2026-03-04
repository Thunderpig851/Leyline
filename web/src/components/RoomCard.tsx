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

  return (
    <div className="relative rounded-2xl border border-white/10 bg-slate-200/10 p-4 ring-1 ring-white/5">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/10 via-white/5 to-transparent" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100 truncate">
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-300 truncate">
            Host: {hostName}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="rounded-full border border-teal-300/30 bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-200">
            {status}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/50 px-2 py-0.5 text-[11px] text-slate-200">
            {visibility}
          </span>
        </div>
      </div>

      <div className="relative mt-3 flex items-center justify-between text-xs text-slate-300">
        <span>
          Players: {playersCount}/{maxPlayers}
        </span>
      </div>

      <div className="relative mt-4">
        <button
          type="button"
          onClick={handleJoin}
          className="w-full rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                     px-3 py-2 text-sm font-medium text-slate-100
                     hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                     hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
        >
          Join
        </button>
      </div>
    </div>
  );
}