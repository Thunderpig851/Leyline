import RoomCard from "./RoomCard";

export default function GamesGrid()
{
  return (
    <div>
      <section className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-sm font-medium text-slate-200">Games</h2>

        {/* temp card display */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <RoomCard
              key={i}
              room={{
                id: `room-${i}`,
                title: `Game ${i + 1}`,
                hostName: `Host${i + 1}`,
                visibility: i % 2 === 0 ? "public" : "private",
                status: "open",
                playersCount: Math.floor(Math.random() * 4),
                maxPlayers: 4,
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}