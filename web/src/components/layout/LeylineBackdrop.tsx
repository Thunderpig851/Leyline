export default function LeylineBackdrop()
{
  return (
    <>
      <style>{`
        @keyframes leylineDriftA {
          0% { transform: translate3d(-6%, 0%, 0) scale(1); opacity: 0.46; }
          50% { transform: translate3d(6%, -4%, 0) scale(1.08); opacity: 0.72; }
          100% { transform: translate3d(11%, 3%, 0) scale(1.03); opacity: 0.54; }
        }

        @keyframes leylineDriftB {
          0% { transform: translate3d(8%, 2%, 0) scale(1.08); opacity: 0.36; }
          50% { transform: translate3d(-4%, -5%, 0) scale(1.01); opacity: 0.58; }
          100% { transform: translate3d(-11%, 5%, 0) scale(1.12); opacity: 0.42; }
        }

        @keyframes leylinePulse {
          0%, 100% { opacity: 0.24; transform: scale(0.98); }
          50% { opacity: 0.4; transform: scale(1.06); }
        }

        @keyframes leylineHueShift {
          0% { filter: hue-rotate(0deg) saturate(1.04) brightness(1); }
          25% { filter: hue-rotate(18deg) saturate(1.15) brightness(1.03); }
          50% { filter: hue-rotate(-14deg) saturate(1.22) brightness(1.05); }
          75% { filter: hue-rotate(28deg) saturate(1.16) brightness(1.02); }
          100% { filter: hue-rotate(0deg) saturate(1.04) brightness(1); }
        }

        @keyframes leylinePathFloat {
          0% { transform: translate3d(-1.5%, 0%, 0) scale(1); opacity: 0.42; }
          50% { transform: translate3d(2%, -1.8%, 0) scale(1.025); opacity: 0.68; }
          100% { transform: translate3d(-1.5%, 1.2%, 0) scale(1); opacity: 0.48; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),transparent_38%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.16),transparent_48%),radial-gradient(circle_at_center,rgba(34,211,238,0.1),transparent_56%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.44)_0%,rgba(2,6,23,0.62)_24%,rgba(2,6,23,0.78)_100%)]" />

        <div
          className="absolute -left-[12%] top-[-4%] h-[58%] w-[72%] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.34)_0%,rgba(34,211,238,0.2)_28%,rgba(16,185,129,0.12)_46%,rgba(0,0,0,0)_74%)] blur-[100px]"
          style={{ animation: "leylineDriftA 22s ease-in-out infinite alternate, leylineHueShift 18s ease-in-out infinite" }}
        />

        <div
          className="absolute right-[-14%] top-[4%] h-[60%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.28)_0%,rgba(45,212,191,0.15)_30%,rgba(59,130,246,0.1)_46%,rgba(0,0,0,0)_74%)] blur-[96px]"
          style={{ animation: "leylineDriftB 28s ease-in-out infinite alternate, leylineHueShift 22s ease-in-out infinite reverse" }}
        />

        <div
          className="absolute -left-[8%] bottom-[-12%] h-[52%] w-[66%] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.24)_0%,rgba(45,212,191,0.14)_32%,rgba(168,85,247,0.1)_48%,rgba(0,0,0,0)_74%)] blur-[104px]"
          style={{ animation: "leylineDriftB 32s ease-in-out infinite alternate-reverse, leylineHueShift 26s ease-in-out infinite" }}
        />

        <div
          className="absolute inset-[3%] opacity-100 mix-blend-screen"
          style={{ animation: "leylinePathFloat 16s ease-in-out infinite, leylineHueShift 16s ease-in-out infinite" }}
        >
          <svg viewBox="0 0 1600 1000" className="h-full w-full">
            <defs>
              <linearGradient id="leylineStrokeA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(16,185,129,0)" />
                <stop offset="24%" stopColor="rgba(45,212,191,0.52)" />
                <stop offset="50%" stopColor="rgba(125,211,252,0.46)" />
                <stop offset="76%" stopColor="rgba(52,211,153,0.5)" />
                <stop offset="100%" stopColor="rgba(16,185,129,0)" />
              </linearGradient>
              <linearGradient id="leylineStrokeB" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(34,211,238,0)" />
                <stop offset="28%" stopColor="rgba(34,211,238,0.42)" />
                <stop offset="54%" stopColor="rgba(16,185,129,0.5)" />
                <stop offset="76%" stopColor="rgba(168,85,247,0.34)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0)" />
              </linearGradient>
              <linearGradient id="leylineStrokeC" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(125,211,252,0)" />
                <stop offset="36%" stopColor="rgba(45,212,191,0.36)" />
                <stop offset="58%" stopColor="rgba(56,189,248,0.42)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0)" />
              </linearGradient>
            </defs>

            <path
              d="M -40 260 C 180 180, 360 360, 560 280 S 980 170, 1180 260 S 1460 380, 1660 250"
              fill="none"
              stroke="url(#leylineStrokeA)"
              strokeWidth="4.4"
              strokeLinecap="round"
            />
            <path
              d="M -20 620 C 220 540, 420 720, 640 640 S 1040 520, 1260 600 S 1480 720, 1660 640"
              fill="none"
              stroke="url(#leylineStrokeB)"
              strokeWidth="3.8"
              strokeLinecap="round"
            />
            <path
              d="M 120 930 C 330 760, 500 770, 700 860 S 1060 980, 1440 820"
              fill="none"
              stroke="url(#leylineStrokeA)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M 220 120 C 420 210, 520 150, 760 210 S 1180 320, 1520 160"
              fill="none"
              stroke="url(#leylineStrokeC)"
              strokeWidth="2.6"
              strokeLinecap="round"
              opacity="0.8"
            />
          </svg>
        </div>

        <div
          className="absolute left-[12%] top-[16%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.3)_0%,rgba(34,211,238,0.18)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 9s ease-in-out infinite, leylineHueShift 16s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[16%] top-[50%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.26)_0%,rgba(16,185,129,0.16)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 12s ease-in-out infinite, leylineHueShift 20s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute left-[40%] bottom-[6%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.22)_0%,rgba(168,85,247,0.14)_38%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 15s ease-in-out infinite, leylineHueShift 24s ease-in-out infinite" }}
        />
      </div>
    </>
  );
}
