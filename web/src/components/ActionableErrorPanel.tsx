import type { MouseEventHandler } from "react";

type ActionableErrorPanelProps =
{
  message: string;
  tone?: "danger" | "accent";
  actionLabel?: string;
  onAction?: MouseEventHandler<HTMLButtonElement>;
  actionHref?: string;
};

export default function ActionableErrorPanel(
{
  message,
  tone = "danger",
  actionLabel,
  onAction,
  actionHref,
}: ActionableErrorPanelProps)
{
  const toneClass = tone === "accent"
    ? "border-teal-400/35 bg-teal-500/10 text-teal-100"
    : "border-red-400/35 bg-red-500/12 text-red-100";

  const buttonClass = tone === "accent"
    ? "border-teal-300/30 bg-slate-950/45 text-teal-50 hover:border-teal-200/50 hover:bg-white/5"
    : "border-white/10 bg-slate-950/45 text-slate-100 hover:bg-white/5";

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{message}</div>

        {actionLabel ? (
          actionHref ? (
            <a
              href={actionHref}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${buttonClass}`}
            >
              {actionLabel}
            </a>
          ) : (
            <button
              type="button"
              onClick={onAction}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${buttonClass}`}
            >
              {actionLabel}
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
