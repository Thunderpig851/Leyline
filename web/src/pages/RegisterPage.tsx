import { useMemo, useState } from "react";
import { apiPost } from "../lib/api";

type RegisterResponse =
{
  ok: boolean;
  user?: 
  {
    id: string;
    username: string;
    email: string;
    createdAt: string;
  };
  error?: string;
};

function validateEmail(email: string)
{
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password: string)
{
  const p = password || "";
  const issues: string[] = [];
  if (p.length < 10) issues.push("At least 10 characters");
  if (!/\d/.test(p)) issues.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(p)) issues.push("At least one special character");
  return issues;
}

export default function RegisterPage()
{
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const emailOk = useMemo(() => validateEmail(email), [email]);
  const issues = useMemo(() => validatePassword(password), [password]);
  const matches = confirm.length === 0 ? true : password === confirm;

  const canSubmit =
    username.trim().length > 0 &&
    emailOk &&
    issues.length === 0 &&
    password === confirm &&
    !loading;

async function onSubmit(e: React.SubmitEvent)
  {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);

    if (!canSubmit) return;

    setLoading(true);
    const result = await apiPost<RegisterResponse>("/api/auth/register",
    {
      username: username.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (!result.ok)
    {
      setServerError(result.error);
      return;
    }

    if (!result.data.ok)
    {
      setServerError(result.data.error || "Registration failed.");
      return;
    }

    setSuccessMsg("Account created. You can log in now.");
    setPassword("");
    setConfirm("");
  }

  const ReqItem = ({ label, ok }: { label: string; ok: boolean }) => (
    <li className={ok ? "text-teal-300" : "text-gray-300"}>{label}</li>
  );

  return (
    <div className="min-h-screen text-slate-100 grid place-items-center px-6 bg-slate-950 relative">
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute left-1/3 top-2/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-6 shadow-[0_0_0_1px_rgba(45,212,191,0.14),0_22px_90px_-28px_rgba(0,0,0,0.85)]">
        <h1 className="text-2xl font-semibold tracking-tight text-center">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Create Account
          </span>
        </h1>

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
            <span className="text-xs text-slate-300">Username</span>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none
                         focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="JohnnyGamer123"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-300">Email</span>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none
                         focus:border-teal-300/80 focus:ring-4 focus:ring-emerald-400/20"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
            {!emailOk && email.length > 0 && (
              <div className="mt-1 text-xs text-red-300">Invalid Email.</div>
            )}
          </label>

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
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Re-type password"
            />
            {!matches && confirm.length > 0 && (
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
              <ReqItem label="Passwords match" ok={password === confirm && confirm.length > 0 ? true : confirm.length === 0} />
            </ul>
          </div>

          <button
            className="w-full rounded-xl border border-teal-300/60 bg-gradient-to-r from-emerald-400/25 via-teal-400/20 to-cyan-300/20
                       px-4 py-2.5 text-sm font-medium text-slate-100
                       hover:bg-teal-300 hover:border-teal-200 hover:text-slate-900
                       hover:shadow-lg hover:shadow-teal-400/25
                       transition-colors transition-shadow duration-150
                       focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-300/20
                       disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSubmit}
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          <div className="text-center text-sm text-slate-300">
            Already have an account?{" "}
            <a className="text-teal-300 hover:text-emerald-300 hover:underline" href="/login">
              Log in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
