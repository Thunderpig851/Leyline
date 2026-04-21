import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, MouseEvent as ReactMouseEvent } from "react";
import { Check, Coffee, Crown, FlipVertical2, Maximize2, Minimize2, Pencil, RotateCw, Swords, X } from "lucide-react";
import CommanderPanel from "./CommanderPanel";

type CommanderCard =
{
  name: string;
};

type CommanderDamageOption =
{
  userId: string;
  label: string;
  amount: number;
};

type PlayerTileProps =
{
  seatNumber?: number;
  mode?: "commander" | "duel";
  title?: string;
  stream?: MediaStream | null;
  isSelf?: boolean;
  status?: "connected" | "reconnecting" | "away" | "empty";
  isAway?: boolean;
  isReady?: boolean;
  showSeatStateOverlay?: boolean;
  isFlipped?: boolean;
  isExpanded?: boolean;
  life?: number;
  poison?: number;
  energy?: number;
  experience?: number;
  trackEnergy?: boolean;
  trackExperience?: boolean;
  commanders?: CommanderCard[];
  commanderDamageOptions?: CommanderDamageOption[];
  hasMonarch?: boolean;
  hasInitiative?: boolean;
  isActiveTurn?: boolean;
  isSaving?: boolean;
  canPromoteToHost?: boolean;
  canKickPlayer?: boolean;
  promotingToHost?: boolean;
  kickingPlayer?: boolean;
  onLifeChange?: (nextLife: number) => void;
  onPoisonChange?: (nextPoison: number) => void;
  onEnergyChange?: (nextEnergy: number) => void;
  onExperienceChange?: (nextExperience: number) => void;
  onCommanderDamageChange?: (nextCommanderDamage: Record<string, number>) => void;
  onSetMonarch?: (seatNumber: number | null) => void;
  onSetInitiative?: (seatNumber: number | null) => void;
  onCommandersChange?: (nextCommanders: CommanderCard[]) => void;
  onPromoteToHost?: () => void;
  onKickPlayer?: () => void;
  onToggleFlip?: () => void;
  onToggleExpand?: () => void;
  cardDetectionHighlight?: {
    points: Array<{ x: number; y: number }>;
    detectedAt: number;
    fadeStartedAt?: number | null;
  } | null;
  cardScanIndicator?: {
    x: number;
    y: number;
    phase: "hidden" | "scanning" | "success" | "failed";
    text: string;
  } | null;

  onCardCropDebugClick?: (
    event: ReactMouseEvent<HTMLElement>,
    videoEl: HTMLVideoElement | null
  ) => void | Promise<void>;
};

type CommanderVisual =
{
  imageUrl: string;
  scryfallUri: string;
  colors: string[];
};

const WUBRG_ORDER = ["W", "U", "B", "R", "G"] as const;

const MTG_TEXT_COLORS: Record<string, string> =
{
  W: "#f3e7b3",
  U: "#67b7ff",
  B: "#b78cff",
  R: "#ff7b72",
  G: "#49c47a",
};

function clampCounter(value: number, min: number, max: number)
{
  if (!Number.isFinite(value))
  {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function getCardColors(card: any): string[]
{
  const rootColors = Array.isArray(card?.colors) ? card.colors : [];

  if (rootColors.length > 0)
  {
    return rootColors;
  }

  const faceColors = Array.isArray(card?.card_faces)
    ? card.card_faces.flatMap((face: any) => Array.isArray(face?.colors) ? face.colors : [])
    : [];

  return Array.from(new Set(faceColors));
}

async function fetchCommanderVisual(name: string): Promise<CommanderVisual | null>
{
  try
  {
    const response = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`
    );

    if (!response.ok)
    {
      return null;
    }

    const card = await response.json();

    const imageUrl =
      card?.image_uris?.normal ||
      card?.image_uris?.large ||
      card?.card_faces?.[0]?.image_uris?.normal ||
      card?.card_faces?.[0]?.image_uris?.large ||
      "";

    return {
      imageUrl,
      scryfallUri: card?.scryfall_uri || "",
      colors: getCardColors(card),
    };
  }
  catch
  {
    return null;
  }
}

function getStatusMeta(status: PlayerTileProps["status"])
{
  if (status === "connected")
  {
    return {
      dot: "bg-emerald-400",
      text: "text-emerald-300",
      label: "Connected",
    };
  }

  if (status === "reconnecting")
  {
    return {
      dot: "bg-orange-400",
      text: "text-orange-300",
      label: "Reconnecting",
    };
  }

  if (status === "away")
  {
    return {
      dot: "bg-amber-400",
      text: "text-amber-300",
      label: "Away",
    };
  }

  return {
    dot: "bg-slate-500",
    text: "text-slate-400",
    label: "Open",
  };
}

function sortColorsWubrg(colors: string[])
{
  const unique = Array.from(new Set(colors.filter(Boolean)));
  return unique.sort(
    (a, b) => WUBRG_ORDER.indexOf(a as (typeof WUBRG_ORDER)[number]) - WUBRG_ORDER.indexOf(b as (typeof WUBRG_ORDER)[number])
  );
}

function buildGradient(colors: string[])
{
  const ordered = sortColorsWubrg(colors);

  if (ordered.length === 0)
  {
    return "";
  }

  if (ordered.length === 1)
  {
    return MTG_TEXT_COLORS[ordered[0]];
  }

  const stops = ordered.map((color, index) =>
  {
    const percent = ordered.length === 1
      ? 0
      : Math.round((index / (ordered.length - 1)) * 100);

    return `${MTG_TEXT_COLORS[color]} ${percent}%`;
  });

  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function buildCommanderTextStyle(colors: string[]): CSSProperties
{
  const ordered = sortColorsWubrg(colors);

  if (ordered.length === 0)
  {
    return {
      color: "#e2e8f0",
    };
  }

  if (ordered.length === 1)
  {
    return {
      color: MTG_TEXT_COLORS[ordered[0]],
    };
  }

  return {
    backgroundImage: buildGradient(ordered),
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
  };
}

function mapNormalizedPointToCoverFrame(
  point: { x: number; y: number },
  sourceWidth: number,
  sourceHeight: number,
  frameWidth: number,
  frameHeight: number
)
{
  const scale = Math.max(frameWidth / Math.max(1, sourceWidth), frameHeight / Math.max(1, sourceHeight));
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (frameWidth - renderedWidth) / 2;
  const offsetY = (frameHeight - renderedHeight) / 2;

  return {
    x: offsetX + point.x * renderedWidth,
    y: offsetY + point.y * renderedHeight,
  };
}

export default function PlayerTile({
  seatNumber = 0,
  mode = "commander",
  title = "Player",
  stream = null,
  isSelf = false,
  status = "connected",
  isAway = false,
  isReady = false,
  showSeatStateOverlay = true,
  isFlipped = false,
  isExpanded = false,
  life = 40,
  poison = 0,
  energy = 0,
  experience = 0,
  trackEnergy = false,
  trackExperience = false,
  commanders = [],
  commanderDamageOptions = [],
  hasMonarch = false,
  hasInitiative = false,
  isActiveTurn = false,
  isSaving = false,
  canPromoteToHost = false,
  canKickPlayer = false,
  promotingToHost = false,
  kickingPlayer = false,
  onLifeChange,
  onPoisonChange,
  onEnergyChange,
  onExperienceChange,
  onCommanderDamageChange,
  onSetMonarch,
  onSetInitiative,
  onCommandersChange,
  onPromoteToHost,
  onKickPlayer,
  onToggleFlip,
  onToggleExpand,
  cardDetectionHighlight = null,
  cardScanIndicator = null,

  onCardCropDebugClick
}: PlayerTileProps)
{
  const tileSectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isCommanderMode = mode === "commander";
  const counterButtonRef = useRef<HTMLButtonElement | null>(null);
  const countersOverlayRef = useRef<HTMLDivElement | null>(null);
  const commanderTriggerRef = useRef<HTMLDivElement | null>(null);
  const commanderPanelRef = useRef<HTMLElement | null>(null);

  const [countersOpen, setCountersOpen] = useState(false);
  const [commanderPanelOpen, setCommanderPanelOpen] = useState(false);
  const [commanderPanelPlacement, setCommanderPanelPlacement] = useState<"top" | "bottom">("bottom");
  const [showHostActions, setShowHostActions] = useState(false);
  const [lifeInput, setLifeInput] = useState(String(life));
  const [hoveredCommanderName, setHoveredCommanderName] = useState<string | null>(null);
  const [commanderVisualMap, setCommanderVisualMap] = useState<Record<string, CommanderVisual | null>>({});

  const canEditLife = Boolean(isSelf && onLifeChange);
  const canEditCommander = Boolean(isCommanderMode && isSelf && onCommandersChange);
  const canEditCounters = Boolean(
    isSelf && (onPoisonChange || onEnergyChange || onExperienceChange || onCommanderDamageChange)
  );

  const showEnergy = status !== "empty" && (trackEnergy || energy >= 0);
  const showExperience = status !== "empty" && (trackExperience || experience >= 0);

  const compactCounters = [
    {
      key: "poison",
      label: "Poison",
      shortLabel: "P",
      value: poison,
      visible: status !== "empty",
      onDec: () => adjustPoison(-1),
      onInc: () => adjustPoison(1),
      enabled: Boolean(onPoisonChange),
      accent: "emerald" as const,
    },
    {
      key: "energy",
      label: "Energy",
      shortLabel: "E",
      value: energy,
      visible: showEnergy,
      onDec: () => adjustEnergy(-1),
      onInc: () => adjustEnergy(1),
      enabled: Boolean(onEnergyChange),
      accent: "sky" as const,
    },
    {
      key: "experience",
      label: "Experience",
      shortLabel: "XP",
      value: experience,
      visible: showExperience,
      onDec: () => adjustExperience(-1),
      onInc: () => adjustExperience(1),
      enabled: Boolean(onExperienceChange),
      accent: "violet" as const,
    },
  ].filter((entry) => entry.visible);

  const visibleTopCounters = compactCounters.filter((entry) => entry.value > 0);

  const canManageSharedStates = Boolean(
    isCommanderMode &&
    isSelf &&
    Number.isInteger(seatNumber) &&
    seatNumber > 0 &&
    (onSetMonarch || onSetInitiative)
  );

  const canManageHostActions = Boolean(canPromoteToHost || canKickPlayer);
  const canShowViewActions = status !== "empty" && Boolean(onToggleFlip || onToggleExpand);

  const canOpenCounters =
    compactCounters.length > 0 ||
    canManageSharedStates ||
    (isCommanderMode && commanderDamageOptions.length > 0);

  useEffect(() =>
  {
    setLifeInput(String(life));
  }, [life]);

  useEffect(() =>
  {
    const video = videoRef.current;

    if (!video)
    {
      return;
    }

    if (!stream)
    {
      video.srcObject = null;
      return;
    }

    if (video.srcObject !== stream)
    {
      video.srcObject = stream;
    }

    const playPromise = video.play();
    playPromise?.catch((err) =>
    {
      if (err?.name !== "AbortError")
      {
        console.error("Failed to play tile stream:", err);
      }
    });
  }, [stream, title]);

  useEffect(() =>
  {
    if (!commanderPanelOpen)
    {
      return;
    }

    function updateCommanderPanelPlacement()
    {
      const tileBounds = tileSectionRef.current?.getBoundingClientRect();

      if (!tileBounds)
      {
        return;
      }

      const viewportHeight = window.innerHeight;
      const availableBelow = viewportHeight - tileBounds.bottom;
      const availableAbove = tileBounds.top;
      const preferredHeight = Math.min(420, Math.max(tileBounds.height * 0.92, 280));
      const shouldOpenUp = availableBelow < preferredHeight && availableAbove > availableBelow;

      setCommanderPanelPlacement(shouldOpenUp ? "top" : "bottom");
    }

    updateCommanderPanelPlacement();
    window.addEventListener("resize", updateCommanderPanelPlacement);
    window.addEventListener("scroll", updateCommanderPanelPlacement, true);

    return () =>
    {
      window.removeEventListener("resize", updateCommanderPanelPlacement);
      window.removeEventListener("scroll", updateCommanderPanelPlacement, true);
    };
  }, [commanderPanelOpen]);

  useEffect(() =>
  {
    function handlePointerDown(event: MouseEvent)
    {
      const target = event.target as Node;

      const clickedOverlay = countersOverlayRef.current?.contains(target);
      const clickedButton = counterButtonRef.current?.contains(target);
      const clickedCommanderTrigger = commanderTriggerRef.current?.contains(target);
      const clickedCommanderPanel = commanderPanelRef.current?.contains(target);

      if (!clickedOverlay && !clickedButton)
      {
        setCountersOpen(false);
      }

      if (!clickedCommanderTrigger && !clickedCommanderPanel)
      {
        setCommanderPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () =>
    {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() =>
  {
    const commanderNames = commanders
      .map((entry) => entry.name)
      .filter(Boolean)
      .filter((name) => !(name in commanderVisualMap));

    if (commanderNames.length === 0)
    {
      return;
    }

    let cancelled = false;

    async function loadCommanderVisuals()
    {
      const loaded = await Promise.all(
        commanderNames.map(async (name) => [name, await fetchCommanderVisual(name)] as const)
      );

      if (cancelled) return;

      setCommanderVisualMap((current) =>
      {
        const next = { ...current };

        for (const [name, visual] of loaded)
        {
          next[name] = visual;
        }

        return next;
      });
    }

    void loadCommanderVisuals();

    return () =>
    {
      cancelled = true;
    };
  }, [commanders, commanderVisualMap]);

  const commanderDamageMap = useMemo(() =>
  {
    const result: Record<string, number> = {};

    for (const option of commanderDamageOptions)
    {
      result[option.userId] = option.amount ?? 0;
    }

    return result;
  }, [commanderDamageOptions]);

  const statusMeta = useMemo(() => getStatusMeta(status), [status]);

  const partnerGradientStyle = useMemo(() =>
  {
    const combinedColors = sortColorsWubrg(
      commanders.flatMap((commander) => commanderVisualMap[commander.name]?.colors || [])
    );

    return buildCommanderTextStyle(combinedColors);
  }, [commanders, commanderVisualMap]);

  const highlightFrameWidth = videoRef.current?.clientWidth || tileSectionRef.current?.clientWidth || 0;
  const highlightFrameHeight = videoRef.current?.clientHeight || tileSectionRef.current?.clientHeight || 0;
  const sourceVideoWidth = videoRef.current?.videoWidth || 0;
  const sourceVideoHeight = videoRef.current?.videoHeight || 0;
  const cardHighlightPolygon =
    cardDetectionHighlight &&
    cardDetectionHighlight.points.length >= 4 &&
    highlightFrameWidth > 0 &&
    highlightFrameHeight > 0 &&
    sourceVideoWidth > 0 &&
    sourceVideoHeight > 0
      ? cardDetectionHighlight.points.map((point) =>
        {
          const mapped = mapNormalizedPointToCoverFrame(
            point,
            sourceVideoWidth,
            sourceVideoHeight,
            highlightFrameWidth,
            highlightFrameHeight
          );
          return `${mapped.x},${mapped.y}`;
        }).join(" ")
      : null;
  const cardHighlightOpacity = cardDetectionHighlight?.fadeStartedAt ? 0 : 1;
  const cardScanIndicatorStyle =
    cardScanIndicator && cardScanIndicator.phase !== "hidden"
      ? {
        left: `${cardScanIndicator.x * 100}%`,
        top: `${cardScanIndicator.y * 100}%`,
      }
      : null;

  function updateCommanderDamage(userId: string, amount: number)
  {
    if (!onCommanderDamageChange) return;

    const nextMap: Record<string, number> = { ...commanderDamageMap };
    nextMap[userId] = clampCounter(amount, 0, 99);
    onCommanderDamageChange(nextMap);
  }

  function adjustLife(delta: number)
  {
    if (!onLifeChange) return;
    onLifeChange(clampCounter(life + delta, 0, 999));
  }

  function adjustPoison(delta: number)
  {
    if (!onPoisonChange) return;
    onPoisonChange(clampCounter(poison + delta, 0, 99));
  }

  function adjustEnergy(delta: number)
  {
    if (!onEnergyChange) return;
    onEnergyChange(clampCounter(energy + delta, 0, 999));
  }

  function adjustExperience(delta: number)
  {
    if (!onExperienceChange) return;
    onExperienceChange(clampCounter(experience + delta, 0, 999));
  }

  function commitLifeInput()
  {
    const parsed = Number(lifeInput);

    if (!Number.isFinite(parsed))
    {
      setLifeInput(String(life));
      return;
    }

    onLifeChange?.(clampCounter(parsed, 0, 999));
  }

  async function handleCommanderHoverStart(name: string)
  {
    setHoveredCommanderName(name);

    if (commanderVisualMap[name] !== undefined)
    {
      return;
    }

    const visual = await fetchCommanderVisual(name);

    setCommanderVisualMap((current) => ({
      ...current,
      [name]: visual,
    }));
  }

  function handleCommanderHoverEnd(name: string)
  {
    setHoveredCommanderName((current) => current === name ? null : current);
  }

  function handlePanelClick(event: ReactMouseEvent<HTMLElement>)
  {
    if (!stream || !videoRef.current || !onCardCropDebugClick)
    {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, label, [role='button']"))
    {
      return;
    }

    void onCardCropDebugClick(event, videoRef.current);
  }

  return (
    <section
      ref={tileSectionRef}
      className="group relative h-full min-h-0 rounded-[1.65rem]"
      onClick={handlePanelClick}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[1.65rem] border border-white/10 bg-slate-900 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent" />

        <div className="relative h-full">
          {stream ? (
            <video
              ref={videoRef}
              className={`h-full w-full object-cover transition-transform duration-200 ${isFlipped ? "rotate-180" : ""}`}
              autoPlay
              playsInline
              muted={isSelf}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black/20">
              <span className="text-xs text-slate-400">
                {status === "empty" ? "" : "No stream"}
              </span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent" />

          {cardHighlightPolygon ? (
            <svg
              className={`pointer-events-none absolute inset-0 z-[2] ${isFlipped ? "rotate-180" : ""}`}
              viewBox={`0 0 ${Math.max(1, highlightFrameWidth)} ${Math.max(1, highlightFrameHeight)}`}
              preserveAspectRatio="none"
              style={{
                opacity: cardHighlightOpacity,
                transition: "opacity 620ms ease-out",
              }}
            >
              <polygon
                points={cardHighlightPolygon}
                fill="none"
                stroke="rgba(52,211,153,0.98)"
                strokeWidth={Math.max(2, highlightFrameWidth / 190)}
                strokeLinejoin="round"
                className="drop-shadow-[0_0_10px_rgba(16,185,129,0.45)]"
              />
            </svg>
          ) : null}

          {cardScanIndicator && cardScanIndicator.phase !== "hidden" && cardScanIndicatorStyle ? (
            <div
              aria-live="polite"
              className="pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-1/2"
              style={cardScanIndicatorStyle}
            >
              <div
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm ${
                  cardScanIndicator.phase === "scanning"
                    ? "border-emerald-300/40 bg-slate-950/82 text-emerald-100"
                    : cardScanIndicator.phase === "success"
                      ? "border-cyan-300/40 bg-slate-950/84 text-cyan-100"
                      : "border-rose-300/40 bg-slate-950/84 text-rose-100"
                }`}
              >
                {cardScanIndicator.phase === "scanning" ? (
                  <RotateCw className="h-4 w-4 animate-spin" />
                ) : cardScanIndicator.phase === "success" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <X className="scan-indicator-fail-blink h-4 w-4" />
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isActiveTurn ? (
        <div className="pointer-events-none absolute inset-[4px] z-[1] rounded-[1.4rem] ring-2 ring-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_28px_rgba(16,185,129,0.35)]" />
      ) : null}

      {(status !== "empty" && (isAway || showSeatStateOverlay)) ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-6">
          {isAway ? (
            <CenteredSeatStateOverlay
              tone="away"
              icon={<Coffee className="h-10 w-10" />}
              label="AFK"
            />
          ) : showSeatStateOverlay ? (
            <CenteredSeatStateOverlay
              tone={isReady ? "ready" : "not-ready"}
              icon={isReady ? <Check className="h-12 w-12" /> : <X className="h-12 w-12" />}
              label={isReady ? "Ready" : "Not Ready"}
            />
          ) : null}
        </div>
      ) : null}

      {canShowViewActions ? (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {onToggleFlip ? (
            <TileViewActionButton
              label={isFlipped ? "Return Upright" : "Flip Stream"}
              icon={<FlipVertical2 className="h-4 w-4" />}
              onClick={onToggleFlip}
            />
          ) : null}

          {onToggleExpand ? (
            <TileViewActionButton
              label={isExpanded ? "Return to Grid" : "Focus Stream"}
              icon={isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              onClick={onToggleExpand}
            />
          ) : null}
        </div>
      ) : null}

      <div className="absolute left-3 right-3 top-3 z-10 flex items-start justify-between gap-3">
        <div
          className="relative flex min-w-0 flex-col gap-1.5"
          onMouseEnter={canManageHostActions ? () => setShowHostActions(true) : undefined}
          onMouseLeave={canManageHostActions ? () => setShowHostActions(false) : undefined}
        >
          <div className="rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="truncate font-semibold tracking-tight">{title}</div>

                  {isCommanderMode && hasMonarch ? (
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-amber-200"
                      title="Monarch"
                      aria-label="Monarch"
                    >
                      <Crown className="h-3 w-3" />
                    </span>
                  ) : null}

                  {isCommanderMode && hasInitiative ? (
                    <span
                      className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border border-sky-400/20 bg-sky-400/10 px-1 text-[10px] font-black leading-none text-sky-100"
                      title="Initiative"
                      aria-label="Initiative"
                    >
                      !
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                <span className={`text-[11px] ${statusMeta.text}`}>
                  {statusMeta.label}
                </span>

                {isSaving ? (
                  <svg
                    className="h-3.5 w-3.5 animate-spin text-emerald-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M21 12a9 9 0 1 1-2.64-6.36"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M21 3v6h-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </div>
            </div>
          </div>

          {canManageHostActions ? (
            <div
              className={`absolute left-0 top-full z-20 mt-2 flex flex-wrap items-center gap-2 transition-all duration-150 ${
                showHostActions
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1 opacity-0"
              }`}
            >
              {canPromoteToHost ? (
                <button
                  type="button"
                  onClick={onPromoteToHost}
                  disabled={!onPromoteToHost || promotingToHost || kickingPlayer}
                  className="pointer-events-auto inline-flex rounded-full border border-teal-300/30 bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold text-teal-100 shadow-lg backdrop-blur transition hover:border-teal-200/50 hover:bg-teal-400/16 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {promotingToHost ? "Promoting..." : "Promote to Host"}
                </button>
              ) : null}

              {canKickPlayer ? (
                <button
                  type="button"
                  onClick={onKickPlayer}
                  disabled={!onKickPlayer || kickingPlayer || promotingToHost}
                  className="pointer-events-auto inline-flex rounded-full border border-red-300/30 bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold text-red-100 shadow-lg backdrop-blur transition hover:border-red-200/50 hover:bg-red-500/16 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {kickingPlayer ? "Kicking..." : "Kick Player"}
                </button>
              ) : null}
            </div>
          ) : null}

          {visibleTopCounters.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleTopCounters.map((counter) => (
                <VisibleCounterChip
                  key={`visible-${counter.key}`}
                  label={counter.shortLabel}
                  value={counter.value}
                  accent={counter.accent}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-start gap-2">
          {isCommanderMode ? (
          <div ref={commanderTriggerRef} className="relative flex items-start gap-2 rounded-xl border border-white/10 bg-slate-950/92 px-2 py-2 shadow-lg backdrop-blur">
            {commanders.length > 0 ? (
              commanders.length === 1 ? (
                commanders.map((commander) =>
                {
                  const visual = commanderVisualMap[commander.name];
                  const textStyle = buildCommanderTextStyle(visual?.colors || []);

                  return (
                    <div
                      key={commander.name}
                      className="relative rounded-lg border border-white/10 bg-slate-900/95 shadow-inner"
                      onMouseEnter={() =>
                      {
                        void handleCommanderHoverStart(commander.name);
                      }}
                      onMouseLeave={() => handleCommanderHoverEnd(commander.name)}
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none max-w-[13.5rem] whitespace-normal break-words px-2 py-1 text-left text-[11px] font-medium leading-tight"
                        style={textStyle}
                      >
                        {commander.name}
                      </div>

                      <div className="absolute inset-0">
                        <button
                          type="button"
                          onClick={canEditCommander ? () => setCommanderPanelOpen(true) : undefined}
                          className="h-full max-w-[13.5rem] whitespace-normal break-words px-2 py-1 text-left text-[11px] font-medium leading-tight text-transparent"
                        >
                          {commander.name}
                        </button>
                      </div>

                      {hoveredCommanderName === commander.name && commanderVisualMap[commander.name]?.imageUrl ? (
                        <HoverPreview
                          href={commanderVisualMap[commander.name]?.scryfallUri ?? commanderVisualMap[commander.name]?.imageUrl ?? ""}
                          src={commanderVisualMap[commander.name]?.imageUrl ?? ""}
                          alt={commander.name}
                        />
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="relative rounded-lg border border-white/10 bg-slate-900/95 shadow-inner">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none flex items-center gap-1 px-2 py-1 text-[11px] font-medium"
                    style={partnerGradientStyle}
                  >
                    {commanders.map((commander, index) => (
                      <span key={commander.name}>
                        {index > 0 ? " / " : ""}
                        {commander.name}
                      </span>
                    ))}
                  </div>

                  <div className="absolute inset-0 flex items-center gap-1 px-2 py-1">
                    {commanders.map((commander, index) => (
                      <div
                        key={commander.name}
                        className="relative"
                        onMouseEnter={() =>
                        {
                          void handleCommanderHoverStart(commander.name);
                        }}
                        onMouseLeave={() => handleCommanderHoverEnd(commander.name)}
                      >
                        <button
                          type="button"
                          onClick={canEditCommander ? () => setCommanderPanelOpen(true) : undefined}
                          className="text-[11px] font-medium text-transparent"
                        >
                          {index > 0 ? " / " : ""}
                          {commander.name}
                        </button>

                        {hoveredCommanderName === commander.name && commanderVisualMap[commander.name]?.imageUrl ? (
                          <HoverPreview
                            href={commanderVisualMap[commander.name]?.scryfallUri ?? commanderVisualMap[commander.name]?.imageUrl ?? ""}
                            src={commanderVisualMap[commander.name]?.imageUrl ?? ""}
                            alt={commander.name}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={canEditCommander ? () => setCommanderPanelOpen(true) : undefined}
                disabled={!canEditCommander}
                className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                  canEditCommander
                    ? "border-dashed border-white/15 bg-slate-900/90 text-slate-300 hover:border-emerald-400/35 hover:text-slate-100"
                    : "border-white/10 bg-slate-900/90 text-slate-500"
                }`}
              >
                Commander
              </button>
            )}

            {canEditCommander ? (
              <button
                type="button"
                onClick={() => setCommanderPanelOpen(true)}
                className="rounded-lg border border-white/10 bg-slate-900/90 p-1.5 text-slate-300 transition hover:border-white/20 hover:bg-slate-800"
                aria-label="Open commander selector"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            ) : null}

          </div>
          ) : null}

          <button
            ref={counterButtonRef}
            type="button"
            onClick={() =>
            {
              if (canOpenCounters)
              {
                setCountersOpen((value) => !value);
              }
            }}
            disabled={!canOpenCounters}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border shadow-lg backdrop-blur transition ${
              canOpenCounters
                ? "border-white/10 bg-slate-950/82 text-slate-200 hover:border-white/20 hover:bg-slate-900"
                : "border-white/10 bg-slate-950/60 text-slate-500"
            }`}
            aria-label="Open counters"
            title="Open counters"
          >
            <Swords className="h-4.5 w-4.5" />
          </button>

          <div className="flex items-center overflow-hidden rounded-xl border border-emerald-400/20 bg-slate-950/80 shadow-lg backdrop-blur">
            <button
              type="button"
              onClick={() => adjustLife(-1)}
              disabled={!onLifeChange || isSaving}
              className="flex h-9 w-8 items-center justify-center border-r border-white/10 bg-slate-900/70 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              -
            </button>

            <input
              type="text"
              inputMode="numeric"
              value={lifeInput}
              onChange={(e) => setLifeInput(e.target.value.replace(/[^\d-]/g, ""))}
              onBlur={commitLifeInput}
              onKeyDown={(e) =>
              {
                if (e.key === "Enter")
                {
                  e.preventDefault();
                  commitLifeInput();
                }
              }}
              disabled={!canEditLife || isSaving}
              className="h-9 w-[4.35rem] bg-slate-950/95 text-center text-base font-semibold tracking-tight text-emerald-100 outline-none disabled:cursor-not-allowed disabled:opacity-80"
            />

            <button
              type="button"
              onClick={() => adjustLife(1)}
              disabled={!onLifeChange || isSaving}
              className="flex h-9 w-8 items-center justify-center border-l border-white/10 bg-slate-900/70 text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {isCommanderMode && commanderPanelOpen ? (
        <div
          className="pointer-events-none absolute inset-x-3 z-30"
          style={commanderPanelPlacement === "top" ? { bottom: "0.75rem" } : { top: "4rem" }}
        >
          <CommanderPanel
            ref={commanderPanelRef}
            open={commanderPanelOpen}
            variant="overlay"
            placement={commanderPanelPlacement}
            className="pointer-events-auto max-h-[calc(100%-0.75rem)]"
            seatTitle={title}
            commanders={commanders}
            canEdit={canEditCommander}
            onClose={() => setCommanderPanelOpen(false)}
            onChange={(nextCommanders) =>
            {
              onCommandersChange?.(nextCommanders);
            }}
          />
        </div>
      ) : null}

      {countersOpen ? (
        <div
          ref={countersOverlayRef}
          className="absolute right-3 top-16 z-30 w-[min(16.5rem,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl"
        >
          <div className="grid gap-1.5">
            {compactCounters.length > 0 ? (
              <div className={`grid gap-1.5 ${
                compactCounters.length >= 3
                  ? "grid-cols-3"
                  : compactCounters.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-1"
              }`}
              >
                {compactCounters.map((counter) => (
                  <MiniCounterCard
                    key={counter.key}
                    label={counter.label}
                    value={counter.value}
                    onDecrement={counter.onDec}
                    onIncrement={counter.onInc}
                    disabled={!canEditCounters || !counter.enabled || isSaving}
                  />
                ))}
              </div>
            ) : null}

            {canManageSharedStates ? (
              <div className="flex gap-1.5">
                <SharedStateButton
                  label="Monarch"
                  active={hasMonarch}
                  accent="amber"
                  icon={<Crown className="h-3 w-3" />}
                  onClick={() => onSetMonarch?.(hasMonarch ? null : seatNumber)}
                  disabled={!onSetMonarch || isSaving}
                />

                <SharedStateButton
                  label="Initiative"
                  active={hasInitiative}
                  accent="sky"
                  icon={<span className="text-[10px] font-black leading-none">!</span>}
                  onClick={() => onSetInitiative?.(hasInitiative ? null : seatNumber)}
                  disabled={!onSetInitiative || isSaving}
                />
              </div>
            ) : null}

            {isCommanderMode && commanderDamageOptions.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-1.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Commander Damage
                </div>

                <div className="grid gap-1">
                  {commanderDamageOptions.map((option) => (
                    <DamageRow
                      key={option.userId}
                      label={option.label}
                      value={option.amount}
                      editable={canEditCounters}
                      disabled={!onCommanderDamageChange || isSaving}
                      onDecrement={() => updateCommanderDamage(option.userId, option.amount - 1)}
                      onIncrement={() => updateCommanderDamage(option.userId, option.amount + 1)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CenteredSeatStateOverlay({
  tone,
  icon,
  label,
}: {
  tone: "ready" | "not-ready" | "away";
  icon: ReactNode;
  label: string;
})
{
  const toneClass =
    tone === "ready"
      ? "border-emerald-300/35 bg-emerald-500/20 text-emerald-50 shadow-[0_16px_60px_rgba(16,185,129,0.32)]"
      : tone === "away"
        ? "border-amber-300/35 bg-amber-500/20 text-amber-50 shadow-[0_16px_60px_rgba(245,158,11,0.26)]"
        : "border-red-300/35 bg-red-500/20 text-red-50 shadow-[0_16px_60px_rgba(239,68,68,0.3)]";

  return (
    <div className={`inline-flex min-w-[10rem] flex-col items-center justify-center gap-3 rounded-[1.75rem] border px-7 py-6 text-center backdrop-blur-xl ${toneClass}`}>
      <div className="drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]">{icon}</div>
      <div className="text-base font-semibold uppercase tracking-[0.22em]">{label}</div>
    </div>
  );
}

function TileViewActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
})
{
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-teal-300/28 bg-slate-950/84 text-teal-50 shadow-[0_14px_34px_rgba(2,8,23,0.34)] backdrop-blur transition duration-150 hover:-translate-y-0.5 hover:border-teal-200/45 hover:bg-teal-400/14 hover:text-white hover:shadow-[0_18px_36px_rgba(20,184,166,0.24)]"
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function HoverPreview({
  href,
  src,
  alt,
}: {
  href: string;
  src: string;
  alt: string;
})
{
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="absolute right-0 top-[calc(100%+0.6rem)] z-40 overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl"
    >
      <img
        src={src}
        alt={alt}
        className="block w-56 max-w-none object-cover"
      />
    </a>
  );
}

function VisibleCounterChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "sky" | "violet";
})
{
  const accentClass =
    accent === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : accent === "sky"
        ? "border-sky-400/20 bg-sky-400/10 text-sky-100"
        : "border-violet-400/20 bg-violet-400/10 text-violet-100";

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold shadow-lg backdrop-blur ${accentClass}`}>
      <span className="opacity-80">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MiniCounterCard({
  label,
  value,
  onDecrement,
  onIncrement,
  disabled,
}: {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled: boolean;
})
{
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-1.5 py-1">
      <div className="text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDecrement}
          disabled={disabled}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-slate-950 text-[10px] text-slate-200 transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          -
        </button>

        <div className="min-w-[1.25rem] text-center text-xs font-semibold text-slate-100">
          {value}
        </div>

        <button
          type="button"
          onClick={onIncrement}
          disabled={disabled}
          className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-slate-950 text-[10px] text-slate-200 transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SharedStateButton({
  label,
  active,
  accent,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  accent: "amber" | "sky";
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
})
{
  const activeClass =
    accent === "amber"
      ? "border-amber-400/30 bg-amber-400/14 text-amber-100"
      : "border-sky-400/30 bg-sky-400/14 text-sky-100";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? activeClass
          : "border-white/10 bg-white/[0.05] text-slate-200 hover:border-white/20 hover:bg-white/[0.08]"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function DamageRow({
  label,
  value,
  editable,
  disabled,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: number;
  editable: boolean;
  disabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
})
{
  return (
    <div className="flex items-center justify-between gap-1.5 rounded-lg border border-white/10 bg-slate-950/70 px-1.5 py-1">
      <div
        className="min-w-0 flex-1 basis-0 truncate pr-1 text-[10px] text-slate-200"
        title={label}
      >
        {label}
      </div>

      {editable ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDecrement}
            disabled={disabled}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-[10px] text-slate-200 transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            -
          </button>

          <div className="w-5 text-center text-[10px] font-semibold text-slate-100">
            {value}
          </div>

          <button
            type="button"
            onClick={onIncrement}
            disabled={disabled}
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-[10px] text-slate-200 transition hover:border-white/20 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            +
          </button>
        </div>
      ) : (
        <div className="text-[10px] font-semibold text-slate-100">
          {value}
        </div>
      )}
    </div>
  );
}
