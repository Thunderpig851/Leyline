import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Side = "left" | "right";

type SidePanelProps =
{
  side: Side;
  open: boolean;
  width?: string;
  title: string;
  description?: string;
  onToggle: () => void;
  children?: React.ReactNode;
};

export default function SidePanel({
  side,
  open,
  width = "clamp(260px, 22vw, 360px)",
  title,
  description,
  onToggle,
  children,
}: SidePanelProps)
{
  const isLeft = side === "left";

  return (
    <aside
      className={`absolute top-0 z-30 h-full overflow-visible backdrop-blur-md transition-transform duration-200
        ${isLeft ? "left-0 border-r" : "right-0 border-l"}
        border-teal-400/15 bg-slate-950/68 shadow-[0_20px_50px_rgba(2,8,23,0.42)] ring-1 ring-teal-300/10`}
      style={{
        width,
        transform: open
          ? "translateX(0)"
          : isLeft
            ? "translateX(-100%)"
            : "translateX(100%)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={
          open
            ? `Collapse ${side} panel`
            : `Expand ${side} panel`
        }
        className={`absolute top-1/2 z-40 -translate-y-1/2 rounded-xl border px-1.5 py-2 text-slate-100 transition-all duration-150 hover:scale-[1.03]
          ${open
            ? "border-teal-300/38 bg-slate-950/86 shadow-[0_0_18px_rgba(20,184,166,0.18),0_0_34px_rgba(16,185,129,0.10)] hover:border-teal-200/55 hover:bg-slate-900/95 hover:shadow-[0_0_24px_rgba(45,212,191,0.26),0_0_44px_rgba(16,185,129,0.14)]"
            : "border-teal-300/55 bg-teal-400/20 shadow-[0_0_24px_rgba(45,212,191,0.28),0_0_46px_rgba(16,185,129,0.14)] hover:border-emerald-300/70 hover:bg-emerald-400/22 hover:shadow-[0_0_28px_rgba(45,212,191,0.34),0_0_54px_rgba(16,185,129,0.18)]"
          }
          ${isLeft ? "right-[-14px]" : "left-[-14px]"}`}
      >
        {isLeft
          ? (open ? <ChevronLeft size={15} /> : <ChevronRight size={15} />)
          : (open ? <ChevronRight size={15} /> : <ChevronLeft size={15} />)}
      </button>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-teal-400/[0.05] via-transparent to-emerald-400/[0.03]" />

      <div className={`relative h-full p-4 ${isLeft ? "pr-7" : "pl-7"}`}>
        {title || description ? (
          <div className="pb-2">
            {title ? <div className="text-xs font-semibold text-slate-100">{title}</div> : null}
            {description ? (
              <div className="mt-2 text-xs text-slate-400">
                {description}
              </div>
            ) : null}
          </div>
        ) : null}

        {children}
      </div>
    </aside>
  );
}
