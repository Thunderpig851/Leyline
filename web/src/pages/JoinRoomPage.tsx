import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HandshakeTest } from "../components/HandshakeTest";

type CameraSource = "webcam" | "phone";
type Aspect = "16:9" | "4:3" | "1:1";

type RoomResponse =
{
  ok: boolean;
  room?: { _id: string; title: string };
  error?: string;
};

export default function JoinRoomPage()
{
  const navigate = useNavigate();
  const { id } = useParams();

  const roomId = id || "";
  const [roomTitle, setRoomTitle] = useState("");

  const [cameraSource, setCameraSource] = useState<CameraSource>("webcam");
  const [aspect, setAspect] = useState<Aspect>("16:9");

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      }
      catch (e: any)
      {
        if (cancelled) return;
        setError(e?.message || "Failed to load room.");
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  useEffect(() =>
  {
    if (!roomId) return;
    console.log("Starting SFU handshake test for room:", roomId);
  }, [roomId]);

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

              <button
                type="button"
                className="rounded-xl border border-teal-300/40 bg-teal-500/10 px-4 py-2 text-sm text-slate-100 hover:bg-teal-500/20"
                onClick={() => {}}
              >
                Start
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4">
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-400">
                {roomId ? <HandshakeTest roomId={roomId} /> : "Missing room id"}
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
                onClick={() => navigate("/lobby")}
              >
                Back
              </button>

              <button
                type="button"
                disabled={loading || !roomId}
                className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                           px-4 py-2 text-sm font-medium text-slate-100 hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {}}
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