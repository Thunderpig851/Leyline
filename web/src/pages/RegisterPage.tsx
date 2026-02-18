import { useMemo, useState } from "react";
import { apiPost } from "../lib/api";

type RegisterResponse = {
  ok: boolean;
  user?: {
    id: string;
    username: string;
    email: string;
    createdAt: string;
  };
  error?: string;
};

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function passwordIssues(password: string) {
  const p = password || "";
  const issues: string[] = [];
  if (p.length < 10) issues.push("At least 10 characters");
  if (!/\d/.test(p)) issues.push("At least one number");
  if (!/[^A-Za-z0-9]/.test(p)) issues.push("At least one special character");
  return issues;
}

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const emailOk = useMemo(() => validateEmail(email), [email]);
  const issues = useMemo(() => passwordIssues(password), [password]);
  const matches = confirm.length === 0 ? true : password === confirm;

  const canSubmit =
    username.trim().length > 0 &&
    emailOk &&
    issues.length === 0 &&
    password === confirm &&
    !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSuccessMsg(null);

    if (!canSubmit) return;

    setLoading(true);
    const result = await apiPost<RegisterResponse>("/api/auth/register", {
      username: username.trim(),
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    if (!result.data.ok) {
      setServerError(result.data.error || "Registration failed.");
      return;
    }

    setSuccessMsg("Account created. You can log in now.");
    setPassword("");
    setConfirm("");
  }

  const ReqItem = ({ label, ok }: { label: string; ok: boolean }) => (
    <li className={ok ? "text-cyan-300" : "text-red-300"}>{label}</li>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-slate-300">
          Minimal starter form. We will refine the look later.
        </p>

        {serverError && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {serverError}
          </div>
        )}

        {successMsg && (
          <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
            {successMsg}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs text-slate-300">Username</span>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60 focus:ring-4 focus:ring-cyan-400/10"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="estepcj"
            />
          </label>

          <label className="block">
            <span className="text-xs text-slate-300">Email</span>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60 focus:ring-4 focus:ring-cyan-400/10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
            {!emailOk && email.length > 0 && (
              <div className="mt-1 text-xs text-red-300">Email looks invalid.</div>
            )}
          </label>

          <label className="block">
            <span className="text-xs text-slate-300">Password</span>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60 focus:ring-4 focus:ring-cyan-400/10"
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
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm outline-none focus:border-purple-400/60 focus:ring-4 focus:ring-cyan-400/10"
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

          <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3">
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
            className="w-full rounded-xl border border-purple-400/40 bg-purple-500/10 px-4 py-2.5 text-sm font-medium hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSubmit}
          >
            {loading ? "Creating..." : "Create account"}
          </button>

          <div className="text-center text-sm text-slate-300">
            Already have an account?{" "}
            <a className="text-sky-300 hover:underline" href="/login">
              Log in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
