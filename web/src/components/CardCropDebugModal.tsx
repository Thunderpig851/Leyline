import type { CardIdentificationPreview, IdentifiedCardCandidate } from "../card-id/identifyCard";

type Props = {
  open: boolean;
  frameUrl: string | null;
  roiDebugUrl: string | null;
  candidateUrl: string | null;
  ocrPreviews?: CardIdentificationPreview[];
  statusText?: string;
  titleSignal?: string;
  signalsSummary?: string;
  candidates?: IdentifiedCardCandidate[];
  loading?: boolean;
  identifying?: boolean;
  onClose: () => void;
};

export default function CardCropDebugModal({
  open,
  frameUrl,
  roiDebugUrl,
  candidateUrl,
  ocrPreviews = [],
  statusText = "Click a card to capture it",
  titleSignal = "",
  signalsSummary = "",
  candidates = [],
  loading = false,
  identifying = false,
  onClose,
}: Props)
{
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] bg-slate-950/72 p-1 md:p-1.5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[calc(100vh-0.25rem)] w-full max-w-[980px] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-2 py-1.5">
          <div>
            <div className="text-[13px] font-semibold tracking-tight text-slate-100">
              Card capture debug
            </div>
            <div className="mt-0.5 text-[10px] leading-4 text-slate-400">
              {loading
                ? "Capturing local crop"
                : identifying
                  ? "Reading title band"
                  : statusText}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-slate-100"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-1 p-1.5 lg:grid-cols-4">
            <PreviewPane
              title="Source frame"
              src={frameUrl}
              alt="Source frame"
            />

            <PreviewPane
              title="ROI refinement"
              src={roiDebugUrl}
              alt="ROI refinement"
            />

            <PreviewPane
              title="Refined card candidate"
              src={candidateUrl}
              alt="Refined card candidate"
              emphasized
            />

            <PreviewPane
              title={ocrPreviews[0]?.label || "Name band"}
              src={ocrPreviews[0]?.url || null}
              alt="Name band"
            />

          </div>

          <div className="grid gap-1.5 border-t border-white/10 px-1.5 py-1.5 lg:grid-cols-[minmax(0,190px)_minmax(0,1fr)]">
            <div className="space-y-1">
              <SignalRow label="Name signal" value={titleSignal} />
              <SignalRow label="Summary" value={signalsSummary || statusText} multiline />
            </div>

            <div>
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Likely matches
              </div>

              {candidates.length > 0 ? (
                <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {candidates.map((candidate) => (
                    <a
                      key={candidate.id}
                      href={candidate.scryfallUri || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-stretch gap-1.5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-1 transition hover:border-emerald-400/40 hover:bg-white/[0.05]"
                    >
                      <div className="aspect-[5/7] w-12 shrink-0 overflow-hidden rounded-md bg-black/30">
                        {candidate.imageUrl ? (
                          <img
                            src={candidate.imageUrl}
                            alt={candidate.name}
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                          />
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="truncate text-[11px] font-semibold text-slate-100">
                          {candidate.name}
                        </div>
                        <div className="grid grid-cols-2 gap-1 pt-0.5 text-[8px] text-slate-400">
                          <ScorePill label="Name" value={candidate.titleSimilarity} />
                          <ScorePill label="Total" value={candidate.score} emphasized />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-4 py-4 text-center text-[11px] text-slate-500">
                  {identifying ? "Looking for likely matches" : "No likely matches yet"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  title,
  src,
  alt,
  emphasized = false,
}: {
  title: string;
  src: string | null;
  alt: string;
  emphasized?: boolean;
})
{
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </div>

      <div className={`flex ${emphasized ? "min-h-[136px]" : "min-h-[92px]"} items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/20`}>
        {src ? (
          <img
            src={src}
            alt={alt}
            className={`block w-full object-contain ${emphasized ? "max-h-[150px]" : "max-h-[104px]"}`}
          />
        ) : (
          <div className="px-3 text-center text-[10px] text-slate-500">
            Waiting for image
          </div>
        )}
      </div>
    </div>
  );
}

function SignalRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
})
{
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 ${multiline ? "text-[10px] leading-3.5" : "text-[11px]"} text-slate-200`}>
        {value || "—"}
      </div>
    </div>
  );
}

function ScorePill({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
})
{
  const percentage = `${Math.round((Number.isFinite(value) ? value : 0) * 100)}%`;

  return (
    <div className={`rounded-md border px-1.5 py-0.5 ${emphasized ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[0.03] text-slate-300"}`}>
      <span className="mr-1 text-slate-500">{label}</span>
      <span>{percentage}</span>
    </div>
  );
}
