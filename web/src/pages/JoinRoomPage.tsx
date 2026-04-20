import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, Crown, KeyRound } from "lucide-react";
import { apiGet, apiPost, isAuthErrorMessage, isMissingRoomErrorMessage, isNetworkErrorMessage, isPrivateCodeErrorMessage } from "../lib/api";
import ActionableErrorPanel from "../components/ActionableErrorPanel";

import StatusOkIcon from "../components/icons/StatusOkIcon";
import StatusBadIcon from "../components/icons/StatusBadIcon";
import CamOnIcon from "../components/icons/CamOnIcon";
import CamOffIcon from "../components/icons/CamOffIcon";
import MicOnIcon from "../components/icons/MicOnIcon";
import MicOffIcon from "../components/icons/MicOffIcon";

import { useGameSession } from "../context/GameSession";
import { useMediaSession } from "../context/MediaSession";
import { socket } from "../lib/socket";

type Aspect = "16:9" | "4:3" | "1:1";

type RoomResponse =
{
  ok: boolean;
  room?:
  {
    _id: string;
    title: string;
    description?: string;
    visibility?: "public" | "private";
    hostName?: string;
    isHost?: boolean;
    activeGameId?: string | null;
    spectatorCount?: number;
    maxSpectators?: number;
    settings?:
    {
      format?: string;
      bracket?: string;
      maxPlayers?: number;
      allowSpectators?: boolean;
    };
  };
  error?: string;
};

type ActiveGameSummaryResponse =
{
  ok: boolean;
  game?: {
    _id: string;
    spectators?: Array<{ userId: string }>;
  };
  error?: string;
};

type PrivateCodeResponse =
{
  ok: boolean;
  privateCode?: string;
  error?: string;
};

function deviceLabel(d: MediaDeviceInfo, fallback: string)
{
  const raw = (d.label || "").trim();
  if (raw) return raw;
  return `${fallback} (${d.deviceId.slice(0, 6)}…)`;
}

function normalizePrivateCode(value: string)
{
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export default function JoinRoomPage()
{
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const { session, setRoom, setViewerMode, reset } = useGameSession();

  const {
    videoInputs,
    audioInputs,
    localStream,
    camEnabled,
    micEnabled,
    selectedVideoId,
    selectedAudioId,
    setSelectedVideoId,
    setSelectedAudioId,
    ensurePermissionAndListDevices,
    toggleCam,
    toggleMic,
    stopPreview,
    connectToSFU,
  } = useMediaSession();

  const rejoinState = (location.state as { rejoin?: boolean; role?: "player" | "spectator" } | null) || null;
  const isRejoinIntent = Boolean(rejoinState?.rejoin);

  const [roomTitle, setRoomTitle] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [roomFormat, setRoomFormat] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [hostPrivateCode, setHostPrivateCode] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [maxSpectators, setMaxSpectators] = useState(4);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [joinCode, setJoinCode] = useState(() => normalizePrivateCode(searchParams.get("code") || ""));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const privateCodeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() =>
  {
    if (!roomId) return;
    setRoom(roomId, roomTitle);
  }, [roomId, roomTitle, setRoom]);

  useEffect(() =>
  {
    const searchCode = normalizePrivateCode(searchParams.get("code") || "");

    if (searchCode && searchCode !== joinCode)
    {
      setJoinCode(searchCode);
    }
  }, [searchParams, joinCode]);

  useEffect(() =>
  {
    if (!localVideoRef.current) return;

    localVideoRef.current.srcObject = localStream;

    async function playPreview()
    {
      try
      {
        if (localStream)
        {
          await localVideoRef.current?.play();
        }
      }
      catch (err)
      {
        console.error("Failed to play local preview:", err);
      }
    }

    void playPreview();
  }, [localStream]);

  useEffect(() =>
  {
    if (!roomId)
    {
      setError("Missing room id.");
      return;
    }

    let cancelled = false;

    void (async () =>
    {
      try
      {
        setError(null);

        const roomResult = await apiGet<RoomResponse>(`/api/rooms/${roomId}`);

        if (cancelled) return;

        if (!roomResult.ok || !roomResult.data.room)
        {
          const roomLoadError = !roomResult.ok ? roomResult.error : undefined;
          setError(roomResult.ok ? "Room not found." : roomLoadError || "Room not found.");
          return;
        }

        const room = roomResult.data.room;

        setRoomTitle(room.title || "");
        setRoomVisibility(room.visibility === "private" ? "private" : "public");
        setRoomFormat(room.settings?.format || "");
        setIsHost(Boolean(room.isHost));
        setActiveGameId(room.activeGameId || null);
        setSpectatorCount(Number(room.spectatorCount ?? 0));
        setMaxSpectators(Number(room.maxSpectators ?? 4));

        await ensurePermissionAndListDevices();
      }
      catch (e: any)
      {
        if (cancelled) return;
        setError(e?.message || "Failed to load room.");
      }
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, ensurePermissionAndListDevices]);

  useEffect(() =>
  {
    if (!roomId || !isHost || roomVisibility !== "private")
    {
      setHostPrivateCode(null);
      return;
    }

    let cancelled = false;

    void (async () =>
    {
      const codeResult = await apiGet<PrivateCodeResponse>(`/api/rooms/${roomId}/private-code`);

      if (cancelled) return;

      if (!codeResult.ok)
      {
        setHostPrivateCode(null);
        return;
      }

      setHostPrivateCode(codeResult.data.privateCode || null);
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, isHost, roomVisibility]);

  useEffect(() =>
  {
    if (!roomId) return;

    function joinRoomChannel()
    {
      if (!socket.connected) return;
      socket.emit("room:join", { roomId });
    }

    function leaveRoomChannel()
    {
      if (!socket.connected) return;
      socket.emit("room:leave", { roomId });
    }

    function handleRoomDeleted(payload: { roomId?: string })
    {
      if (payload?.roomId !== roomId) return;

      stopPreview();
      reset();
      navigate("/lobby", { replace: true });
    }

    function handleRoomUpdated(payload: { room?: any })
    {
      const nextRoom = payload?.room;
      if (!nextRoom || String(nextRoom._id || "") !== roomId) return;

      setRoomTitle(nextRoom.title || "");
      setRoomVisibility(nextRoom.visibility === "private" ? "private" : "public");
      setRoomFormat(nextRoom.settings?.format || "");
      setIsHost(String(nextRoom.hostID || "") === String(sessionStorage.getItem("userId") || ""));
    }

    function handleLiveGameUpdated(payload: { game?: any })
    {
      const nextGame = payload?.game;
      if (!nextGame || String(nextGame.roomId || "") !== roomId) return;

      setActiveGameId(String(nextGame._id || "") || null);
      setSpectatorCount(Array.isArray(nextGame.spectators) ? nextGame.spectators.length : 0);
    }

    function handleGameStarted(payload: { roomId?: string; gameId?: string })
    {
      if (payload?.roomId !== roomId) return;
      setActiveGameId(payload?.gameId || null);
    }

    function handleGameEnded(payload: { roomId?: string })
    {
      if (payload?.roomId !== roomId) return;
      setActiveGameId(null);
      setSpectatorCount(0);
    }

    function handleHostTransferred(payload: { roomId?: string; hostUserId?: string })
    {
      if (payload?.roomId !== roomId) return;
      setIsHost(String(payload?.hostUserId || "") === String(sessionStorage.getItem("userId") || ""));
    }

    joinRoomChannel();

    socket.on("connect", joinRoomChannel);
    socket.on("room:deleted", handleRoomDeleted);
    socket.on("room:updated", handleRoomUpdated);
    socket.on("live-game:updated", handleLiveGameUpdated);
    socket.on("game:started", handleGameStarted);
    socket.on("game:ended", handleGameEnded);
    socket.on("game:host-transferred", handleHostTransferred);

    return () =>
    {
      leaveRoomChannel();
      socket.off("connect", joinRoomChannel);
      socket.off("room:deleted", handleRoomDeleted);
      socket.off("room:updated", handleRoomUpdated);
      socket.off("live-game:updated", handleLiveGameUpdated);
      socket.off("game:started", handleGameStarted);
      socket.off("game:ended", handleGameEnded);
      socket.off("game:host-transferred", handleHostTransferred);
    };
  }, [roomId, navigate, reset, stopPreview]);

  useEffect(() =>
  {
    if (!copyMessage) return;

    const timeout = window.setTimeout(() => setCopyMessage(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyMessage]);

  async function copyPrivateCode()
  {
    if (!hostPrivateCode) return;

    try
    {
      await navigator.clipboard.writeText(hostPrivateCode);
      setCopyMessage("Copied");
    }
    catch
    {
      setCopyMessage("Copy failed");
    }
  }

  async function enterRoom(mode: "player" | "spectator")
  {
    if (!roomId) return;

    setLoading(true);
    setErrorMessage(null);

    try
    {
      setRoom(roomId, roomTitle);
      setViewerMode(mode);

      const normalizedCode = normalizePrivateCode(joinCode);
      const roomJoinResult = await apiPost<{ ok: boolean }>(`/api/rooms/${roomId}/join`, {
        privateCode: normalizedCode || undefined,
        role: mode,
      });

      if (!roomJoinResult.ok)
      {
        const joinError = roomJoinResult.error;
        setErrorMessage(joinError || `Failed to join room as ${mode}.`);
        return;
      }

      if (normalizedCode)
      {
        setSearchParams((current) =>
        {
          const next = new URLSearchParams(current);
          next.set("code", normalizedCode);
          return next;
        });
      }

      const resolvedActiveGameId =
        activeGameId ||
        (await (async () =>
        {
          const activeGameResult = await apiGet<ActiveGameSummaryResponse>(`/api/live-games/room/${roomId}`);

          if (!activeGameResult.ok || !activeGameResult.data?.game?._id)
          {
            return null;
          }

          setActiveGameId(activeGameResult.data.game._id);
          setSpectatorCount(activeGameResult.data.game.spectators?.length ?? 0);
          return activeGameResult.data.game._id;
        })());

      if (!resolvedActiveGameId)
      {
        setErrorMessage(mode === "spectator"
          ? "There is no active game to spectate right now."
          : "No active game was found for this room.");
        await apiPost(`/api/rooms/${roomId}/leave`, {});
        return;
      }

      if (socket.connected)
      {
        socket.emit("room:join", { roomId });
      }

      if (mode === "spectator")
      {
        stopPreview();
      }

      await connectToSFU(roomId, { publishLocal: mode === "player" });

      navigate(`/rooms/${roomId}/game`);
    }
    catch (err: any)
    {
      console.error("Failed to join room:", err);
      setErrorMessage(err?.message || "Failed to join room.");
      await apiPost(`/api/rooms/${roomId}/leave`, {});
    }
    finally
    {
      setLoading(false);
    }
  }

  async function joinGame()
  {
    await enterRoom("player");
  }

  async function leaveRoomAndGoBack()
  {
    try
    {
      if (roomId)
      {
        const leaveRoomResult = await apiPost(`/api/rooms/${roomId}/leave`, {});

        if (!leaveRoomResult.ok)
        {
          console.error(
            "Failed to leave room on back:",
            "error" in leaveRoomResult ? leaveRoomResult.error : "Request failed."
          );
        }
      }
    }
    finally
    {
      if (socket.connected && roomId)
      {
        socket.emit("room:leave", { roomId });
      }

      stopPreview();
      reset();
      navigate("/lobby");
    }
  }



  function renderErrorPanel(message: string | null)
  {
    if (!message)
    {
      return null;
    }

    if (isAuthErrorMessage(message))
    {
      return (
        <ActionableErrorPanel
          message="Please log in to continue."
          actionLabel="Log in"
          actionHref="/login"
        />
      );
    }

    if (isPrivateCodeErrorMessage(message))
    {
      return (
        <ActionableErrorPanel
          message="Please log in to continue."
          actionLabel="Enter Code"
          onAction={() => privateCodeInputRef.current?.focus()}
        />
      );
    }

    if (isMissingRoomErrorMessage(message))
    {
      return (
        <ActionableErrorPanel
          message="Please log in to continue."
          actionLabel="Back to Lobby"
          onAction={() => navigate("/lobby")}
        />
      );
    }

    if (isNetworkErrorMessage(message))
    {
      return (
        <ActionableErrorPanel
          message="Please log in to continue."
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      );
    }

    return <ActionableErrorPanel message={message} />;
  }
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className={`bg-clip-text text-transparent ${
            isRejoinIntent
              ? "bg-gradient-to-r from-amber-200 via-yellow-200 to-amber-300"
              : "bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200"
          }`}>
            {isRejoinIntent ? "Rejoin Game" : "Join Game"}
          </span>
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <span className="text-slate-400">Game:</span>
          <span>{roomTitle || "…"}</span>

          <span className="rounded-full border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            {roomVisibility}
          </span>

          {roomFormat ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] ${
              isRejoinIntent
                ? "border border-amber-300/20 bg-amber-500/10 text-amber-100"
                : "border border-teal-300/20 bg-teal-500/10 text-teal-100"
            }`}>
              {roomFormat}
            </span>
          ) : null}

          {activeGameId ? (
            <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-cyan-100">
              {spectatorCount}/{maxSpectators} spectators
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4">
            {renderErrorPanel(error)}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4">
            {renderErrorPanel(errorMessage)}
          </div>
        ) : null}

        {isRejoinIntent ? (
          <div className="mt-4 inline-flex items-center rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-100">
            Would you like to rejoin?
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className={`rounded-2xl p-4 lg:h-[620px] ${
            isRejoinIntent
              ? "border border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_34%),rgba(2,6,23,0.4)]"
              : "border border-white/10 bg-slate-950/40"
          }`}>

            <div className="space-y-4">
              <label className="block">
                <span className="text-xs text-slate-300">Camera</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                >
                  {videoInputs.length === 0 && <option value="">No cameras found</option>}
                  {videoInputs.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {deviceLabel(d, `Camera ${idx + 1}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-slate-300">Microphone</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={selectedAudioId}
                  onChange={(e) => setSelectedAudioId(e.target.value)}
                >
                  {audioInputs.length === 0 && <option value="">No microphones found</option>}
                  {audioInputs.map((d, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {deviceLabel(d, `Microphone ${idx + 1}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-slate-300">Aspect Ratio</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as Aspect)}
                >
                  <option value="16:9">16:9</option>
                  <option value="4:3">4:3</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>

              {roomVisibility === "private" ? (
                <label className="block">
                  <span className="text-xs text-slate-300">Private Room Code</span>
                  <input
                    ref={privateCodeInputRef}
                    type="text"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm tracking-[0.28em] text-slate-100 uppercase outline-none
                               focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                    value={joinCode}
                    onChange={(e) =>
                    {
                      setJoinCode(normalizePrivateCode(e.target.value));
                      setErrorMessage(null);
                    }}
                    placeholder="ABC123"
                    maxLength={6}
                  />
                </label>
              ) : null}

              {isHost && roomVisibility === "private" && hostPrivateCode ? (
                <div className={`overflow-hidden rounded-2xl shadow-[0_18px_50px_-30px_rgba(20,184,166,0.65)] ${
                  isRejoinIntent
                    ? "border border-amber-300/20 bg-amber-500/10 shadow-[0_18px_50px_-30px_rgba(245,158,11,0.5)]"
                    : "border border-teal-300/20 bg-teal-500/10"
                }`}>
                  <div className={`border-b border-white/10 px-4 py-3 ${
                    isRejoinIntent
                      ? "bg-gradient-to-r from-amber-400/14 via-yellow-300/12 to-amber-200/10"
                      : "bg-gradient-to-r from-emerald-400/14 via-teal-400/12 to-cyan-300/10"
                  }`}>
                    <div className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] ${
                      isRejoinIntent ? "text-amber-100/90" : "text-teal-100/90"
                    }`}>
                      <Crown className="h-3.5 w-3.5" />
                      Access Code
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <KeyRound className={`h-3.5 w-3.5 ${isRejoinIntent ? "text-amber-200" : "text-teal-200"}`} />
                      Share this with invited players.
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-center text-2xl font-semibold tracking-[0.45em] text-slate-50 sm:text-[28px]">
                      {hostPrivateCode}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { void copyPrivateCode(); }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Code
                      </button>

                      {copyMessage ? (
                        <div className={`text-xs ${isRejoinIntent ? "text-amber-100" : "text-teal-100"}`}>{copyMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <main className={`rounded-2xl p-4 lg:h-[620px] ${
            isRejoinIntent
              ? "border border-amber-300/15 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.1),transparent_34%),rgba(2,6,23,0.4)]"
              : "border border-white/10 bg-slate-950/40"
          }`}>

            <div className="flex h-full flex-col">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Preview
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      {selectedVideoId ? <StatusOkIcon /> : <StatusBadIcon />}
                      <span>Camera</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {selectedAudioId ? <StatusOkIcon /> : <StatusBadIcon />}
                      <span>Mic</span>
                    </div>

                    <span className="text-slate-500">·</span>
                    <span>Aspect: {aspect}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleCam}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-200
                              hover:bg-white/5 hover:text-slate-100 transition-colors duration-150"
                    aria-label={camEnabled ? "Disable camera" : "Enable camera"}
                    title={camEnabled ? "Disable camera" : "Enable camera"}
                  >
                    {camEnabled ? <CamOnIcon /> : <CamOffIcon />}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMic}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-200
                              hover:bg-white/5 hover:text-slate-100 transition-colors duration-150"
                    aria-label={micEnabled ? "Mute microphone" : "Unmute microphone"}
                    title={micEnabled ? "Mute mic" : "Unmute mic"}
                  >
                    {micEnabled ? <MicOnIcon /> : <MicOffIcon />}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-hidden rounded-xl bg-black/40">
                <div className="flex h-full w-full items-center justify-center">
                  <video
                    className="max-h-full max-w-full rounded-xl bg-black/50 object-contain"
                    ref={localVideoRef}
                    style={{ aspectRatio: aspect }}
                    autoPlay
                    playsInline
                    muted
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                  onClick={() => { void leaveRoomAndGoBack(); }}
                >
                  Back
                </button>

                <button
                  type="button"
                  disabled={loading || !roomId}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRejoinIntent
                      ? "border border-amber-300/60 bg-gradient-to-r from-amber-400/25 via-yellow-300/20 to-amber-300/20 text-slate-100 hover:border-amber-200 hover:bg-amber-300 hover:text-slate-900"
                      : "border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20 text-slate-100 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900"
                  }`}

                  onClick={() => { void joinGame(); }}
                >
                  {loading && session.viewerMode !== "spectator"
                    ? isRejoinIntent ? "Rejoining..." : "Joining..."
                    : isRejoinIntent ? "Rejoin" : "Join Game"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
