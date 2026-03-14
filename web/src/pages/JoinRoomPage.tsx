import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sfuHandshake } from "../lib/sfuHandshake";
import { apiPost } from "../lib/api";

import StatusOkIcon from "../components/icons/StatusOkIcon";
import StatusBadIcon from "../components/icons/StatusBadIcon";
import CamOnIcon from "../components/icons/CamOnIcon";
import CamOffIcon from "../components/icons/CamOffIcon";
import MicOnIcon from "../components/icons/MicOnIcon";
import MicOffIcon from "../components/icons/MicOffIcon";



type Aspect = "16:9" | "4:3" | "1:1";

type RoomResponse =
{
  ok: boolean;
  room?: { _id: string; title: string };
  error?: string;
};

function isDefaultDevice(d: MediaDeviceInfo)
{
  const label = (d.label || "").trim().toLowerCase();
  return d.deviceId === "default" || label.startsWith("default");
}

function baseLabel(label: string)
{
  return label.replace(/^default\s*[-–—]\s*/i, "").trim().toLowerCase();
}

function deviceLabel(d: MediaDeviceInfo, fallback: string)
{
  const raw = (d.label || "").trim();
  if (raw) return raw;
  return `${fallback} (${d.deviceId.slice(0, 6)}…)`;
}

export default function JoinRoomPage()
{
  const navigate = useNavigate();
  const { id } = useParams();
  const roomId = id || "";

  const [roomTitle, setRoomTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [aspect, setAspect] = useState<Aspect>("16:9");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopPreview = useCallback(() =>
  {
    if (localStreamRef.current)
    {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current)
    {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const refreshDevices = useCallback(async () =>
  {
    const devices = await navigator.mediaDevices.enumerateDevices();

    function sortDefaultFirst(a: MediaDeviceInfo, b: MediaDeviceInfo)
    {
      const ad = isDefaultDevice(a);
      const bd = isDefaultDevice(b);
      if (ad !== bd) return ad ? -1 : 1;
      return (a.label || "").localeCompare(b.label || "");
    }

    function dedupeDefaultPairs(list: MediaDeviceInfo[])
    {
      const chosen = new Map<string, MediaDeviceInfo>();

      for (const d of list.slice().sort(sortDefaultFirst))
      {
        const key =
          (d.groupId && d.groupId.trim()) ||
          baseLabel(d.label || "");

        if (!chosen.has(key))
        {
          chosen.set(key, d);
          continue;
        }

        const existing = chosen.get(key)!;
        if (!isDefaultDevice(existing) && isDefaultDevice(d))
        {
          chosen.set(key, d);
        }
      }

      return Array.from(chosen.values()).sort(sortDefaultFirst);
    }

    const vidsRaw = devices.filter(d => d.kind === "videoinput");
    const micsRaw = devices.filter(d => d.kind === "audioinput");

    const vids = dedupeDefaultPairs(vidsRaw);
    const mics = dedupeDefaultPairs(micsRaw);

    setVideoInputs(vids);
    setAudioInputs(mics);

    const defaultVid = vids.find(isDefaultDevice);
    const defaultMic = mics.find(isDefaultDevice);

    if (!selectedVideoId || !vids.some(v => v.deviceId === selectedVideoId))
    {
      setSelectedVideoId(defaultVid?.deviceId || vids[0]?.deviceId || "");
    }

    if (!selectedAudioId || !mics.some(m => m.deviceId === selectedAudioId))
    {
      setSelectedAudioId(defaultMic?.deviceId || mics[0]?.deviceId || "");
    }
  }, [selectedAudioId, selectedVideoId]);

  async function ensurePermissionAndListDevices()
  {
    try
    {
      const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      temp.getTracks().forEach(t => t.stop());
    }
    catch
    {
      // labels may stay blank if permission is denied
    }

    await refreshDevices();
  }

  async function startPreview()
  {
    try
    {
      stopPreview();

      const videoConstraint =
        selectedVideoId
          ? { deviceId: { exact: selectedVideoId } }
          : true;

      const audioConstraint =
        selectedAudioId
          ? { deviceId: { exact: selectedAudioId } }
          : true;

      const stream = await navigator.mediaDevices.getUserMedia(
      {
        video: videoConstraint,
        audio: audioConstraint,
      });

      localStreamRef.current = stream;

      stream.getVideoTracks().forEach(t => { t.enabled = camEnabled; });
      stream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });

      if (localVideoRef.current)
      {
        localVideoRef.current.srcObject = stream;
      }
    }
    catch (err)
    {
      console.error("Failed to start video preview:", err);
    }
  }

  function toggleCam()
  {
    const next = !camEnabled;
    setCamEnabled(next);

    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach(t => { t.enabled = next; });
  }

  function toggleMic()
  {
    const next = !micEnabled;
    setMicEnabled(next);

    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = next; });
  }

  useEffect(() =>
  {
    if (!id)
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

        const res = await fetch(`http://localhost:3001/api/rooms/${id}`, { credentials: "include" });
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

    return () =>
    {
      cancelled = true;
    };
  }, [id]);

  useEffect(() =>
  {
    function onDeviceChange()
    {
      refreshDevices();
    }

    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () =>
    {
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() =>
  {
    if (!selectedVideoId && !selectedAudioId) return;
    startPreview();

    return () =>
    {
      stopPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVideoId, selectedAudioId]);

  async function joinGame()
  {
    if (!roomId) return;

    setLoading(true);
    setErrorMessage(null);

    try
    {
      const { peerId, device, sendTransport, recvTransport } = await sfuHandshake(roomId);
      console.log("SFU handshake successful:", { peerId, device, sendTransport, recvTransport });

      const res = await apiPost(`/api/rooms/${roomId}/live`, { credentials: "include" });

      if (!res.ok)
      {
        setErrorMessage(res.error || "Failed to join room.");
        return;
      }

      console.log("Joined room successfully:", res);
      setIsJoined(true);
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
          <span className="text-slate-500">·</span>{" "}
          <span className="text-slate-400">ID:</span> {roomId}
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs text-slate-300">Camera</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={selectedVideoId}
                  onChange={(e) => setSelectedVideoId(e.target.value)}
                >
                  {videoInputs.length === 0 && (
                    <option value="">No cameras found</option>
                  )}
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
                  {audioInputs.length === 0 && (
                    <option value="">No microphones found</option>
                  )}
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

          <main className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Preview</div>
                <div className="mt-1 text-xs text-slate-400">
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

            <video
              className="mt-4 w-full rounded-xl bg-black/50"
              ref={localVideoRef}
              style={{ aspectRatio: aspect }}
              autoPlay
              playsInline
              muted
            />

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                onClick={() =>
                {
                  stopPreview();
                  navigate("/lobby");
                }}
              >
                Back
              </button>

              <button
                type="button"
                disabled={loading || !roomId}
                className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                           px-4 py-2 text-sm font-medium text-slate-100 hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => { joinGame(); }}
              >
                {loading ? "Joining..." : "Join Room"}
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}