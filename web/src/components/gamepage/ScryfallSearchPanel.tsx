import { useState} from "react";
import { ExternalLink, Search } from "lucide-react";

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

export default function ScryfallSearchPanel()
{
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ScryfallCard[]>([]);

  async function handleCardSearch(e: React.SubmitEvent)
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
    <div className="flex h-[calc(100vh-210px)] min-h-0 flex-col">


      <form onSubmit={handleCardSearch} className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder='Search...'
            className="h-12 min-w-0 w-full flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-300/40 focus:bg-slate-900"
          />
          <button
            type="submit"
            disabled={searchLoading}
            className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-teal-300/30 bg-teal-400/15 px-5 text-sm font-semibold text-teal-100 transition hover:border-teal-200 hover:bg-teal-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <Search size={14} />
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {searchError && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
            {searchError}
          </div>
        )}

        {!searchError && !searchLoading && searchResults.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-slate-400">
            {submittedQuery
              ? `No results found for "${submittedQuery}".`
              : "Search for a card to see results here."}
          </div>
        )}

        <div className="grid grid-cols-1 place-items-center gap-5">
          {searchResults.map((card) => (
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