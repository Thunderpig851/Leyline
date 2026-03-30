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
    ? "border-amber-300/30 bg-amber-400/12 text-amber-100"
    : isNight
      ? "border-indigo-300/30 bg-indigo-400/12 text-indigo-100"
      : "border-white/10 bg-white/[0.05] text-slate-200";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs font-semibold transition ${outerClass} disabled:cursor-not-allowed disabled:opacity-70`}
      title={isUnset ? "Set day/night" : `Currently ${value}. Click to toggle.`}
      aria-label={isUnset ? "Set day or night" : `Current state ${value}. Click to toggle.`}
    >
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
          isDay
            ? "border-amber-200/30 bg-amber-300/12"
            : isNight
              ? "border-indigo-200/30 bg-indigo-300/12"
              : "border-white/10 bg-black/20"
        }`}
      >
        {isDay ? (
          <Sun className="h-4 w-4" />
        ) : isNight ? (
          <Moon className="h-4 w-4" />
        ) : (
          <SunMoon className="h-4 w-4" />
        )}
      </span>

      <span className="hidden sm:inline">
        {isDay ? "Day" : isNight ? "Night" : "Day / Night"}
      </span>
    </button>
  );
}