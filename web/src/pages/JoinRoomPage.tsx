import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiPost } from "../lib/api";

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
  room?: { _id: string; title: string };
  error?: string;
};

function deviceLabel(d: MediaDeviceInfo, fallback: string)
{
  const raw = (d.label || "").trim();
  if (raw) return raw;
  return `${fallback} (${d.deviceId.slice(0, 6)}…)`;
}

export default function JoinRoomPage()
{
  const navigate = useNavigate();
  const { roomId = "" } = useParams();

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
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [joinCode, setJoinCode] = useState("");
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
    async function attach()
    {
      if (!localVideoRef.current) return;

      localVideoRef.current.srcObject = localStream;

      try
      {
        if (localStream)
        {
          await localVideoRef.current.play();
        }
      }
      catch (err)
      {
        console.error("Failed to play local preview:", err);
      }
    }

    void attach();
  }, [localStream]);

  useEffect(() =>
  {
    if (!roomId)
    {
      setError("Missing room id.");
      return;
    }

    let cancelled = false;

    (async () =>
    {
      try
      {
        setError(null);

        const res = await fetch(`http://localhost:3001/api/rooms/${roomId}`, { credentials: "include" });
        const data: RoomResponse = await res.json();

        if (cancelled) return;

        if (!data.ok || !data.room)
        {
          setError(data.error || "Room not found.");
          return;
        }

        setRoomTitle(data.room.title);
        await ensurePermissionAndListDevices();
      }
      catch (e: any)
      {
        if (cancelled) return;
        setError(e?.message || "Failed to load room.");
      }
    })();

    return () => { cancelled = true; };
  }, [roomId, ensurePermissionAndListDevices]);


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

  async function joinGame()
  {
    if (!roomId) return;

    setLoading(true);
    setErrorMessage(null);

    try
    {
      setRoom(roomId, roomTitle);

      const res = await apiPost(`/api/rooms/${roomId}/join`, {});

      if (!res.ok)
      {
        setErrorMessage(res.error || "Failed to join room.");
        return;
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
        await apiPost(`/api/rooms/${roomId}/leave`, {});
      }
    }
    catch (err)
    {
      console.error("Failed to leave room on back:", err);
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

        <div className="mt-2 text-sm text-slate-300">
          <span className="text-slate-400">Room:</span> {roomTitle || "…"}{" "}
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

              <label className="block">
                <span className="text-xs text-slate-300">Join Code</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="For private rooms"
                />
              </label>
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

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={toggleCam}
                    className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-slate-200
                              hover:bg-white/5 hover:text-slate-100 transition-colors duration-150"
                    aria-label={camEnabled ? "Turn off camera" : "Turn on camera"}
                    title={camEnabled ? "Turn off camera" : "Turn on camera"}
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