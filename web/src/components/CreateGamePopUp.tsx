import { useState } from "react";
import { apiPost } from "../lib/api";

type CreateGameResponse =
{
  ok: boolean;
  game?: {
    id: string;
    host: string;
    createdAt: string;
  };
  error?: string;
};

type CreateGamePopUpProps =
{
  onClose: () => void;
};

export default function CreateGamePopUp({ onClose }: CreateGamePopUpProps)
{
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [settings, setSettings] = useState(
  {
    format: "",
    bracket: "",
    allowSpectators: false
  });


  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>)
  {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);

    setLoading(true);

    const result = await apiPost<CreateGameResponse>("/api/rooms/create", 
    {
      title,
      description,
      visibility,
      settings
    });

    if (!result.ok)
    {
      setServerError(result.error || "Failed to create game");
    }
    else
    {
      setSuccessMsg("Game created successfully!");
      setTimeout(() => onClose(), 1500);
    }

    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/65" />

      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/3 top-2/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <div className="relative flex min-h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-teal-400/25 bg-slate-900/80 backdrop-blur p-6 shadow-[0_0_0_1px_rgba(45,212,191,0.14),0_22px_90px_-28px_rgba(0,0,0,0.85)]">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
              Create New Game
            </span>
          </h2>

          {serverError && (
            <div className="mt-4 rounded-xl border border-red-400/45 bg-red-500/15 px-4 py-3 text-sm text-red-100">
              {serverError}
            </div>
          )}

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
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                           focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Casual Commander Pod"
              />
            </label>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-slate-300">Bracket</span>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={settings.bracket}
                  onChange={(e) => setSettings({...settings, bracket: e.target.value})}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
            </label>

            <label className="block">
              <span className="text-xs text-slate-300">Visibility</span>
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                           focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
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
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={settings.allowSpectators ? "true" : "false"}
                  onChange={(e) => setSettings({...settings, allowSpectators: e.target.value === "true" })}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
            </label>

            </div>



            <label className="block">
              <span className="text-xs text-slate-300">Description</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none
                           focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20 resize-none"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details..."
                rows={4}
              />
            </label>

            <div className="pt-2 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                           px-4 py-2.5 text-sm font-medium text-slate-100
                           hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                           hover:shadow-lg hover:shadow-teal-400/25
                           transition-colors transition-shadow duration-150
                           focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/20
                           disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}