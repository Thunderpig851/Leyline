import { useState } from "react";
import { apiPost, isAuthErrorMessage } from "../lib/api";
import { useNavigate } from "react-router-dom";
import ActionableErrorPanel from "./ActionableErrorPanel";

type CreateGameResponse =
{
  ok: boolean;
  room?:
  {
    _id: string;
    title: string;
    visibility?: "public" | "private";
  };
  privateCode?: string | null;
  error?: string;
};

type StartLiveGameResponse =
{
  ok: boolean;
  game?:
  {
    _id: string;
    roomId: string;
    format: string;
  };
  error?: string;
};

type CreateGamePopUpProps =
{
  onClose: () => void;
};

function getMaxPlayersForFormat(format: string)
{
  return format === "commander" ? 4 : 2;
}

export default function CreateGamePopUp({ onClose }: CreateGamePopUpProps)
{
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [settings, setSettings] = useState(
  {
    format: "commander",
    bracket: "1",
    maxPlayers: getMaxPlayersForFormat("commander"),
    allowSpectators: false
  });

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent)
  {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);
    setLoading(true);

    const roomResult = await apiPost<CreateGameResponse>("/api/rooms/create", {
      title,
      description,
      visibility,
      settings,
    });

    if (!roomResult.ok)
    {
      const roomError = roomResult.error;

      setServerError(roomError || "Failed to create room.");

      setLoading(false);
      return;
    }

    const roomId = roomResult.data?.room?._id;
    const privateCode = roomResult.data?.privateCode;

    if (!roomId)
    {
      setServerError("Room was created, but no room id was returned.");
      setLoading(false);
      return;
    }

    const liveGameResult = await apiPost<StartLiveGameResponse>("/api/live-games/start", {
      roomId,
      format: settings.format,
    });

    if (!liveGameResult.ok)
    {
      const liveGameError = liveGameResult.error;
      setServerError(liveGameError || "Room created, but failed to start live game.");
      setLoading(false);
      return;
    }

    setSuccessMsg(
      privateCode
        ? `Private game created. Code: ${privateCode}`
        : "Game created successfully!"
    );
    setLoading(false);
    onClose();

    const search = privateCode
      ? `?code=${encodeURIComponent(privateCode)}`
      : "";

    navigate(`/rooms/${roomId}${search}`);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div className="relative flex min-h-full items-center justify-center px-6 py-10">
        <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-teal-300/20 bg-slate-950/95 shadow-[0_0_0_1px_rgba(45,212,191,0.1),0_32px_120px_-40px_rgba(16,185,129,0.45)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-teal-400/18 via-cyan-400/10 to-transparent" />
          <div className="pointer-events-none absolute -right-12 top-8 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 bottom-2 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative p-6 sm:p-7">
            <h2 className="text-center text-2xl font-semibold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Create New Game
              </span>
            </h2>

            {serverError ? (
              <div className="mt-4">
                <ActionableErrorPanel
                  message={serverError}
                  actionLabel={isAuthErrorMessage(serverError) ? "Log in" : undefined}
                  actionHref={isAuthErrorMessage(serverError) ? "/login" : undefined}
                />
              </div>
            ) : null}

            {successMsg && (
              <div className="mt-4 rounded-xl border border-teal-400/40 bg-teal-500/10 px-4 py-3 text-sm text-teal-100">
                {successMsg}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs text-slate-300">Title</span>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Casual Commander Pod"
                />
              </label>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-slate-300">Format</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                    value={settings.format}
                    onChange={(e) =>
                    {
                      const nextFormat = e.target.value;

                      setSettings((current) =>
                      ({
                        ...current,
                        format: nextFormat,
                        bracket: nextFormat === "commander" ? current.bracket : "1",
                        maxPlayers: getMaxPlayersForFormat(nextFormat),
                      }));
                    }}
                  >
                    <option value="commander">Commander</option>
                    <option value="standard">Standard</option>
                    <option value="modern">Modern</option>
                    <option value="legacy">Legacy</option>
                    <option value="vintage">Vintage</option>
                    <option value="pauper">Pauper</option>
                    <option value="pioneer">Pioneer</option>
                  </select>
                </label>

                {settings.format === "commander" ? (
                  <label className="block">
                    <span className="text-xs text-slate-300">Bracket</span>
                    <select
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                      value={settings.bracket}
                      onChange={(e) => setSettings({ ...settings, bracket: e.target.value })}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </label>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-slate-950/45 px-3 py-2">
                    <div className="text-xs font-medium text-slate-200">1v1 layout</div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Non-commander formats use 2 seats and the duel game-page split.
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-slate-300">Visibility</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs text-slate-300">Spectators</span>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                    value={settings.allowSpectators ? "true" : "false"}
                    onChange={(e) => setSettings({ ...settings, allowSpectators: e.target.value === "true" })}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </label>
              </div>

              {visibility === "private" && (
                <div className="rounded-xl border border-teal-300/20 bg-teal-500/10 px-3 py-2 text-xs text-teal-100">
                  Private rooms get a 6-character share code automatically.
                </div>
              )}

              <label className="block">
                <span className="text-xs text-slate-300">Description</span>
                <textarea
                  className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details..."
                  rows={4}
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors transition-shadow duration-150 hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-lg hover:shadow-teal-400/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create"}
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
