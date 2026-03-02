import { useMemo, useState } from "react";
import { apiPost } from "../lib/api";

type AccountResponse =
{
  ok: boolean;
  user?: {
    _id: string;
    username: string;
    updatedAt?: string;
  };
  error?: string;
};

function validatePassword(password: string)
{
  const p = password || "";
  const issues: string[] = [];
  if (p.length < 10) issues.push("At least 10 characters");
  if (!/\d/.test(p)) issues.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(p)) issues.push("At least one special character");
  return issues;
}

const ReqItem = ({ label, ok }: { label: string; ok: boolean }) => (
  <li className={ok ? "text-teal-300" : "text-gray-300"}>{label}</li>
);

export default function AccountSettingsPanel()
{
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const issues = useMemo(() => validatePassword(password), [password]);
  const matches = passwordConfirm.length === 0 ? true : password === passwordConfirm;

  const canSubmit =
    password.length > 0 &&
    issues.length === 0 &&
    password === passwordConfirm &&
    !loading;

  async function onSubmit(e: React.FormEvent)
  {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);

    if (!canSubmit) return;

    setLoading(true);
    const result = await apiPost<AccountResponse>(
      "/api/account/update",
      { password },
      { method: "PATCH" }
    );
    setLoading(false);

    if (!result.ok)
    {
      setServerError(result.error);
      return;
    }

    if (!result.data.ok)
    {
      setServerError(result.data.error || "Failed to update account.");
      return;
    }

    setSuccessMsg("Password updated successfully.");
    setPassword("");
    setPasswordConfirm("");
    setShowChangePassword(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">

        {!showChangePassword && (
          <button
            type="button"
            onClick={() =>
            {
              setServerError(null);
              setSuccessMsg(null);
              setShowChangePassword(true);
            }}
            className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-3 py-2 text-sm text-slate-200 hover:bg-teal-500/20"
          >
            Change password
          </button>
        )}
      </div>

      {showChangePassword && (
        <div className="relative">
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
            <div className="absolute left-1/3 top-2/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
          </div>

          <div className="w-full rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-6 shadow-[0_0_0_1px_rgba(45,212,191,0.14),0_22px_90px_-28px_rgba(0,0,0,0.85)]">
            <h2 className="text-lg font-semibold tracking-tight text-center">
              <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
                Change Password
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
                <span className="text-xs text-slate-300">Password</span>
                <input
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                />
              </label>

              <label className="block">
                <span className="text-xs text-slate-300">Confirm password</span>
                <input
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none
                             focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-type password"
                />
                {!matches && passwordConfirm.length > 0 && (
                  <div className="mt-1 text-xs text-red-300">Passwords do not match.</div>
                )}
              </label>

              <div className="rounded-xl border border-teal-400/25 bg-slate-950/35 px-4 py-3">
                <div className="text-xs text-slate-300">Password requirements</div>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  <ReqItem label="At least 10 characters" ok={!issues.includes("At least 10 characters")} />
                  <ReqItem label="At least one number" ok={!issues.includes("At least one number")} />
                  <ReqItem
                    label="At least one special character"
                    ok={!issues.includes("At least one special character")}
                  />
                  <ReqItem
                    label="Passwords match"
                    ok={password === passwordConfirm && passwordConfirm.length > 0 ? true : passwordConfirm.length === 0}
                  />
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                             px-4 py-2.5 text-sm font-medium text-slate-100
                             hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                             hover:shadow-lg hover:shadow-teal-400/25
                             transition-colors transition-shadow duration-150
                             focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/20
                             disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canSubmit}
                >
                  {loading ? "Saving..." : "Save"}
                </button>

                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5"
                  onClick={() =>
                  {
                    setPassword("");
                    setPasswordConfirm("");
                    setServerError(null);
                    setSuccessMsg(null);
                    setShowChangePassword(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}