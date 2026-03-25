import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMediaSession } from "../context/MediaSession";
import { useGameSession } from "../context/GameSession";
import { apiPost, apiGet, getStoredUserId, getStoredUsername } from "../lib/api";
import { socket } from "../lib/socket";
import SidePanel from "../components/gamepage/SidePanel";
import PlayerTile from "../components/gamepage/PlayerTile";

type ParticipantMedia =
{
  peerId: string;
  username?: string | null;
  stream: MediaStream | null;
  isSelf: boolean;
  hasVideo: boolean;
  hasAudio: boolean;
};

type ActiveGameResponse =
{
  ok: boolean;
  game?: {
    _id: string;
    roomId: string;
  };
  error?: string;
};

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [gameId, setGameId] = useState("");
  const [leaving, setLeaving] = useState(false);

  const { session, reset } = useGameSession();
  const mediaSession = useMediaSession();

  const navigate = useNavigate();
  const { roomId = "" } = useParams();

  useEffect(() =>
  {
    if (!roomId)
    {
      navigate("/lobby", { replace: true });
      return;
    }

    if (mediaSession.status !== "connected")
    {
      navigate(`/rooms/${roomId}`, {
        replace: true,
        state: { reason: "refresh-reconnect" },
      });
    }
  }, [roomId, mediaSession.status, navigate]);

  useEffect(() =>
  {
    if (!roomId || mediaSession.status !== "connected") return;

    let cancelled = false;

    async function loadActiveGame()
    {
      try
      {
        const res = await apiGet<ActiveGameResponse>(`/api/live-games/room/${roomId}`);

        if (!res.ok || !res.data?.ok || !res.data?.game?._id) return;
        if (cancelled) return;

        const activeGameId = res.data.game._id;
        setGameId(activeGameId);

        const joinGameResult = await apiPost(`/api/live-games/${activeGameId}/join`, {});
        if (!joinGameResult.ok)
        {
          console.error("Failed to join live game:", joinGameResult.error);
          return;
        }

        if (socket.connected)
        {
          socket.emit("live-game:join", {
            gameId: activeGameId,
            roomId,
            userId: getStoredUserId(),
            username: getStoredUsername(),
          });
        }
      }
      catch (err)
      {
        console.error("Failed to load active game:", err);
      }
    }

    void loadActiveGame();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, mediaSession.status]);

  useEffect(() =>
  {
    if (!gameId || !roomId) return;

    const userId = getStoredUserId();
    const username = getStoredUsername();

    function sendHeartbeat(hidden = document.visibilityState === "hidden")
    {
      if (!socket.connected || !userId) return;

      socket.emit("live-game:heartbeat", {
        gameId,
        roomId,
        userId,
        username,
        hidden,
      });
    }

    function handleSocketReconnect()
    {
      if (!socket.connected || !userId) return;

      socket.emit("live-game:join", {
        gameId,
        roomId,
        userId,
        username,
      });

      sendHeartbeat(false);
    }

    sendHeartbeat(false);

    const intervalId = window.setInterval(() =>
    {
      sendHeartbeat();
    }, 15000);

    function handleVisibilityChange()
    {
      sendHeartbeat(document.visibilityState === "hidden");
    }

    function handlePageHide()
    {
      sendHeartbeat(true);
    }

    socket.on("connect", handleSocketReconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () =>
    {
      socket.off("connect", handleSocketReconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.clearInterval(intervalId);
    };
  }, [gameId, roomId]);

  async function handleLeaveGame()
  {
    if (leaving) return;

    setLeaving(true);

    try
    {
      if (gameId)
      {
        try
        {
          await apiPost(`/api/live-games/${gameId}/leave`, {});
        }
        catch (err)
        {
          console.error("Failed to leave live game:", err);
        }
      }

      if (roomId)
      {
        try
        {
          await apiPost(`/api/rooms/${roomId}/leave`, {});
        }
        catch (err)
        {
          console.error("Failed to leave room:", err);
        }
      }
    }
    finally
    {
      if (socket.connected && gameId && roomId)
      {
        socket.emit("live-game:leave", {
          gameId,
          roomId,
          userId: getStoredUserId(),
        });
      }

      if (typeof mediaSession.disconnectFromSFU === "function")
      {
        mediaSession.disconnectFromSFU();
      }

      if (typeof mediaSession.stopPreview === "function")
      {
        mediaSession.stopPreview();
      }

      reset();
      navigate("/lobby", { replace: true });
    }
  }

  if (mediaSession.status !== "connected")
  {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-4 text-sm text-slate-300 backdrop-blur">
            Reconnecting session...
          </div>
        </div>
      </div>
    );
  }

  const participants = useMemo(() =>
  {
    const byPeerId = new Map<string, ParticipantMedia>();

    if (mediaSession.selfPeerId && mediaSession.localStream)
    {
      byPeerId.set(mediaSession.selfPeerId, {
        peerId: mediaSession.selfPeerId,
        username: "You",
        stream: mediaSession.localStream,
        isSelf: true,
        hasVideo: mediaSession.localStream.getVideoTracks().length > 0,
        hasAudio: mediaSession.localStream.getAudioTracks().length > 0,
      });
    }

    for (const remote of Object.values(mediaSession.remoteMedia))
    {
      if (!remote.peerId) continue;
      if (remote.peerId === mediaSession.selfPeerId) continue;

      byPeerId.set(remote.peerId, {
        peerId: remote.peerId,
        username: remote.username ?? `Unknown (${remote.peerId})`,
        stream: remote.stream,
        isSelf: false,
        hasVideo: !!remote.videoTrack,
        hasAudio: !!remote.audioTrack,
      });
    }

    return Array.from(byPeerId.values());
  }, [mediaSession.selfPeerId, mediaSession.localStream, mediaSession.remoteMedia]);

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
              <button
                type="button"
                onClick={() => { void handleLeaveGame(); }}
                disabled={leaving}
                className="ml-2 text-slate-200 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave Game"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100vh-57px)] w-full overflow-hidden">
        <main className="h-full w-full px-6 py-6">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
              {participants.map((p) => (
                <PlayerTile
                  key={p.peerId}
                  isSelf={p.isSelf}
                  title={p.isSelf ? "You" : (p.username || `Player ${p.peerId.slice(0, 6)}`)}
                  stream={p.stream}
                />
              ))}
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