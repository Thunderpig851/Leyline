// web/src/components/Footer.tsx
export default function Footer()
{
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-slate-950/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-200 bg-clip-text text-transparent font-semibold">
            Leyline
          </span>
        <div className="text-xs text-slate-400">
          © {year}{" "} Cam Estep. All rights reserved. 
        </div>

      </div>
    </footer>
  );
}