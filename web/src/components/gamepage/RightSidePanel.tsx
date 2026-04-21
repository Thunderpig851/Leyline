import React, { useEffect, useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Search,
} from "lucide-react";
import type { IdentifiedCardCandidate } from "../../card-id/identifyCard";
import SidePanel from "./SidePanel";
import RoomChatWidget from "./RoomChatWidget";
import ScryfallSearchPanel from "./ScryfallSearchPanel";

type PanelTab = "card-log" | "chat" | "search";

type CardLogEntry = {
  entryId: string;
  candidate: IdentifiedCardCandidate;
  titleSignal: string;
  signalsSummary: string;
  detectedAt: number;
};

type RightSidePanelProps =
{
  open: boolean;
  onToggle: () => void;
  roomId: string;
  cardLogEntries?: CardLogEntry[];
  focusCardLogKey?: number;
  width?: string;
};

export default function RightSidePanel({
  open,
  onToggle,
  roomId,
  cardLogEntries = [],
  focusCardLogKey = 0,
  width = "clamp(280px, 22.7vw, 413px)",
}: RightSidePanelProps)
{
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");

  useEffect(() =>
  {
    if (focusCardLogKey > 0)
    {
      setActiveTab("card-log");
    }
  }, [focusCardLogKey]);

  return (
    <SidePanel
      side="right"
      open={open}
      width={width}
      title=""
      description=""
      onToggle={onToggle}
    >
      <div className="mt-4 flex h-[calc(100%-1rem)] min-h-0 flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <WidgetTile
            active={activeTab === "card-log"}
            label="Cards"
            icon={<BookOpen size={30} />}
            onClick={() => setActiveTab("card-log")}
          />
          <WidgetTile
            active={activeTab === "chat"}
            label="Chat"
            icon={<MessageSquare size={30} />}
            onClick={() => setActiveTab("chat")}
          />
          <WidgetTile
            active={activeTab === "search"}
            label="Search"
            icon={<Search size={30} />}
            onClick={() => setActiveTab("search")}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-3xl border border-teal-400/15 bg-gradient-to-b from-teal-400/[0.06] to-slate-950/72 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
          {activeTab === "card-log" && <CardLogPanel entries={cardLogEntries} />}
          {activeTab === "chat" && <RoomChatWidget roomId={roomId} />}
          {activeTab === "search" && <ScryfallSearchPanel />}
        </div>
      </div>
    </SidePanel>
  );
}

function WidgetTile({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
})
{
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex aspect-[1.05/1] flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all duration-150 hover:-translate-y-0.5 hover:scale-[1.01] ${
        active
          ? "border-teal-300/34 bg-teal-400/15 text-teal-100 shadow-lg shadow-teal-950/24"
          : "border-teal-400/18 bg-slate-950/62 text-slate-300 hover:border-teal-300/38 hover:bg-teal-400/12 hover:text-slate-100 hover:shadow-[0_14px_28px_rgba(20,184,166,0.16)]"
      }`}
    >
      <div
        className={`mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border transition-all ${
          active
            ? "border-teal-300/24 bg-teal-400/10"
            : "border-teal-400/16 bg-black/24 group-hover:border-teal-300/34 group-hover:bg-teal-400/10"
        }`}
      >
        {icon}
      </div>

      <div className="text-xs font-semibold tracking-wide">{label}</div>
    </button>
  );
}

function CardLogPanel({ entries }: { entries: CardLogEntry[] })
{
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const stackedEntries = [...entries];
  const stackBaseHeight = 344;
  const stackStepHeight = 104;
  const stackMinHeight = stackBaseHeight + Math.max(0, stackedEntries.length - 1) * stackStepHeight;

  if (entries.length === 0)
  {
    return (
      <div className="p-5">
        <div className="rounded-3xl border border-dashed border-teal-400/16 bg-black/20 p-6">
          <div className="text-sm font-semibold text-slate-100">Card Log</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/8 px-5 py-4">
        <div className="flex items-center justify-center">
          <div className="text-center text-sm font-semibold text-slate-100">Card Log</div>
        </div>
      </div>

      <div className="panel-scrollbar min-h-0 flex-1 overflow-y-scroll overscroll-contain px-5 py-5 pr-3">
        <div
          className="relative mx-auto flex w-full max-w-[218px] flex-col items-center pb-8 pt-2"
          style={{ minHeight: stackMinHeight }}
        >
          {stackedEntries.map((entry, index) =>
          {
            const hovered = hoveredEntryId === entry.entryId;
            const scryfallHref = entry.candidate.scryfallUri || undefined;
            const purchaseHref = entry.candidate.tcgplayerUri || undefined;
            const priceLabel = entry.candidate.tcgplayerPrice
              ? `$${entry.candidate.tcgplayerPrice}`
              : "";

            return (
              <div
                key={entry.entryId}
                onMouseEnter={() => setHoveredEntryId(entry.entryId)}
                onMouseLeave={() => setHoveredEntryId((current) => current === entry.entryId ? null : current)}
                onFocus={() => setHoveredEntryId(entry.entryId)}
                onBlur={() => setHoveredEntryId((current) => current === entry.entryId ? null : current)}
                className="relative block w-full overflow-hidden rounded-[1.55rem] border border-white/10 bg-slate-950/96 shadow-[0_18px_40px_rgba(0,0,0,0.38)] transition-all duration-200"
                style={{
                  marginTop: index === 0 ? 0 : -236,
                  transform: hovered
                    ? "translate3d(0, -10px, 0) scale(1.04)"
                    : "translate3d(0, 0, 0) scale(1)",
                  zIndex: hovered ? 200 : index + 1,
                }}
              >
                <a
                  href={scryfallHref}
                  target="_blank"
                  rel="noreferrer"
                  title={`View ${entry.candidate.name} on Scryfall`}
                  className="block"
                >
                  {entry.candidate.imageUrl ? (
                    <img
                      src={entry.candidate.imageUrl}
                      alt={entry.candidate.name}
                      className="block aspect-[5/7] w-full rounded-t-[1.45rem] object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[5/7] w-full rounded-t-[1.45rem] items-center justify-center bg-black/30 text-sm text-slate-500">
                      No image
                    </div>
                  )}
                </a>
                <div className="rounded-b-[1.45rem] bg-slate-950 px-3 py-2.5 text-[11px] font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={scryfallHref}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-slate-100 transition hover:text-white"
                      title={`View ${entry.candidate.name} on Scryfall`}
                    >
                      {Math.round(entry.candidate.score * 100)}% match
                    </a>
                    {priceLabel ? (
                      <a
                        href={purchaseHref}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-teal-400/12 px-2 py-0.5 text-[10px] font-bold text-teal-100 transition hover:bg-teal-400/20 hover:text-white"
                        title={`Buy ${entry.candidate.name} on TCGplayer`}
                      >
                        {priceLabel}
                      </a>
                    ) : entry.candidate.tcgplayerUri ? (
                      <a
                        href={purchaseHref}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-teal-400/12 px-2 py-0.5 text-[10px] font-bold text-teal-100 transition hover:bg-teal-400/20 hover:text-white"
                        title={`Buy ${entry.candidate.name} on TCGplayer`}
                      >
                        Buy
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
