import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AccountSettingsPanel from "../components/AccountSettingsPanel";
import SocialPanel from "../components/SocialPanel";

type AccountSection = "account" | "social";

function isAccountSection(v: string | null): v is AccountSection
{
  return v === "account" || v === "social";
}

export default function AccountPage()
{
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSection = useMemo<AccountSection>(() =>
  {
    const p = searchParams.get("panel");
    return isAccountSection(p) ? p : "account";
  }, [searchParams]);

  const [section, setSection] = useState<AccountSection>(initialSection);

  useEffect(() =>
  {
    const p = searchParams.get("panel");
    if (isAccountSection(p) && p !== section) setSection(p);
    if (!p && section !== "account") setSearchParams({ panel: section }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isActive = (key: AccountSection) => section === key;

  function go(key: AccountSection)
  {
    setSection(key);
    setSearchParams({ panel: key }, { replace: true });
  }

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
                  onClick={() => go("account")}
                  className={`w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm ${
                    isActive("account")
                      ? "bg-teal-500/20 text-slate-100"
                      : "bg-slate-950/40 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  Account
                </button>

                <button
                  type="button"
                  onClick={() => go("social")}
                  className={`w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm ${
                    isActive("social")
                      ? "bg-teal-500/20 text-slate-100"
                      : "bg-slate-950/40 text-slate-200 hover:bg-white/5"
                  }`}
                >
                  Social
                </button>
              </div>
            </aside>

            <main className="rounded-2xl border border-teal-400/25 bg-slate-900/70 backdrop-blur p-5 shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_18px_70px_-32px_rgba(0,0,0,0.85)]">
              {section === "account" ? <AccountSettingsPanel /> : <SocialPanel />}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}