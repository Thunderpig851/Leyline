import { Dices, Shuffle } from "lucide-react";
import type { CSSProperties } from "react";

type PlayerOrderShuffleOverlayProps =
{
  open: boolean;
  phase: "rolling" | "result";
  rollingLabel: string;
  finalOrder: string[];
};

const d12Style: CSSProperties =
{
  clipPath:
    "polygon(50% 0%, 74% 6%, 92% 24%, 100% 50%, 92% 76%, 74% 94%, 50% 100%, 26% 94%, 8% 76%, 0% 50%, 8% 24%, 26% 6%)",
};

export default function PlayerOrderShuffleOverlay({
  open,
  phase,
  rollingLabel,
  finalOrder,
}: PlayerOrderShuffleOverlayProps)
{
  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/42 backdrop-blur-sm">
      <div className="w-[min(560px,90vw)] rounded-[32px] border border-white/10 bg-slate-950/92 px-6 py-7 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        <div className="mx-auto flex flex-col items-center text-center">
          <div
            className={`flex h-28 w-28 items-center justify-center border border-teal-300/25 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.22),rgba(15,23,42,0.96))] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_50px_rgba(13,148,136,0.18)] ${phase === "rolling" ? "animate-spin" : ""}`}
            style={d12Style}
          >
            {phase === "rolling"
              ? <Dices className="h-10 w-10 text-teal-100" />
              : <Shuffle className="h-10 w-10 text-teal-100" />}
          </div>

          <div className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-teal-200/80">
            {phase === "rolling" ? "Randomizing Player Order" : "New Player Order"}
          </div>

          <div className="mt-3 min-h-[3.5rem] text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {phase === "rolling" ? rollingLabel : "Order Set"}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {finalOrder.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-slate-100"
              >
                <span className="mr-2 text-slate-400">{index + 1}.</span>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}