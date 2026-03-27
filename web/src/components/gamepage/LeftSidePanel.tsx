import type { ReactNode } from "react";
import { Crown, Flag, Mic, MicOff, Shuffle } from "lucide-react";
import SidePanel from "./SidePanel";

type LeftSidePanelProps =
{
  open: boolean;
  onToggle: () => void;
  hostName?: string;
  isHost: boolean;
  playerCount: number;
  maxPlayers: number;
  randomizingOrder?: boolean;
  endingGame?: boolean;
  micEnabled: boolean;
  onRandomizePlayerOrder?: () => void;
  onEndGame?: () => void;
  onToggleSelfMic?: () => void;
};

export default function LeftSidePanel({
  open,
  onToggle,
  hostName,
  isHost,
  randomizingOrder = false,
  endingGame = false,
  micEnabled,
  onRandomizePlayerOrder,
  onEndGame,
  onToggleSelfMic,
}: LeftSidePanelProps)
{
  return (
    <SidePanel
      side="left"
      open={open}
      title="Game Settings"
      onToggle={onToggle}
    >
      <div className="mt-4 flex h-[calc(100vh-150px)] min-h-0 flex-col gap-4">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.03] p-4 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Host
              </div>

              <div className="mt-2 truncate text-base font-semibold text-slate-100">
                {hostName || "Unknown"}
              </div>
            </div>

            <div
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${
                isHost
                  ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  : "border-white/10 bg-white/[0.04] text-slate-300"
              }`}
            >
              <Crown className="h-5 w-5" />
            </div>
          </div>
        </section>

        <section
          className={`rounded-3xl border p-4 transition ${
            isHost
              ? "border-white/10 bg-black/20"
              : "border-white/10 bg-black/10 opacity-80"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-100">
              Host Controls
            </div>
          </div>

          <div className="space-y-3">
            <ControlCard
              title="Randomize Player Order"
              icon={<Shuffle className="h-4 w-4" />}
              buttonLabel={randomizingOrder ? "Rolling..." : "Shuffle Order"}
              disabled={!isHost || !onRandomizePlayerOrder || randomizingOrder}
              onClick={onRandomizePlayerOrder}
              tone="teal"
            />

            <ControlCard
              title="End Game"
              icon={<Flag className="h-4 w-4" />}
              buttonLabel={endingGame ? "Ending..." : "End Game"}
              disabled={!isHost || !onEndGame || endingGame}
              onClick={onEndGame}
              tone="neutral"
            />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 text-sm font-semibold text-slate-100">
            Player Options
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-100">
                  Microphone
                </div>
              </div>

              <div
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  micEnabled
                    ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                    : "border-red-400/20 bg-red-500/10 text-red-200"
                }`}
              >
                {micEnabled ? "Live" : "Muted"}
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleSelfMic}
              disabled={!onToggleSelfMic}
              className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                micEnabled
                  ? "border-white/10 bg-white/[0.05] text-slate-100 hover:border-red-400/35 hover:bg-red-500/12 hover:text-red-100"
                  : "border-white/10 bg-white/[0.05] text-slate-100 hover:border-emerald-400/35 hover:bg-emerald-500/12 hover:text-emerald-100"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {micEnabled ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {micEnabled ? "Mute Microphone" : "Unmute Microphone"}
            </button>
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
  description: string;
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
          <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>

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