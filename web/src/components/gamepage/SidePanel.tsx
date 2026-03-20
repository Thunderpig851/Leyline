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
      className={`absolute top-0 z-30 h-full overflow-visible backdrop-blur transition-transform duration-200
        ${isLeft ? "left-0 border-r" : "right-0 border-l"}
        border-white/10 bg-slate-950/90 ring-1 ring-white/5`}
      style={{
        width,
        transform: open
          ? "translateX(0)"
          : isLeft
            ? "translateX(calc(-100% + 20px))"
            : "translateX(calc(100% - 20px))",
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
        className={`absolute top-1/2 z-40 -translate-y-1/2 rounded-full border border-teal-300/30 bg-slate-900/90 p-2 text-slate-200
          shadow-lg shadow-black/30 backdrop-blur transition-all duration-150
          hover:border-teal-200 hover:bg-teal-300 hover:text-slate-900 hover:shadow-teal-400/25
          ${isLeft ? "right-2" : "left-2"}`}
      >
        {isLeft
          ? (open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />)
          : (open ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)}
      </button>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-white/5 to-transparent opacity-80" />

      <div className={`relative p-4 ${isLeft ? "pr-12" : "pl-12"}`}>
        <div className="text-xs font-semibold text-slate-100">{title}</div>

        {description && (
          <div className="mt-2 text-xs text-slate-400">
            {description}
          </div>
        )}

        {children}
      </div>
    </aside>
  );
}