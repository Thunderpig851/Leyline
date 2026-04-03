type LeylineBackdropProps =
{
  fixed?: boolean;
};

export default function LeylineBackdrop({ fixed = false }: LeylineBackdropProps)
{
  const positioningClass = fixed ? "fixed" : "absolute";

  return (
    <>
      <style>{`
        @keyframes leylineBloomA {
          0% { transform: translate3d(-4%, 0%, 0) scale(1); opacity: 0.58; }
          50% { transform: translate3d(4%, -3%, 0) scale(1.07); opacity: 0.78; }
          100% { transform: translate3d(9%, 2%, 0) scale(1.03); opacity: 0.64; }
        }

        @keyframes leylineBloomB {
          0% { transform: translate3d(6%, 2%, 0) scale(1.06); opacity: 0.44; }
          50% { transform: translate3d(-4%, -4%, 0) scale(1.01); opacity: 0.62; }
          100% { transform: translate3d(-8%, 4%, 0) scale(1.1); opacity: 0.48; }
        }

        @keyframes leylineBloomC {
          0% { transform: translate3d(0%, 2%, 0) scale(1); opacity: 0.36; }
          50% { transform: translate3d(3%, -2%, 0) scale(1.08); opacity: 0.52; }
          100% { transform: translate3d(-2%, 4%, 0) scale(1.04); opacity: 0.4; }
        }

        @keyframes leylineHueShift {
          0% { filter: hue-rotate(0deg) saturate(1.03) brightness(1); }
          20% { filter: hue-rotate(10deg) saturate(1.08) brightness(1.02); }
          40% { filter: hue-rotate(-14deg) saturate(1.16) brightness(1.04); }
          60% { filter: hue-rotate(22deg) saturate(1.14) brightness(1.03); }
          80% { filter: hue-rotate(-8deg) saturate(1.08) brightness(1.01); }
          100% { filter: hue-rotate(0deg) saturate(1.03) brightness(1); }
        }

        @keyframes leylinePulse {
          0%, 100% { opacity: 0.2; transform: scale(0.98); }
          50% { opacity: 0.34; transform: scale(1.05); }
        }

        @keyframes leylineDrift {
          0% { transform: translate3d(-1.5%, 0.5%, 0) scale(1.01); }
          50% { transform: translate3d(1.25%, -0.75%, 0) scale(1.03); }
          100% { transform: translate3d(-0.75%, 1%, 0) scale(1.015); }
        }

        @keyframes leylineDash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -260; }
        }

        @keyframes leylineDashSlow {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 320; }
        }

        @keyframes leylineWave {
          0% { transform: translate3d(-1.25%, -0.4%, 0) scale(1); opacity: 0.54; }
          50% { transform: translate3d(1.5%, 0.9%, 0) scale(1.018); opacity: 0.72; }
          100% { transform: translate3d(-0.6%, 1.2%, 0) scale(1.01); opacity: 0.58; }
        }
      `}</style>

      <div className={`${positioningClass} inset-0 pointer-events-none overflow-hidden`}>
        <div className="absolute inset-0 bg-slate-950" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.16),transparent_34%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.12),transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.28)_0%,rgba(2,6,23,0.58)_38%,rgba(2,6,23,0.82)_100%)]" />

        <div className="absolute -inset-[18%] opacity-95">
          <div
            className="absolute -left-[10%] top-[0%] h-[54%] w-[74%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.28)_0%,rgba(34,211,238,0.16)_34%,rgba(16,185,129,0.08)_50%,rgba(0,0,0,0)_74%)] blur-[120px]"
            style={{ animation: "leylineBloomA 24s ease-in-out infinite alternate, leylineHueShift 18s ease-in-out infinite" }}
          />

          <div
            className="absolute right-[-12%] top-[6%] h-[56%] w-[72%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.24)_0%,rgba(45,212,191,0.13)_34%,rgba(59,130,246,0.08)_50%,rgba(0,0,0,0)_74%)] blur-[112px]"
            style={{ animation: "leylineBloomB 30s ease-in-out infinite alternate, leylineHueShift 22s ease-in-out infinite reverse" }}
          />

          <div
            className="absolute left-[6%] bottom-[-10%] h-[48%] w-[68%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.18)_0%,rgba(45,212,191,0.1)_34%,rgba(168,85,247,0.08)_50%,rgba(0,0,0,0)_74%)] blur-[124px]"
            style={{ animation: "leylineBloomC 34s ease-in-out infinite alternate, leylineHueShift 26s ease-in-out infinite" }}
          />
        </div>

        <div className="absolute inset-0 opacity-70">
          <div className="absolute inset-x-[-10%] top-[16%] h-[28%] bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.14)_0%,rgba(52,211,153,0.06)_38%,rgba(0,0,0,0)_72%)] blur-[88px]" />
          <div className="absolute inset-x-[-6%] top-[46%] h-[24%] bg-[radial-gradient(ellipse_at_center,rgba(34,211,238,0.12)_0%,rgba(20,184,166,0.06)_40%,rgba(0,0,0,0)_72%)] blur-[84px]" />
          <div className="absolute inset-x-[-8%] bottom-[2%] h-[24%] bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.1)_0%,rgba(168,85,247,0.05)_42%,rgba(0,0,0,0)_72%)] blur-[88px]" />
        </div>

        <div className="absolute inset-0 opacity-[0.72] mix-blend-screen" style={{ animation: "leylineDrift 26s ease-in-out infinite alternate" }}>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1600 1000"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <g opacity="0.92" style={{ animation: "leylineHueShift 24s ease-in-out infinite" }}>
              <path
                d="M-120 260C180 120 410 138 630 256C820 356 980 430 1220 404C1410 384 1560 286 1720 178"
                stroke="rgba(167,243,208,0.15)"
                strokeWidth="14"
                strokeLinecap="round"
                filter="url(#leylineBlurLg)"
              />
              <path
                d="M-120 260C180 120 410 138 630 256C820 356 980 430 1220 404C1410 384 1560 286 1720 178"
                stroke="rgba(110,231,255,0.34)"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <path
                d="M-120 260C180 120 410 138 630 256C820 356 980 430 1220 404C1410 384 1560 286 1720 178"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
                strokeLinecap="round"
                strokeDasharray="6 18"
                style={{ animation: "leylineDash 18s linear infinite" }}
              />
            </g>

            <g opacity="0.76" style={{ animation: "leylineHueShift 28s ease-in-out infinite reverse" }}>
              <path
                d="M-180 760C122 650 360 616 586 664C760 700 928 776 1128 760C1336 744 1510 662 1750 550"
                stroke="rgba(45,212,191,0.12)"
                strokeWidth="12"
                strokeLinecap="round"
                filter="url(#leylineBlurMd)"
              />
              <path
                d="M-180 760C122 650 360 616 586 664C760 700 928 776 1128 760C1336 744 1510 662 1750 550"
                stroke="rgba(74,222,128,0.24)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <path
                d="M-180 760C122 650 360 616 586 664C760 700 928 776 1128 760C1336 744 1510 662 1750 550"
                stroke="rgba(186,230,253,0.14)"
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeDasharray="4 22"
                style={{ animation: "leylineDash 22s linear infinite reverse" }}
              />
            </g>

            <g opacity="0.62" style={{ animation: "leylineHueShift 32s ease-in-out infinite" }}>
              <path
                d="M220 -120C392 88 542 246 742 350C924 446 1118 474 1362 482C1508 486 1648 530 1770 640"
                stroke="rgba(103,232,249,0.1)"
                strokeWidth="10"
                strokeLinecap="round"
                filter="url(#leylineBlurSm)"
              />
              <path
                d="M220 -120C392 88 542 246 742 350C924 446 1118 474 1362 482C1508 486 1648 530 1770 640"
                stroke="rgba(96,165,250,0.16)"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </g>

            <g opacity="0.58" style={{ animation: "leylineWave 22s ease-in-out infinite, leylineHueShift 20s ease-in-out infinite" }}>
              <path
                d="M-140 500C96 428 286 462 510 562C712 652 910 726 1140 710C1364 694 1548 590 1738 432"
                stroke="rgba(125,211,252,0.1)"
                strokeWidth="11"
                strokeLinecap="round"
                filter="url(#leylineBlurMd)"
              />
              <path
                d="M-140 500C96 428 286 462 510 562C712 652 910 726 1140 710C1364 694 1548 590 1738 432"
                stroke="rgba(45,212,191,0.22)"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <path
                d="M-140 500C96 428 286 462 510 562C712 652 910 726 1140 710C1364 694 1548 590 1738 432"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="0.8"
                strokeLinecap="round"
                strokeDasharray="5 20"
                style={{ animation: "leylineDashSlow 26s linear infinite" }}
              />
            </g>

            <g opacity="0.52" style={{ animation: "leylineWave 30s ease-in-out infinite reverse, leylineHueShift 34s ease-in-out infinite reverse" }}>
              <path
                d="M62 980C204 814 358 702 560 638C760 574 940 560 1154 588C1360 614 1520 578 1710 444"
                stroke="rgba(52,211,153,0.09)"
                strokeWidth="10"
                strokeLinecap="round"
                filter="url(#leylineBlurSm)"
              />
              <path
                d="M62 980C204 814 358 702 560 638C760 574 940 560 1154 588C1360 614 1520 578 1710 444"
                stroke="rgba(196,181,253,0.18)"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </g>

            <g opacity="0.46" style={{ animation: "leylineHueShift 18s ease-in-out infinite" }}>
              <path
                d="M-40 70C168 180 322 246 482 364C632 474 770 598 960 652C1160 708 1374 694 1670 618"
                stroke="rgba(45,212,191,0.08)"
                strokeWidth="8.5"
                strokeLinecap="round"
                filter="url(#leylineBlurSm)"
              />
              <path
                d="M-40 70C168 180 322 246 482 364C632 474 770 598 960 652C1160 708 1374 694 1670 618"
                stroke="rgba(125,211,252,0.16)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </g>

            <defs>
              <filter id="leylineBlurLg" x="-400" y="0" width="2300" height="700" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="20" />
              </filter>
              <filter id="leylineBlurMd" x="-420" y="300" width="2400" height="780" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="16" />
              </filter>
              <filter id="leylineBlurSm" x="-120" y="-260" width="1900" height="1320" filterUnits="userSpaceOnUse">
                <feGaussianBlur stdDeviation="12" />
              </filter>
            </defs>
          </svg>
        </div>

        <div
          className="absolute left-[12%] top-[16%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.24)_0%,rgba(34,211,238,0.12)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 10s ease-in-out infinite, leylineHueShift 16s ease-in-out infinite" }}
        />
        <div
          className="absolute right-[16%] top-[52%] h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.2)_0%,rgba(16,185,129,0.12)_34%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 13s ease-in-out infinite, leylineHueShift 20s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute left-[40%] bottom-[6%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(20,184,166,0.18)_0%,rgba(168,85,247,0.1)_38%,rgba(0,0,0,0)_72%)] blur-3xl"
          style={{ animation: "leylinePulse 16s ease-in-out infinite, leylineHueShift 24s ease-in-out infinite" }}
        />
      </div>
    </>
  );
}
