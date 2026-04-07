import React, { useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Search,
} from "lucide-react";
import SidePanel from "./SidePanel";
import RoomChatWidget from "./RoomChatWidget";
import ScryfallSearchPanel from "./ScryfallSearchPanel";

type PanelTab = "card-log" | "chat" | "search";

type RightSidePanelProps =
{
  open: boolean;
  onToggle: () => void;
  roomId: string;
  width?: string;
};

export default function RightSidePanel({
  open,
  onToggle,
  roomId,
  width = "clamp(280px, 22.7vw, 413px)",
}: RightSidePanelProps)
{
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");

  return (
    <SidePanel
      side="right"
      open={open}
      width={width}
      title=""
      description=""
      onToggle={onToggle}
    >
      <div className="mt-4 flex min-h-0 flex-col gap-4">
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

        <div className="min-h-0 overflow-hidden rounded-3xl border border-teal-400/15 bg-gradient-to-b from-teal-400/[0.06] to-slate-950/72 shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
          {activeTab === "card-log" && <CardLogPlaceholder />}
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

function CardLogPlaceholder()
{
  return (
    <div className="p-5">
      <div className="rounded-3xl border border-dashed border-teal-400/16 bg-black/20 p-6">
        <div className="text-sm font-semibold text-slate-100">Card Log</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          Coming soon . . .
        </div>
      </div>
    </div>
  );
}
