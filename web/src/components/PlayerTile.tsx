import { useEffect, useRef } from "react";

type PlayerTileProps =
{
  title?: string;
  stream?: MediaStream | null;
};

export default function PlayerTile({
  title = "Player",
  stream = null,
}: PlayerTileProps)
{
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() =>
  {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5">
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent pointer-events-none" />

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover bg-black/40"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black/20">
          <span className="text-xs text-slate-400">No stream</span>
        </div>
      )}

      <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-200 backdrop-blur">
        {title}
      </div>
    </div>
  );
}