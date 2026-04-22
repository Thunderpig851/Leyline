import { useMemo, type ReactNode } from "react";
import {
  Check,
  Coffee,
  Copy,
  KeyRound,
  Mic,
  MicOff,
  Moon,
  RotateCcw,
  Shuffle,
  Skull,
  Sun,
  SunMoon,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import SidePanel from "./SidePanel";

type LeftSidePanelProps =
{
  open: boolean;
  onToggle: () => void;
  isHost: boolean;
  currentHostName?: string;
  roomVisibility?: "public" | "private";
  hostPrivateCode?: string | null;
  privateCodeCopiedMessage?: string | null;
  playerCount: number;
  maxPlayers: number;
  spectatorCount?: number;
  maxSpectators?: number;
  showLocalMediaControls?: boolean;
  showSeatStateControls?: boolean;
  randomizingOrder?: boolean;
  resettingGame?: boolean;
  endingGame?: boolean;
  dayNightState?: "day" | "night" | null;
  isReady?: boolean;
  isAway?: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  onRandomizePlayerOrder?: () => void;
  onResetGame?: () => void;
  onEndGame?: () => void;
  onToggleDayNight?: () => void;
  onToggleReady?: () => void;
  onToggleAway?: () => void;
  onToggleSelfMic?: () => void;
  onToggleSelfCam?: () => void;
  onCopyPrivateCode?: () => void;
};

export default function LeftSidePanel({
  open,
  onToggle,
  isHost,
  currentHostName = "",
  roomVisibility = "public",
  hostPrivateCode = null,
  privateCodeCopiedMessage = null,
  playerCount,
  maxPlayers,
  spectatorCount = 0,
  maxSpectators = 4,
  showLocalMediaControls = true,
  showSeatStateControls = false,
  randomizingOrder = false,
  resettingGame = false,
  endingGame = false,
  dayNightState = null,
  isReady = false,
  isAway = false,
  micEnabled,
  camEnabled,
  onRandomizePlayerOrder,
  onResetGame,
  onEndGame,
  onToggleDayNight,
  onToggleReady,
  onToggleAway,
  onToggleSelfMic,
  onToggleSelfCam,
  onCopyPrivateCode,
}: LeftSidePanelProps)
{
  const dayNightIcon = dayNightState === "day"
    ? <Sun className="h-4 w-4" />
    : dayNightState === "night"
      ? <Moon className="h-4 w-4" />
      : <SunMoon className="h-4 w-4" />;

  const readyTone = useMemo(() =>
  {
    if (isAway)
    {
      return "away" as const;
    }

    return isReady ? "active" as const : "danger" as const;
  }, [isAway, isReady]);

  const readyLabel = isReady ? "Ready" : "Not Ready";
  const awayLabel = isAway ? "Back at Table" : "Step Away";

  return (
    <SidePanel
      side="left"
      open={open}
      title=""
      onToggle={onToggle}
    >
      <div className="mt-4 flex h-[calc(100vh-150px)] min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <section className="rounded-3xl border border-teal-400/15 bg-slate-950/52 p-4 shadow-[0_14px_40px_rgba(2,8,23,0.28)]">
          <div className="mb-3 rounded-2xl border border-teal-400/14 bg-slate-950/70 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-100/70">
              Current Host
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {currentHostName || "Unknown"}
            </div>
            <div className="mt-1 text-xs text-slate-300/85">
              {playerCount}/{maxPlayers} players seated
            </div>
            <div className="mt-1 text-xs text-slate-400/80">
              {spectatorCount}/{maxSpectators} spectators
            </div>
          </div>

          {isHost && roomVisibility === "private" && hostPrivateCode ? (
            <div className="mb-3 overflow-hidden rounded-2xl border border-teal-400/18 bg-teal-500/10 shadow-[0_18px_50px_-30px_rgba(20,184,166,0.55)]">
              <div className="border-b border-teal-400/12 bg-gradient-to-r from-emerald-400/14 via-teal-400/12 to-cyan-300/10 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-teal-100/90">
                  <KeyRound className="h-3.5 w-3.5 text-teal-200" />
                  Access Code
                </div>
              </div>

              <div className="p-4">
                <div className="rounded-2xl border border-teal-400/15 bg-slate-950/82 px-4 py-4 text-center text-2xl font-semibold tracking-[0.45em] text-slate-50">
                  {hostPrivateCode}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onCopyPrivateCode}
                    disabled={!onCopyPrivateCode}
                    className="inline-flex items-center gap-2 rounded-xl border border-teal-400/24 bg-slate-950/72 px-3 py-2 text-xs font-medium text-slate-200 shadow-[0_10px_24px_rgba(2,8,23,0.18)] transition-all duration-150 hover:-translate-y-0.5 hover:border-teal-300/45 hover:bg-teal-400/12 hover:text-teal-50 hover:shadow-[0_14px_30px_rgba(20,184,166,0.18)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy Code
                  </button>

                  {privateCodeCopiedMessage ? (
                    <div className="text-xs text-teal-100">{privateCodeCopiedMessage}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {isHost ? (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-100/70">
                Host Actions
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-10">
                <IconActionButton
                  label={randomizingOrder ? "Rolling..." : "Shuffle Order"}
                  icon={<Shuffle className="h-4 w-4" />}
                  disabled={!onRandomizePlayerOrder || randomizingOrder}
                  onClick={onRandomizePlayerOrder}
                />
                <IconActionButton
                  label={resettingGame ? "Resetting..." : "Reset Game"}
                  icon={<RotateCcw className="h-4 w-4" />}
                  disabled={!onResetGame || resettingGame || endingGame}
                  onClick={onResetGame}
                />
                <IconActionButton
                  label={endingGame ? "Ending..." : "End Game"}
                  icon={<Skull className="h-4 w-4" />}
                  disabled={!onEndGame || endingGame || resettingGame}
                  onClick={onEndGame}
                  tone="danger"
                />
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-teal-400/15 bg-slate-950/52 p-4 shadow-[0_14px_40px_rgba(2,8,23,0.28)]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-100/70">
            Player Options
          </div>

          <div className="grid grid-cols-3 gap-x-3 gap-y-10">
            {showSeatStateControls ? (
              <>
                <IconActionButton
                  label={readyLabel}
                  icon={isReady ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  disabled={!onToggleReady}
                  onClick={onToggleReady}
                  tone={readyTone}
                />
                <IconActionButton
                  label={awayLabel}
                  icon={<Coffee className="h-4 w-4" />}
                  disabled={!onToggleAway}
                  onClick={onToggleAway}
                  tone={isAway ? "away" : "default"}
                />
              </>
            ) : null}

            <IconActionButton
              label={dayNightState === "day" ? "Day" : dayNightState === "night" ? "Night" : "Day / Night"}
              icon={dayNightIcon}
              disabled={!onToggleDayNight}
              onClick={onToggleDayNight}
              tone={dayNightState === "day" ? "sun" : dayNightState === "night" ? "night" : "default"}
            />

            {showLocalMediaControls ? (
              <>
                <IconActionButton
                  label={micEnabled ? "Mic On" : "Mic Off"}
                  icon={micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  disabled={!onToggleSelfMic}
                  onClick={onToggleSelfMic}
                  tone={micEnabled ? "active" : "danger"}
                />
                <IconActionButton
                  label={camEnabled ? "Camera On" : "Camera Off"}
                  icon={camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  disabled={!onToggleSelfCam}
                  onClick={onToggleSelfCam}
                  tone={camEnabled ? "active" : "danger"}
                />
              </>
            ) : (
              <div className="col-span-2 rounded-2xl border border-teal-400/14 bg-slate-950/72 px-3 py-3 text-sm text-slate-300">
                Spectators can watch the table, but they do not publish mic or camera.
              </div>
            )}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}

function IconActionButton({
  label,
  icon,
  disabled,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick?: () => void;
  tone?: "default" | "active" | "danger" | "sun" | "night" | "away";
})
{
  const toneClass =
    tone === "active"
      ? "bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/20 hover:border-emerald-300/45 hover:shadow-[0_14px_28px_rgba(16,185,129,0.18)]"
      : tone === "danger"
        ? "bg-red-500/10 text-red-100 hover:bg-red-500/18 hover:border-red-300/45 hover:shadow-[0_14px_28px_rgba(239,68,68,0.18)]"
        : tone === "sun"
          ? "bg-amber-400/12 text-amber-100 hover:bg-amber-400/20 hover:border-amber-300/45 hover:shadow-[0_14px_28px_rgba(251,191,36,0.18)]"
          : tone === "night"
            ? "bg-indigo-400/12 text-indigo-100 hover:bg-indigo-400/20 hover:border-indigo-300/45 hover:shadow-[0_14px_28px_rgba(99,102,241,0.18)]"
            : tone === "away"
              ? "bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/18 hover:border-cyan-300/45 hover:shadow-[0_14px_28px_rgba(34,211,238,0.18)]"
            : "bg-slate-900/74 text-slate-100 hover:bg-teal-400/12 hover:border-teal-300/45 hover:shadow-[0_14px_28px_rgba(20,184,166,0.18)]";

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() =>
        {
          onClick?.();
          if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement)
          {
            document.activeElement.blur();
          }
        }}
        disabled={disabled}
        className={`inline-flex h-12 w-full items-center justify-center rounded-2xl border border-teal-400/24 ${toneClass} shadow-[0_8px_22px_rgba(2,8,23,0.22)] transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-45`}
        title={label}
        aria-label={label}
      >
        {icon}
      </button>

      <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-teal-400/18 bg-slate-950/96 px-2 py-1 text-[11px] font-medium text-teal-100 opacity-0 shadow-[0_10px_24px_rgba(2,8,23,0.32)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </div>
    </div>
  );
}
