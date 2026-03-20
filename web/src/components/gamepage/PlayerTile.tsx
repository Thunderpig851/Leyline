import { useEffect, useRef } from "react";

type PlayerTileProps =
{
  title?: string;
  stream?: MediaStream | null;
  isSelf?: boolean;
};

export default function PlayerTile(
{
  title = "Player",
  stream = null,
  isSelf = false,
}: PlayerTileProps)
{
  const videoRef = useRef<HTMLVideoElement | null>(null);

    
  useEffect(() =>
{
  const video = videoRef.current;
  if (!video) return;

  if (!stream)
  {
    video.srcObject = null;
    return;
  }

  if (video.srcObject !== stream)
  {
    video.srcObject = stream;
  }

  const track = stream.getVideoTracks()[0];

  // console.log(title, {
  //   track: track
  //     ? {
  //         enabled: track.enabled,
  //         muted: track.muted,
  //         readyState: track.readyState,
  //       }
  //     : null,
  // });

  // video.onloadedmetadata = () =>
  // {
  //   console.log(title, "metadata", {
  //     width: video.videoWidth,
  //     height: video.videoHeight,
  //     readyState: video.readyState,
  //   });
  // };

  // video.onplaying = () =>
  // {
  //   console.log(title, "playing", {
  //     width: video.videoWidth,
  //     height: video.videoHeight,
  //     currentTime: video.currentTime,
  //   });
  // };

  const playPromise = video.play();
  playPromise?.catch((err) =>
  {
    if (err?.name !== "AbortError")
    {
      console.error("Failed to play tile stream:", err);
    }
  });
}, [stream, title]);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 ring-1 ring-white/5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-transparent" />

      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className="h-full w-full bg-black/40 object-cover"
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