import type { ReactNode } from "react";
import {
  Copy,
  KeyRound,
  Skull,
  Mic,
  MicOff,
  RotateCcw,
  Shuffle,
  Video,
  VideoOff,
} from "lucide-react";
import SidePanel from "./SidePanel";
import DayNightToggle from "./DayNightToggle";

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
  randomizingOrder?: boolean;
  resettingGame?: boolean;
  endingGame?: boolean;
  dayNightState?: "day" | "night" | null;
  micEnabled: boolean;
  camEnabled: boolean;
  onRandomizePlayerOrder?: () => void;
  onResetGame?: () => void;
  onEndGame?: () => void;
  onToggleDayNight?: () => void;
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
  randomizingOrder = false,
  resettingGame = false,
  endingGame = false,
  dayNightState = null,
  micEnabled,
  camEnabled,
  onRandomizePlayerOrder,
  onResetGame,
  onEndGame,
  onToggleDayNight,
  onToggleSelfMic,
  onToggleSelfCam,
  onCopyPrivateCode,
}: LeftSidePanelProps)
{
  const micButtonClass = micEnabled
    ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-500/18"
    : "border-red-400/25 bg-red-500/12 text-red-100 hover:border-red-300/45 hover:bg-red-500/18";

  const camButtonClass = camEnabled
    ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-100 hover:border-emerald-200/45 hover:bg-emerald-500/18"
    : "border-red-400/25 bg-red-500/12 text-red-100 hover:border-red-300/45 hover:bg-red-500/18";

  return (
    <SidePanel
      side="left"
      open={open}
      title=""
      onToggle={onToggle}
    >
      <div className="mt-4 flex h-[calc(100vh-150px)] min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <section
          className={`rounded-3xl border p-4 transition ${
            isHost
              ? "border-white/10 bg-black/20"
              : "border-white/10 bg-black/10"
          }`}
        >
          <div className="mb-3 rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Current Host:
            </div>
            <div className="mt-1 text-sm font-medium text-slate-100">
              {currentHostName || "Unknown"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {playerCount}/{maxPlayers} players seated
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {spectatorCount}/{maxSpectators} spectators
            </div>
          </div>

          {isHost && roomVisibility === "private" && hostPrivateCode ? (
            <div className="mb-3 overflow-hidden rounded-2xl border border-teal-300/20 bg-teal-500/10 shadow-[0_18px_50px_-30px_rgba(20,184,166,0.65)]">
              <div className="border-b border-white/10 bg-gradient-to-r from-emerald-400/14 via-teal-400/12 to-cyan-300/10 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-teal-100/90">
                  <KeyRound className="h-3.5 w-3.5 text-teal-200" />
                  Access Code
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-center text-2xl font-semibold tracking-[0.45em] text-slate-50">
                  {hostPrivateCode}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onCopyPrivateCode}
                    disabled={!onCopyPrivateCode}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="space-y-.5">
            <ControlCard
              title=""
              description=""
              icon={<Shuffle className="h-4 w-4" />}
              buttonLabel={randomizingOrder ? "Rolling..." : "Shuffle Order"}
              disabled={!isHost || !onRandomizePlayerOrder || randomizingOrder}
              onClick={onRandomizePlayerOrder}
              tone="teal"
            />

            <ControlCard
              title=""
              description=""
              icon={<RotateCcw className="h-4 w-4" />}
              buttonLabel={resettingGame ? "Resetting..." : "Reset Game"}
              disabled={!isHost || !onResetGame || resettingGame || endingGame}
              onClick={onResetGame}
              tone="teal"
            />

            <ControlCard
              title=""
              description=""
              icon={<Skull className="h-4 w-4" />}
              buttonLabel={endingGame ? "Ending..." : "End Game"}
              disabled={!isHost || !onEndGame || endingGame || resettingGame}
              onClick={onEndGame}
              tone="neutral"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-100">
            Player Options
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">
                    Shared Markers
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <DayNightToggle
                  value={dayNightState}
                  disabled={!onToggleDayNight}
                  onToggle={onToggleDayNight}
                />
              </div>
            </div>

            {showLocalMediaControls ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      Media
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={onToggleSelfMic}
                    disabled={!onToggleSelfMic}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${micButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {micEnabled ? "Mic On" : "Mic Off"}
                  </button>

                  <button
                    type="button"
                    onClick={onToggleSelfCam}
                    disabled={!onToggleSelfCam}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${camButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    {camEnabled ? "Screen On" : "Screen Off"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3 text-sm text-slate-300">
                Spectators can watch the table, but they do not publish mic or camera.
              </div>
            )}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}

function ControlCard({
  title,
  description,
  icon,
  buttonLabel,
  disabled,
  onClick,
  tone,
}: {
  title: string;
  description?: string;
  icon: ReactNode;
  buttonLabel: string;
  disabled: boolean;
  onClick?: () => void;
  tone: "teal" | "neutral";
})
{
  const buttonClass =
    tone === "teal"
      ? "border-teal-300/25 bg-teal-400/10 text-teal-100 hover:border-teal-200/45 hover:bg-teal-400/16"
      : "border-white/10 bg-white/[0.05] text-slate-100 hover:border-red-400/35 hover:bg-red-500/12 hover:text-red-100";

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-100">{title}</div>

          {description ? (
            <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
          ) : null}

          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`mt-3 inline-flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition ${buttonClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
