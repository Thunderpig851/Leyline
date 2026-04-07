import { Moon, Sun, SunMoon } from "lucide-react";

type DayNightState = "day" | "night" | null | undefined;

type DayNightToggleProps =
{
  value: DayNightState;
  disabled?: boolean;
  onToggle?: () => void;
};

export default function DayNightToggle({
  value,
  disabled = false,
  onToggle,
}: DayNightToggleProps)
{
  const isDay = value === "day";
  const isNight = value === "night";
  const isUnset = !isDay && !isNight;

  const outerClass = isDay
    ? "border-amber-300/35 bg-amber-400/14 text-amber-100 hover:border-amber-200/60 hover:bg-amber-400/20"
    : isNight
      ? "border-indigo-300/35 bg-indigo-400/14 text-indigo-100 hover:border-indigo-200/60 hover:bg-indigo-400/20"
      : "border-white/10 bg-white/[0.05] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]";

  const iconClass = isDay
    ? "border-amber-200/30 bg-amber-300/12"
    : isNight
      ? "border-indigo-200/30 bg-indigo-300/12"
      : "border-white/10 bg-black/20";

  const label = isDay ? "Day" : isNight ? "Night" : "Day / Night";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      title={isUnset ? "Set day/night" : `Currently ${value}. Click to toggle.`}
      aria-label={isUnset ? "Set day or night" : `Current state ${value}. Click to toggle.`}
      className={`group relative inline-flex h-14 w-full items-center justify-center rounded-2xl border text-sm font-semibold transition ${outerClass} disabled:cursor-not-allowed disabled:opacity-70`}
    >
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition ${iconClass}`}
      >
        {isDay ? (
          <Sun className="h-5 w-5" />
        ) : isNight ? (
          <Moon className="h-5 w-5" />
        ) : (
          <SunMoon className="h-5 w-5" />
        )}
      </span>

      <span className="pointer-events-none absolute -bottom-10 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-slate-950/96 px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-slate-100 opacity-0 shadow-[0_14px_30px_rgba(0,0,0,0.45)] transition-all duration-150 group-hover:-translate-y-1 group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}
