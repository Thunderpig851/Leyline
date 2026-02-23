// web/src/components/RoomCard.tsx

export type RoomCardData =
{
  id: string;
  title: string;
  hostName?: string;
  visibility?: "public" | "private";
  status?: "open" | "closed";
  playersCount?: number;
  maxPlayers?: number;
  createdAt?: string;
};

type RoomCardProps =
{
  room: RoomCardData;

  // for later
  onOpen?: (roomId: string) => void;
  onJoin?: (roomId: string) => void;
};

export default function RoomCard({ room, onOpen, onJoin }: RoomCardProps)
{
  const {
    id,
    title,
    hostName,
    visibility,
    status = "open",
    playersCount = 0,
    maxPlayers = 4,
  } = room;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
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
          <span className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-[11px] text-slate-200">
            {visibility}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
        <span>
          Players: {playersCount}/{maxPlayers}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onOpen?.(id)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 
                     hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                     hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150"
        >
          View
        </button>

        <button
          type="button"
          onClick={() => onJoin?.(id)}
          className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
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