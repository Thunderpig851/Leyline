import { useState } from "react";
import { useNavigate } from "react-router-dom";

type CameraSource = "webcam" | "phone";
type Aspect = "16:9" | "4:3" | "1:1";

type JoinRoomPageProps =
{
  roomId: string;
  roomTitle: string;
};

export default function JoinRoomPage({ roomId, roomTitle }: JoinRoomPageProps)
{
  const navigate = useNavigate();

  const [cameraSource, setCameraSource] = useState<CameraSource>("webcam");
  const [aspect, setAspect] = useState<Aspect>("16:9");

  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For Later : refs you’ll add (do NOT put these in JSX)
  // - videoRef: points to the <video> element used for preview
  // - streamRef: holds the active MediaStream (camera/mic)
  // - optionally: devices state (camera list, mic list) if you want dropdowns later

  // For Later : lifecycle for auto-start preview
  // useEffect(() => {
  //   startPreview();               // request permissions + attach stream to video
  //   return () => stopPreview();   // stop tracks when leaving page
  // }, []);

  // For Later : startPreview()
  // startPreview should:
  // - setError(null)
  // - call navigator.mediaDevices.getUserMedia({
  //     video: true (or constraints based on cameraSource/device),
  //     audio: true
  //   })
  // - store stream into streamRef
  // - attach to videoRef: videoRef.current.srcObject = stream
  // - ensure preview video is muted + playsInline
  // - optionally enumerateDevices AFTER permission so labels show

  // For Later : stopPreview()
  // stopPreview should:
  // - if streamRef exists:
  //     streamRef.current.getTracks().forEach(track => track.stop())
  //     streamRef.current = null
  // - if videoRef exists:
  //     videoRef.current.srcObject = null

  // For Later : toggles (simple test version)
  // - mic toggle: streamRef.current.getAudioTracks().forEach(t => t.enabled = false/true)
  // - cam toggle: streamRef.current.getVideoTracks().forEach(t => t.enabled = false/true)

  // For Later : switching camera/mic devices (later)
  // Easiest early approach:
  // - stopPreview()
  // - startPreview() again with deviceId constraints
  // Later WebRTC approach:
  // - replaceTrack on RTCRtpSender instead of restarting

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Join Room
          </span>
        </h1>

        <div className="mt-2 text-sm text-slate-300">
          <span className="text-slate-400">Room:</span> {roomTitle}{" "}
          <span className="text-slate-500">·</span>{" "}
          <span className="text-slate-400">ID:</span> {roomId}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
          {/* Controls */}
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

                {/* For Later : if cameraSource changes and you want it to affect preview:
                    - If "webcam": use getUserMedia video constraints
                    - If "phone": you’ll eventually need a different ingestion path
                    - For now, you can treat both as “webcam” and just keep UI state */}
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

                {/* For Later : applying aspect ratio to preview:
                    - Wrap the <video> in a container
                    - Set container aspect via CSS (aspect-video / custom)
                    - Keep video object-cover */}
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
                Video preview goes here
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
                disabled={loading}
                className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                           px-4 py-2 text-sm font-medium text-slate-100 hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           disabled:opacity-50 disabled:cursor-not-allowed"
                // For Later : join flow later:
                // - validate joinCode if private
                // - call backend join endpoint (mediasoup)
                // - navigate to /rooms/:roomId when ok
                onClick={() => {}}
              >
                {loading ? "Joining..." : "Join Room"}
              </button>
            </div>

            {/* For Later : Stop preview when navigating away
                - Back button could call stopPreview() before navigate
                - Also rely on useEffect cleanup on unmount */}
          </main>
        </div>
      </div>
    </div>
  );
}