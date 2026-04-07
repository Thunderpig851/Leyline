import { forwardRef, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

type CommanderCard =
{
  name: string;
};

type CommanderPanelProps =
{
  open: boolean;
  seatTitle?: string;
  commanders: CommanderCard[];
  canEdit?: boolean;
  variant?: "drawer" | "overlay";
  placement?: "top" | "bottom";
  className?: string;
  onClose: () => void;
  onChange: (nextCommanders: CommanderCard[]) => void;
};

type AutocompleteResponse =
{
  data?: string[];
};

type ScryfallCard =
{
  name: string;
  oracle_text?: string;
  card_faces?: Array<{
    oracle_text?: string;
  }>;
};

function getOracleText(card: ScryfallCard | null | undefined)
{
  if (!card) return "";

  const facesText = Array.isArray(card.card_faces)
    ? card.card_faces.map((face) => face.oracle_text || "").join(" ")
    : "";

  return `${card.oracle_text || ""} ${facesText}`.trim().toLowerCase();
}

function allowsPartner(card: ScryfallCard | null | undefined)
{
  const oracle = getOracleText(card);

  return oracle.includes("partner") || oracle.includes("friends forever");
}

async function fetchAutocomplete(query: string): Promise<string[]>
{
  const response = await fetch(
    `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`
  );

  if (!response.ok)
  {
    return [];
  }

  const json: AutocompleteResponse = await response.json();
  return (json.data || []).slice(0, 10);
}

async function fetchNamedCard(name: string): Promise<ScryfallCard | null>
{
  const response = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
  );

  if (!response.ok)
  {
    return null;
  }

  return await response.json();
}

const CommanderPanel = forwardRef<HTMLElement, CommanderPanelProps>(function CommanderPanel(
{
  open,
  seatTitle,
  commanders,
  canEdit = false,
  variant = "drawer",
  placement = "bottom",
  className = "",
  onClose,
  onChange,
}: CommanderPanelProps, ref)
{
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [cardCache, setCardCache] = useState<Record<string, ScryfallCard | null>>({});

  useEffect(() =>
  {
    if (!open)
    {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  useEffect(() =>
  {
    if (!open)
    {
      return;
    }

    const namesToLoad = commanders
      .map((entry) => entry.name)
      .filter((name) => name && !(name in cardCache));

    if (namesToLoad.length === 0)
    {
      return;
    }

    let cancelled = false;

    async function loadCurrentCards()
    {
      const entries = await Promise.all(
        namesToLoad.map(async (name): Promise<[string, ScryfallCard | null]> => [name, await fetchNamedCard(name)])
      );

      if (cancelled)
      {
        return;
      }

      setCardCache((current) =>
      {
        const next = { ...current };

        for (const [name, card] of entries)
        {
          next[name] = card;
        }

        return next;
      });
    }

    void loadCurrentCards();

    return () =>
    {
      cancelled = true;
    };
  }, [open, commanders, cardCache]);

  useEffect(() =>
  {
    if (!open || !canEdit)
    {
      setResults([]);
      setLoading(false);
      return;
    }

    const trimmed = query.trim();

    if (trimmed.length < 2)
    {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const timeoutId = window.setTimeout(async () =>
    {
      try
      {
        setLoading(true);
        const nextResults = await fetchAutocomplete(trimmed);

        if (!cancelled)
        {
          setResults(nextResults);
        }
      }
      catch
      {
        if (!cancelled)
        {
          setResults([]);
        }
      }
      finally
      {
        if (!cancelled)
        {
          setLoading(false);
        }
      }
    }, 180);

    return () =>
    {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, canEdit, query]);

  const firstCommanderCard = useMemo(() =>
  {
    if (!commanders[0]?.name) return null;
    return cardCache[commanders[0].name] || null;
  }, [commanders, cardCache]);

  const canHavePartner = useMemo(() =>
  {
    if (commanders.length >= 2) return true;
    if (commanders.length !== 1) return false;
    return allowsPartner(firstCommanderCard);
  }, [commanders.length, firstCommanderCard]);

  async function handleSelect(name: string)
  {
    if (!canEdit)
    {
      return;
    }

    const card = await fetchNamedCard(name);
    const resolvedName = card?.name || name;

    setCardCache((current) => ({
      ...current,
      [resolvedName]: card,
    }));

    const alreadySelected = commanders.some(
      (entry) => entry.name.toLowerCase() === resolvedName.toLowerCase()
    );

    if (alreadySelected)
    {
      setQuery("");
      setResults([]);
      return;
    }

    if (commanders.length === 0)
    {
      onChange([{ name: resolvedName }]);
    }
    else if (commanders.length === 1 && allowsPartner(firstCommanderCard) && allowsPartner(card))
    {
      onChange([commanders[0], { name: resolvedName }]);
    }
    else
    {
      onChange([{ name: resolvedName }]);
    }

    setQuery("");
    setResults([]);
  }

  function removeCommander(name: string)
  {
    if (!canEdit)
    {
      return;
    }

    onChange(
      commanders.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase())
    );
  }

  function clearAll()
  {
    if (!canEdit)
    {
      return;
    }

    onChange([]);
    setQuery("");
    setResults([]);
  }

  if (!open)
  {
    return null;
  }

  const isOverlay = variant === "overlay";
  const shellClassName = isOverlay
    ? `relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/96 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl ${className}`.trim()
    : `absolute right-0 top-0 z-50 h-full w-[28rem] border-l border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur ${className}`.trim();

  const bodyClassName = isOverlay
    ? `overflow-y-auto px-3 py-3 ${placement === "top" ? "max-h-[calc(100%-3.25rem)]" : "max-h-[calc(100%-3.25rem)]"}`
    : "flex-1 overflow-y-auto px-4 py-4";

  return (
    <aside ref={ref} className={shellClassName}>
      <div className="flex h-full flex-col">
        <div className={bodyClassName}>
          <div className={`rounded-2xl border border-white/10 bg-slate-900/60 ${isOverlay ? "p-3" : "p-4"}`}>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Selected
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {commanders.length > 0 ? (
                commanders.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                  >
                    <span className="max-w-[12rem] truncate">{entry.name}</span>

                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => removeCommander(entry.name)}
                        className="rounded-md border border-white/10 bg-slate-900/80 p-1 text-slate-300 transition hover:bg-slate-800"
                        aria-label={`Remove ${entry.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
                  No commanders selected yet.
                </div>
              )}
            </div>

            {commanders.length === 1 && allowsPartner(firstCommanderCard) ? (
              <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                This commander supports a partner-style second commander. Select one more to pair it.
              </div>
            ) : null}

            {canEdit ? (
              <div className="mt-4 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      commanders.length === 1 && canHavePartner
                        ? "Search partner commander"
                        : "Search commander"
                    }
                    className="min-w-0 w-full rounded-xl border border-white/10 bg-slate-950/80 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-400/40"
                  />
                </div>

                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 transition hover:border-white/20 hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>

          <div className={`rounded-2xl border border-white/10 bg-slate-900/60 ${isOverlay ? "mt-3 p-3" : "mt-4 p-4"}`}>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Results
            </div>

            <div className="mt-3 grid gap-2">
              {!canEdit ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
                  Only your own seat can be edited.
                </div>
              ) : loading ? (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
                  Searching Scryfall...
                </div>
              ) : results.length > 0 ? (
                results.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { void handleSelect(name); }}
                    className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 hover:bg-slate-900"
                  >
                    {name}
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
                  Type at least 2 characters to search.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
});

export default CommanderPanel
