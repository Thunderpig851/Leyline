import React, { useState } from "react";
import {
  BookOpen,
  MessageSquare,
  Search,
  ExternalLink,
} from "lucide-react";
import SidePanel from "./SidePanel";
import RoomChatWidget from "./RoomChatWidget";

type PanelTab = "card-log" | "chat" | "search";

type ScryfallCard =
{
  id: string;
  name: string;
  image_uris?: {
    png?: string;
    large?: string;
    normal?: string;
    small?: string;
  };
  card_faces?: Array<{
    name?: string;
    image_uris?: {
      png?: string;
      large?: string;
      normal?: string;
      small?: string;
    };
  }>;
  scryfall_uri?: string;
};

type ScryfallSearchResponse =
{
  object: "list";
  data: ScryfallCard[];
  has_more: boolean;
};

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

  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);

  async function handleCardSearch(e: React.FormEvent)
  {
    e.preventDefault();

    const query = searchInput.trim();
    if (!query) return;

    setSearchLoading(true);
    setSearchError(null);
    setSubmittedQuery(query);

    try
    {
      const params = new URLSearchParams({
        q: query,
        unique: "cards",
        order: "name",
        dir: "auto",
      });

      const res = await fetch(
        `https://api.scryfall.com/cards/search?${params.toString()}`
      );

      if (!res.ok)
      {
        const maybeError = await res.json().catch(() => null);
        throw new Error(maybeError?.details || "Search failed.");
      }

      const data = (await res.json()) as ScryfallSearchResponse;
      setSearchResults(Array.isArray(data.data) ? data.data.slice(0, 18) : []);
    }
    catch (err)
    {
      const message =
        err instanceof Error ? err.message : "Unable to search Scryfall right now.";

      setSearchError(message);
      setSearchResults([]);
    }
    finally
    {
      setSearchLoading(false);
    }
  }

  return (
    <SidePanel
      side="right"
      open={open}
      width={width}
      title="Game Tools"
      description="Card log, chat, and search."
      onToggle={onToggle}
    >
      <div className="mt-4 flex min-h-0 flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <WidgetTile
            active={activeTab === "card-log"}
            label="Card Log"
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

        <div className="min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.03] shadow-[0_12px_32px_rgba(0,0,0,0.32)]">
          {activeTab === "card-log" && <CardLogPlaceholder />}
          {activeTab === "chat" && <RoomChatWidget roomId={roomId} />}
          {activeTab === "search" && (
            <CardSearchWidget
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={handleCardSearch}
              loading={searchLoading}
              error={searchError}
              results={searchResults}
              submittedQuery={submittedQuery}
            />
          )}
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
      className={`group flex aspect-[1.05/1] flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all duration-150 ${
        active
          ? "border-teal-300/40 bg-teal-400/15 text-teal-100 shadow-lg shadow-teal-950/30"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-slate-100"
      }`}
    >
      <div
        className={`mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl border transition-all ${
          active
            ? "border-teal-300/30 bg-teal-400/10"
            : "border-white/10 bg-black/20 group-hover:border-white/20"
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
      <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6">
        <div className="text-sm font-semibold text-slate-100">Card Log</div>
        <div className="mt-2 text-sm leading-6 text-slate-400">
          This widget is reserved for the future card interaction log.
        </div>
      </div>
    </div>
  );
}

function CardSearchWidget({
  value,
  onChange,
  onSubmit,
  loading,
  error,
  results,
  submittedQuery,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string | null;
  results: ScryfallCard[];
  submittedQuery: string;
})
{
  return (
    <div className="flex h-[calc(100vh-210px)] min-h-0 flex-col">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="text-sm font-semibold text-slate-100">Manual Card Search</div>
        <div className="mt-1 text-xs text-slate-400">
          Search Scryfall and click a card to open its page.
        </div>
      </div>

      <form onSubmit={onSubmit} className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder='Try "sol ring", "t:dragon mv<=4", or "o:draw c:u"'
            className="h-12 min-w-0 w-full flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-300/40 focus:bg-slate-900"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/15 px-5 text-sm font-semibold text-teal-100 transition hover:border-teal-200 hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <Search size={14} />
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!error && !loading && results.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-slate-400">
            {submittedQuery
              ? `No results found for "${submittedQuery}".`
              : "Search for a card to see results here."}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 place-items-center">
          {results.map((card) => (
            <ScryfallImageCard key={card.id} card={card} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScryfallImageCard({ card }: { card: ScryfallCard })
{
  const image =
    card.image_uris?.png ||
    card.image_uris?.large ||
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.png ||
    card.card_faces?.[0]?.image_uris?.large ||
    card.card_faces?.[0]?.image_uris?.normal ||
    "";

  if (!image)
  {
    return (
      <div className="w-full max-w-[340px] rounded-3xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-400">
        No image available for {card.name}.
      </div>
    );
  }

  return (
    <a
      href={card.scryfall_uri || "#"}
      target="_blank"
      rel="noreferrer"
      className="group block w-full max-w-[340px] overflow-hidden rounded-[26px] border border-white/10 bg-black/20 shadow-[0_14px_34px_rgba(0,0,0,0.36)] transition duration-200 hover:border-teal-300/30 hover:shadow-[0_18px_42px_rgba(20,184,166,0.14)]"
      title={card.name}
    >
      <div className="relative aspect-[5/7] w-full overflow-hidden bg-slate-900">
        <img
          src={image}
          alt={card.name}
          loading="lazy"
          className="h-full w-full object-contain transition duration-200 group-hover:scale-[1.015]"
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">
                {card.name}
              </div>
            </div>

            <div className="rounded-full border border-white/15 bg-black/35 p-2 text-slate-200">
              <ExternalLink size={14} />
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}