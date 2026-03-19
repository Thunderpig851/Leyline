import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMediaSession } from "../context/MediaSession";
import { useGameSession } from "../context/GameSession";
import SidePanel from "../components/panels/SidePanel";
import PlayerTile from "../components/PlayerTile";

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const { session, isHydrated } = useGameSession();
  
  const mediaSession = useMediaSession();
  const mediaSessionDebug = useMemo(() => ({
    status: mediaSession.status,
    error: mediaSession.error,
    videoInputs: mediaSession.videoInputs,
    audioInputs: mediaSession.audioInputs,
    camEnabled: mediaSession.camEnabled,
    micEnabled: mediaSession.micEnabled,
    localStream: mediaSession.localStream,
    remoteMedia: mediaSession.remoteMedia,
    selectedVideoId: mediaSession.selectedVideoId,
    selectedAudioId: mediaSession.selectedAudioId,
  }), [mediaSession]);

  useEffect(() =>
  {
    console.log("GameSession:", mediaSessionDebug);
  }, [isHydrated, mediaSessionDebug]);

  const navigate = useNavigate();
  const { id } = useParams();

  const roomId = id || "";

  const { status } = useMediaSession();

  useEffect(() =>
  {
    if (!roomId)
    {
      navigate("/lobby", { replace: true });
      return;
    }

    if (status !== "connected")
    {
      navigate(`/rooms/${roomId}`, {
        replace: true,
        state: { reason: "session-lost" },
      });
    }
  }, [roomId, status, navigate]);

  if (status !== "connected")
  {
    return null;
  }

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight" />
            <div className="mt-0.5 truncate text-xs text-slate-400">
              Room: <span className="text-slate-200">{session.roomTitle || "Placeholder Room"}</span>{" "}
              <span className="text-slate-600">·</span>{" "}
              Turn: <span className="text-slate-200">1</span>
              <button className="ml-2 text-slate-200 transition-colors hover:text-red-500">
                Leave Game
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100vh-57px)] w-full overflow-hidden">
        <main className="h-full w-full px-6 py-6">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
              <PlayerTile title="Player 1" stream={mediaSession.localStream} />
              <PlayerTile title="Player 2" stream={null} />
              <PlayerTile title="Player 3" stream={null} />
              <PlayerTile title="Player 4" stream={null} />
            </div>
          </div>
        </main>

        <SidePanel
          side="left"
          open={leftOpen}
          title="Left Panel"
          description="Placeholder for chat, card log, notifications."
          onToggle={() => setLeftOpen((v) => !v)}
        />

        <SidePanel
          side="right"
          open={rightOpen}
          title="Right Panel"
          description="Placeholder for players list, actions, settings."
          onToggle={() => setRightOpen((v) => !v)}
        />
      </div>
    </div>
  );
}