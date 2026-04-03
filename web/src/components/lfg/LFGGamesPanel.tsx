import ActionableErrorPanel from "../ActionableErrorPanel";
import { isAuthErrorMessage } from "../../lib/api";
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
    <section className="flex min-h-0 h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-200/10 p-3 ring-1 ring-white/5">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-10 text-sm text-slate-300">
            Loading...
          </div>
        ) : error ? (
          <ActionableErrorPanel
            message={isAuthErrorMessage(error) ? "Please log in to continue." : error}
            actionLabel={isAuthErrorMessage(error) ? "Log in" : undefined}
            actionHref={isAuthErrorMessage(error) ? "/login" : undefined}
          />
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
      </div>
    </section>
  );
}
