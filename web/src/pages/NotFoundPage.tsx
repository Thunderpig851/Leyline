import LeylineBackdrop from "../components/layout/LeylineBackdrop";

export default function NotFoundPage()
{
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-6 text-slate-100">
      <LeylineBackdrop />

      <div className="relative z-10 grid min-h-screen place-items-center">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center backdrop-blur">
          <div className="text-5xl font-semibold tracking-tight">
            <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent">
              404
            </span>
          </div>

          <h1 className="mt-2 text-lg font-medium">Page not found</h1>
          <p className="mt-2 text-sm text-slate-300">
            The page you’re looking for doesn’t exist.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/lobby"
              className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-200/20"
            >
              Go home
            </a>
            <a
              href="/login"
              className="rounded-xl border border-teal-300/30 bg-teal-500/10 px-4 py-2 text-sm hover:bg-teal-200/20"
            >
              Log in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
