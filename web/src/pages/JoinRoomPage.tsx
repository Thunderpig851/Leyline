import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Copy, Crown, KeyRound } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";

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
  const { roomId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const { setRoom, reset } = useGameSession();

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

  const [roomTitle, setRoomTitle] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [roomFormat, setRoomFormat] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [hostPrivateCode, setHostPrivateCode] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [joinCode, setJoinCode] = useState(() => normalizePrivateCode(searchParams.get("code") || ""));
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);

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

    function handleRoomDeleted(payload: { roomId?: string })
    {
      if (payload?.roomId !== roomId) return;

      stopPreview();
      reset();
      navigate("/lobby", { replace: true });
    }

    socket.on("room:deleted", handleRoomDeleted);

    return () =>
    {
      socket.off("room:deleted", handleRoomDeleted);
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

  async function joinGame()
  {
    if (!roomId) return;

    setLoading(true);
    setErrorMessage(null);

    try
    {
      setRoom(roomId, roomTitle);

      const normalizedCode = normalizePrivateCode(joinCode);
      const res = await apiPost<{ ok: boolean }>(`/api/rooms/${roomId}/join`, {
        privateCode: normalizedCode || undefined,
      });

      if (!res.ok)
      {
        const joinError = res.error;
        setErrorMessage(joinError || "Failed to join room.");
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

      if (socket.connected)
      {
        socket.emit("room:join", { roomId });
      }

      await connectToSFU(roomId);

      navigate(`/rooms/${roomId}/game`);
    }
    catch (err: any)
    {
      console.error("Failed to join room:", err);
      setErrorMessage(err?.message || "Failed to join room.");
    }
    finally
    {
      setLoading(false);
    }
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Join Room
          </span>
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <span className="text-slate-400">Room:</span>
          <span>{roomTitle || "…"}</span>

          <span className="rounded-full border border-white/10 bg-slate-900/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            {roomVisibility}
          </span>

          {roomFormat ? (
            <span className="rounded-full border border-teal-300/20 bg-teal-500/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-teal-100">
              {roomFormat}
            </span>
          ) : null}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 lg:h-[620px]">
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
                <div className="overflow-hidden rounded-2xl border border-teal-300/20 bg-teal-500/10 shadow-[0_18px_50px_-30px_rgba(20,184,166,0.65)]">
                  <div className="border-b border-white/10 bg-gradient-to-r from-emerald-400/14 via-teal-400/12 to-cyan-300/10 px-4 py-3">
                    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-teal-100/90">
                      <Crown className="h-3.5 w-3.5" />
                      Access Code
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <KeyRound className="h-3.5 w-3.5 text-teal-200" />
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
                        <div className="text-xs text-teal-100">{copyMessage}</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>

          <main className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 lg:h-[620px]">
            <div className="flex h-full flex-col">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">Preview</div>
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
                  className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                             px-4 py-2 text-sm font-medium text-slate-100 hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => { void joinGame(); }}
                >
                  {loading ? "Joining..." : "Join Room"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
