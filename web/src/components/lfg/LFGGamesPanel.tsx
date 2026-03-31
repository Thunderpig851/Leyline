import LFGGameCard from "./LFGGameCard";

type LFGSeat =
{
  role: "host" | "player" | "spectator";
  username: string;
  seatNumber?: number;
  commanders?: string[];
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

type LFGGamesPanelProps =
{
  games: LFGRoom[];
  loading: boolean;
  error: string | null;
};

export default function LFGGamesPanel({ games, loading, error }: LFGGamesPanelProps)
{
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-200/10 p-3 ring-1 ring-white/5">
      <div className="mb-3 text-sm font-semibold text-slate-100">Active Games</div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-10 text-sm text-slate-300">
          Loading...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-10 text-sm text-red-100">
          {error}
        </div>
      ) : games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/45 px-4 py-10 text-sm text-slate-400">
          No open public games.
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((room) => (
            <LFGGameCard key={room._id} room={room} />
          ))}
        </div>
      )}
    </section>
  );
}