import { useState } from "react";
import { useNavigate } from "react-router-dom";

type CameraSource = "Webcam" | "Phone";
type Aspect = "16:9" | "4:3" | "1:1";

type JoinRoomPageProps =
{
  roomId: string;
  roomTitle: string;
};

export default function JoinRoomPage({ roomId, roomTitle }: JoinRoomPageProps)
{
  const navigate = useNavigate();

  const [cameraSource, setCameraSource] = useState<CameraSource>("Webcam");
  const [aspect, setAspect] = useState<Aspect>("16:9");

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/3 top-2/3 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Join Room
              </span>
            </h1>

            <div className="mt-2 text-sm text-slate-300">
              <span className="text-slate-400">Room:</span>{" "}
              <span className="font-medium text-slate-100">{roomTitle}</span>{" "}
              <span className="text-slate-500">·</span>{" "}
              <span className="text-slate-400">ID:</span>{" "}
              <span className="font-mono text-xs text-slate-200">{roomId}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/lobby")}
            className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          >
            Back to Lobby
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
          <aside className="rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_18px_70px_-32px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100">Settings</div>
            </div>

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs text-slate-300">Camera Source</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={cameraSource}
                  onChange={(e) => setCameraSource(e.target.value as CameraSource)}
                >
                  <option value="Webcam">Webcam</option>
                  <option value="Phone">Phone</option>
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

          <main className="rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_18px_70px_-32px_rgba(0,0,0,0.85)]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">Preview</div>
                <div className="mt-1 text-xs text-slate-400">
                  Source: <span className="text-slate-200">{cameraSource}</span>{" "}
                  <span className="text-slate-600">·</span>{" "}
                  Aspect: <span className="text-slate-200">{aspect}</span>
                </div>
              </div>

              <button
                type="button"
                className="rounded-xl border border-teal-300/40 bg-teal-500/10 px-4 py-2 text-sm text-slate-100
                           hover:bg-teal-500/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/20"
                onClick={() => {}}
              >
                Start
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/30 p-4">
              <div className="flex items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 p-10 text-sm text-slate-400">
                Video preview goes here
              </div>
            </div>

            <div className="mt-4 flex gap-3">

              <button
                type="button"
                disabled={loading}
                className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                           px-4 py-2 text-sm font-medium text-slate-100
                           hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           hover:shadow-lg hover:shadow-teal-400/25 transition-colors transition-shadow duration-150
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