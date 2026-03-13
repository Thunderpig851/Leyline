import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { sfuHandshake } from "../lib/sfuHandshake";
import { apiPost } from "../lib/api";

type CameraSource = "webcam" | "phone";
type Aspect = "16:9" | "4:3" | "1:1";

type RoomResponse =
{
  ok: boolean;
  room?: { _id: string; title: string };
  error?: string;
};

function MicOnIcon()
{
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function MicOffIcon()
{
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 9v2a2 2 0 0 0 3.4 1.4" />
      <path d="M9 5a3 3 0 0 1 6 0v6" />
      <path d="M19 11a7 7 0 0 1-2.2 5.1" />
      <path d="M5 11a7 7 0 0 0 9.1 6.7" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function CamOnIcon()
{
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
      <path d="M16 10l4-2v8l-4-2v-4z" />
    </svg>
  );
}

function CamOffIcon()
{
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 1.4-.6" />
      <path d="M14 7h2a2 2 0 0 1 2 2v3" />
      <path d="M16 10l4-2v8l-2.2-1.1" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export default function JoinRoomPage()
{
  const navigate = useNavigate();

  const { id } = useParams();
  const roomId = id || "";

  const [roomTitle, setRoomTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [cameraSource, setCameraSource] = useState<CameraSource>("webcam");
  const [aspect, setAspect] = useState<Aspect>("16:9");

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        startPreview();
      }
      catch (e: any)
      {
        if (cancelled) return;
        setError(e?.message || "Failed to load room.");
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  async function startPreview()
  {
    try
    {
      const stream = await navigator.mediaDevices.getUserMedia(
      {
        video: cameraSource === "webcam" ? { facingMode: "user" } : { facingMode: "environment" },
        audio: true,
      });

      localStreamRef.current = stream;

      stream.getAudioTracks().forEach(t => t.enabled = micEnabled);
      stream.getVideoTracks().forEach(t => t.enabled = camEnabled);

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

  function stopPreview()
  {
    if (localStreamRef.current)
    {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
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
      // currently working here
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
                <span className="text-xs text-slate-300">Camera Source</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={cameraSource}
                  onChange={(e) => setCameraSource(e.target.value as CameraSource)}
                >
                  <option value="webcam">Webcam</option>
                  <option value="phone">Phone</option>
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
                  Source: {cameraSource} · Aspect: {aspect}
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