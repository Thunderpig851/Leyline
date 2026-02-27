import { useMemo, useState } from "react";
import { apiPost } from "../lib/api"

import AccountSettingsPanel from "../components/AccountSettingsPanel";
import SocialPanel from "../components/SocialPanel";

type AccountResponse = 
{
  ok: boolean;
  user?:
  {
    _id: string;
    username: string;
    updatedAt: string;
  };
  error?: string;
}

type AccountSection = "account" | "social";

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

export default function AccountPage()
{
  const [password, setPassword] = useState("");
  const [confirm, setPasswordConfirm] = useState("");
  const [friends, setFriends] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const issues = useMemo(() => validatePassword(password), [password]);
  const matches = confirm.length === 0 ? true : password === confirm;

  const [section, setSection] = useState<AccountSection>("account");

  const canSubmit =
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
    const result = await apiPost<AccountResponse>("/api/account/update", 
      { friends, blockedUsers },
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
      setServerError(result.data.error || "Failed to update account");
      return;
    }

    setSuccessMsg("Account updated successfully");
    setPassword("");
    setPasswordConfirm("");
  }

  type AccountSection = "account" | "social";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Account
          </span>
        </h1>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-300">
          <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
            <aside className="rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_18px_70px_-32px_rgba(0,0,0,0.85)]">
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setSection("account")}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                >
                  Account
                </button>

                <button
                  type="button"
                  onClick={() => setSection("social")}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                >
                  Social
                </button>
              </div>
            </aside>

            <main className="rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_18px_70px_-32px_rgba(0,0,0,0.85)]">
              {section === "account" ? (
                <AccountSettingsPanel />
              ) : section === "social" ? (
                <SocialPanel />
              ) : null}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}