// web/src/pages/AccountPage.tsx
export default function AccountPage()
{
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
            Account
          </span>
        </h1>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-300">
          Expand
        </div>
      </div>
    </div>
  );
}