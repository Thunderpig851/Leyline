import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMediaSession } from "../context/MediaSession";
import { useGameSession } from "../context/GameSession";
import { apiGet, apiPost, getStoredUserId, getStoredUsername } from "../lib/api";
import { socket } from "../lib/socket";
import LeftSidePanel from "../components/gamepage/LeftSidePanel";
import RightSidePanel from "../components/gamepage/RightSidePanel";
import PlayerTile from "../components/gamepage/PlayerTile";
import CommanderPanel from "../components/gamepage/CommanderPanel";
import PlayerOrderShuffleOverlay from "../components/gamepage/PlayerOrderShuffleOverlay";

type CommanderCard =
{
  name: string;
};

type GameStats =
{
  commanderDamage?: Record<string, number>;
  commanderCastCount?: number;
  life?: number;
  poison?: number;
  energy?: number;
  experience?: number;
};

type GameSeat =
{
  seatNumber: number;
  userId: string;
  username: string;
  connectionStatus: "connected" | "reconnecting" | "away";
  commanders?: CommanderCard[] | null;
  commander?: CommanderCard | null;
  stats?: GameStats | null;
};

type ActiveGame =
{
  _id: string;
  roomId: string;
  boardOrder?: number[];
  settings?: {
    format?: string;
    trackEnergy?: boolean;
    trackMonarch?: boolean;
    trackInitiative?: boolean;
    trackExperience?: boolean;
    enableDayNight?: boolean;
  };
  monarchSeatNumber?: number | null;
  initiativeSeatNumber?: number | null;
  dayNightState?: "day" | "night" | null;
  seats: GameSeat[];
};

type ActiveGameResponse =
{
  ok: boolean;
  game?: ActiveGame;
  error?: string;
};

type SeatStateResponse =
{
  ok: boolean;
  game?: ActiveGame;
  error?: string;
};

type CommanderDamageOption =
{
  userId: string;
  label: string;
  amount: number;
};

type PlayerOrderRandomizedPayload =
{
  gameId?: string;
  roomId?: string;
  boardOrder?: number[];
};

type ShuffleOverlayState =
{
  open: boolean;
  phase: "rolling" | "result";
  rollingLabel: string;
  finalOrder: string[];
};

function clampCounter(value: number, min: number, max: number)
{
  if (!Number.isFinite(value))
  {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function getStartingLife(format?: string)
{
  return format === "commander" ? 40 : 20;
}

function getSeatCommanders(seat?: GameSeat | null)
{
  if (!seat) return [];

  if (Array.isArray(seat.commanders) && seat.commanders.length > 0)
  {
    return seat.commanders;
  }

  if (seat.commander?.name)
  {
    return [seat.commander];
  }

  return [];
}

function getNormalizedBoardOrder(boardOrder?: number[])
{
  const baseOrder = Array.isArray(boardOrder) ? boardOrder : [];
  const normalized: number[] = [];

  for (const value of baseOrder)
  {
    const seatNumber = Number(value);

    if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 4)
    {
      continue;
    }

    if (!normalized.includes(seatNumber))
    {
      normalized.push(seatNumber);
    }
  }

  for (const seatNumber of [1, 2, 3, 4])
  {
    if (!normalized.includes(seatNumber))
    {
      normalized.push(seatNumber);
    }
  }

  return normalized;
}

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [gameId, setGameId] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [randomizingOrder, setRandomizingOrder] = useState(false);
  const [resettingGame, setResettingGame] = useState(false);
  const [savingSeatNumbers, setSavingSeatNumbers] = useState<number[]>([]);
  const [shuffleOverlay, setShuffleOverlay] = useState<ShuffleOverlayState>({
    open: false,
    phase: "rolling",
    rollingLabel: "",
    finalOrder: [],
  });
  const [commanderPanelOpen, setCommanderPanelOpen] = useState(false);
  const [commanderPanelSeatNumber, setCommanderPanelSeatNumber] = useState<number | null>(null);

  const shuffleIntervalRef = useRef<number | null>(null);
  const shuffleTimeoutRef = useRef<number | null>(null);
  const shuffleCloseTimeoutRef = useRef<number | null>(null);

  const { session, reset } = useGameSession();
  const mediaSession = useMediaSession();

  const navigate = useNavigate();
  const { roomId = "" } = useParams();

  useEffect(() =>
  {
    return () =>
    {
      if (shuffleIntervalRef.current != null)
      {
        window.clearInterval(shuffleIntervalRef.current);
      }

      if (shuffleTimeoutRef.current != null)
      {
        window.clearTimeout(shuffleTimeoutRef.current);
      }

      if (shuffleCloseTimeoutRef.current != null)
      {
        window.clearTimeout(shuffleCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() =>
  {
    if (!roomId)
    {
      navigate("/lobby", { replace: true });
      return;
    }

    if (mediaSession.status !== "connected")
    {
      navigate(`/rooms/${roomId}`,
      {
        replace: true,
        state: { reason: "refresh-reconnect" },
      });
    }
  }, [roomId, mediaSession.status, navigate]);

  useEffect(() =>
  {
    if (!roomId || mediaSession.status !== "connected") return;

    let cancelled = false;

    async function loadActiveGame()
    {
      try
      {
        const res = await apiGet<ActiveGameResponse>(`/api/live-games/room/${roomId}`);

        if (!res.ok || !res.data?.ok || !res.data?.game?._id) return;
        if (cancelled) return;

        const activeGame = res.data.game;
        const activeGameId = activeGame._id;

        setGame(activeGame);
        setGameId(activeGameId);

        const joinGameResult = await apiPost(`/api/live-games/${activeGameId}/join`, {});
        if (!joinGameResult.ok)
        {
          console.error("Failed to join live game:", joinGameResult.error);
          return;
        }

        if (socket.connected)
        {
          socket.emit("live-game:join",
          {
            gameId: activeGameId,
            roomId,
            userId: getStoredUserId(),
            username: getStoredUsername(),
          });
        }
      }
      catch (err)
      {
        console.error("Failed to load active game:", err);
      }
    }

    void loadActiveGame();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, mediaSession.status]);

  useEffect(() =>
  {
    if (!gameId) return;

    function handleGameUpdated(payload: { game?: ActiveGame })
    {
      if (!payload?.game) return;
      if (payload.game._id !== gameId) return;

      setGame(payload.game);
    }

    function handlePlayerOrderRandomized(payload: PlayerOrderRandomizedPayload)
    {
      if (payload?.gameId !== gameId) return;

      const normalizedOrder = getNormalizedBoardOrder(payload.boardOrder);
      const currentSeatMap = new Map(
        (game?.seats ?? []).map((seat) => [seat.seatNumber, seat])
      );

      const rollingLabels = normalizedOrder
        .map((seatNumber) => currentSeatMap.get(seatNumber)?.username)
        .filter((value): value is string => Boolean(value));

      if (rollingLabels.length === 0)
      {
        return;
      }

      if (shuffleIntervalRef.current != null)
      {
        window.clearInterval(shuffleIntervalRef.current);
      }

      if (shuffleTimeoutRef.current != null)
      {
        window.clearTimeout(shuffleTimeoutRef.current);
      }

      if (shuffleCloseTimeoutRef.current != null)
      {
        window.clearTimeout(shuffleCloseTimeoutRef.current);
      }

      let currentIndex = 0;

      setRandomizingOrder(true);
      setShuffleOverlay({
        open: true,
        phase: "rolling",
        rollingLabel: rollingLabels[0] || "",
        finalOrder: [],
      });

      shuffleIntervalRef.current = window.setInterval(() =>
      {
        currentIndex = (currentIndex + 1) % rollingLabels.length;

        setShuffleOverlay((current) => ({
          ...current,
          rollingLabel: rollingLabels[currentIndex] || current.rollingLabel,
        }));
      }, 110);

      shuffleTimeoutRef.current = window.setTimeout(() =>
      {
        if (shuffleIntervalRef.current != null)
        {
          window.clearInterval(shuffleIntervalRef.current);
          shuffleIntervalRef.current = null;
        }

        setShuffleOverlay({
          open: true,
          phase: "result",
          rollingLabel: "",
          finalOrder: rollingLabels,
        });

        shuffleCloseTimeoutRef.current = window.setTimeout(() =>
        {
          setShuffleOverlay({
            open: false,
            phase: "rolling",
            rollingLabel: "",
            finalOrder: [],
          });
          setRandomizingOrder(false);
        }, 900);
      }, 1400);
    }

    socket.on("game:updated", handleGameUpdated);
    socket.on("game:player-order-randomized", handlePlayerOrderRandomized);

    return () =>
    {
      socket.off("game:updated", handleGameUpdated);
      socket.off("game:player-order-randomized", handlePlayerOrderRandomized);
    };
  }, [gameId, game]);

  useEffect(() =>
  {
    if (!gameId || !roomId) return;

    function handleGameEnded(payload: { gameId?: string; roomId?: string })
    {
      if (payload?.gameId !== gameId) return;

      if (socket.connected)
      {
        socket.emit("live-game:leave",
        {
          gameId,
          roomId,
          userId: getStoredUserId(),
        });
      }

      if (typeof mediaSession.disconnectFromSFU === "function")
      {
        mediaSession.disconnectFromSFU();
      }

      if (typeof mediaSession.stopPreview === "function")
      {
        mediaSession.stopPreview();
      }

      reset();
      navigate("/lobby", { replace: true });
    }

    socket.on("game:ended", handleGameEnded);

    return () =>
    {
      socket.off("game:ended", handleGameEnded);
    };
  }, [gameId, roomId, mediaSession, navigate, reset]);

  useEffect(() =>
  {
    if (!gameId || !roomId || !socket.connected) return;

    socket.emit("live-game:join",
    {
      gameId,
      roomId,
      userId: getStoredUserId(),
      username: getStoredUsername(),
    });

    return () =>
    {
      socket.emit("live-game:leave",
      {
        gameId,
        roomId,
        userId: getStoredUserId(),
      });
    };
  }, [gameId, roomId]);

  async function updateSeatState(
    seatNumber: number,
    nextState: {
      life?: number;
      poison?: number;
      energy?: number;
      experience?: number;
      commanderDamage?: Record<string, number>;
      commanders?: CommanderCard[];
    }
  )
  {
    if (!gameId) return;

    setSavingSeatNumbers((prev) => [...new Set([...prev, seatNumber])]);

    try
    {
      const res = await apiPost<SeatStateResponse>(
        `/api/live-games/${gameId}/seats/${seatNumber}/state`,
        nextState
      );

      if (!res.ok)
      {
        console.error("Failed to update seat state:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    finally
    {
      setSavingSeatNumbers((prev) => prev.filter((value) => value !== seatNumber));
    }
  }

  async function handleCommandersChange(seatNumber: number, nextCommanders: CommanderCard[])
  {
    await updateSeatState(seatNumber, { commanders: nextCommanders });
  }

  async function handleLifeChange(seatNumber: number, nextLife: number)
  {
    await updateSeatState(seatNumber,
    {
      life: clampCounter(nextLife, 0, 999),
    });
  }

  async function handlePoisonChange(seatNumber: number, nextPoison: number)
  {
    await updateSeatState(seatNumber,
    {
      poison: clampCounter(nextPoison, 0, 99),
    });
  }

  async function handleEnergyChange(seatNumber: number, nextEnergy: number)
  {
    await updateSeatState(seatNumber,
    {
      energy: clampCounter(nextEnergy, 0, 999),
    });
  }

  async function handleExperienceChange(seatNumber: number, nextExperience: number)
  {
    await updateSeatState(seatNumber,
    {
      experience: clampCounter(nextExperience, 0, 999),
    });
  }

  async function handleCommanderDamageChange(seatNumber: number, nextCommanderDamage: Record<string, number>)
  {
    const sanitized = Object.fromEntries(
      Object.entries(nextCommanderDamage).map(([userId, amount]) => [
        userId,
        clampCounter(amount, 0, 99),
      ])
    );

    await updateSeatState(seatNumber,
    {
      commanderDamage: sanitized,
    });
  }

  const isSeatedPlayer = useMemo(() =>
  {
    const userId = getStoredUserId();
    return Boolean(game?.seats?.some((seat) => seat.userId === userId));
  }, [game]);

  async function handleRandomizePlayerOrder()
  {
    if (!gameId || !isHost || randomizingOrder) return;

    const res = await apiPost<ActiveGameResponse>(`/api/live-games/${gameId}/randomize-player-order`, {});

    if (!res.ok)
    {
      console.error("Failed to randomize player order:", res.error);
      return;
    }

    if (res.data?.ok && res.data.game)
    {
      setGame(res.data.game);
    }
  }

  async function handleResetGame()
  {
    if (!gameId || !isHost || resettingGame || endingGame) return;

    setResettingGame(true);

    try
    {
      const res = await apiPost<ActiveGameResponse>(`/api/live-games/${gameId}/reset`, {});

      if (!res.ok)
      {
        console.error("Failed to reset game:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to reset game:", err);
    }
    finally
    {
      setResettingGame(false);
    }
  }

  async function handleEndGame()
  {
    if (!gameId || !roomId || endingGame) return;

    setEndingGame(true);

    try
    {
      const res = await apiPost(`/api/live-games/${gameId}/end`, {});

      if (!res.ok)
      {
        console.error("Failed to end game:", res.error);
        return;
      }

      if (socket.connected)
      {
        socket.emit("live-game:leave",
        {
          gameId,
          roomId,
          userId: getStoredUserId(),
        });
      }

      if (typeof mediaSession.disconnectFromSFU === "function")
      {
        mediaSession.disconnectFromSFU();
      }

      if (typeof mediaSession.stopPreview === "function")
      {
        mediaSession.stopPreview();
      }

      reset();
      navigate("/lobby", { replace: true });
    }
    catch (err)
    {
      console.error("Failed to end game:", err);
    }
    finally
    {
      setEndingGame(false);
    }
  }

  async function handleLeaveGame()
  {
    if (leaving) return;

    setLeaving(true);

    try
    {
      if (gameId)
      {
        try
        {
          await apiPost(`/api/live-games/${gameId}/leave`, {});
        }
        catch (err)
        {
          console.error("Failed to leave live game:", err);
        }
      }

      if (roomId)
      {
        try
        {
          await apiPost(`/api/rooms/${roomId}/leave`, {});
        }
        catch (err)
        {
          console.error("Failed to leave room:", err);
        }
      }
    }
    finally
    {
      if (socket.connected && gameId && roomId)
      {
        socket.emit("live-game:leave",
        {
          gameId,
          roomId,
          userId: getStoredUserId(),
        });
      }

      if (typeof mediaSession.disconnectFromSFU === "function")
      {
        mediaSession.disconnectFromSFU();
      }

      if (typeof mediaSession.stopPreview === "function")
      {
        mediaSession.stopPreview();
      }

      reset();
      navigate("/lobby", { replace: true });
    }
  }

  function handleToggleSelfMic()
  {
    if (mediaSession.micEnabled)
    {
      void mediaSession.disableMic();
      return;
    }

    void mediaSession.enableMic();
  }

  function handleToggleSelfCam()
  {
    if (mediaSession.camEnabled)
    {
      void mediaSession.disableCam();
      return;
    }

    void mediaSession.enableCam();
  }

  async function handleSetMonarch(seatNumber: number | null)
  {
    if (!gameId || !isSeatedPlayer) return;

    try
    {
      const res = await apiPost<ActiveGameResponse>(
        `/api/live-games/${gameId}/markers`,
        { monarchSeatNumber: seatNumber }
      );

      if (!res.ok)
      {
        console.error("Failed to update monarch:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to update monarch:", err);
    }
  }

  async function handleSetInitiative(seatNumber: number | null)
  {
    if (!gameId || !isSeatedPlayer) return;

    try
    {
      const res = await apiPost<ActiveGameResponse>(
        `/api/live-games/${gameId}/markers`,
        { initiativeSeatNumber: seatNumber }
      );

      if (!res.ok)
      {
        console.error("Failed to update initiative:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to update initiative:", err);
    }
  }

  async function handleToggleDayNight()
  {
    if (!gameId || !isSeatedPlayer) return;

    const nextState =
      game?.dayNightState === "day"
        ? "night"
        : "day";

    try
    {
      const res = await apiPost<ActiveGameResponse>(
        `/api/live-games/${gameId}/markers`,
        { dayNightState: nextState }
      );

      if (!res.ok)
      {
        console.error("Failed to update day/night:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to update day/night:", err);
    }
  }

  const seatSlots = useMemo(() =>
  {
    const selfUserId = getStoredUserId();
    const remoteByUsername = new Map(
      Object.values(mediaSession.remoteMedia)
        .map((remote) => [String(remote.username).toLowerCase(), remote])
    );

    const orderedSeats = [...(game?.seats ?? [])].sort(
      (a, b) => a.seatNumber - b.seatNumber
    );

    const defaultLife = getStartingLife(game?.settings?.format);

    return [1, 2, 3, 4].map((seatNumber) =>
    {
      const seat = orderedSeats.find((entry) => entry.seatNumber === seatNumber);

      if (!seat)
      {
        return {
          seatNumber,
          title: `Seat ${seatNumber}`,
          stream: null,
          isSelf: false,
          status: "empty" as const,
          life: defaultLife,
          poison: 0,
          energy: 0,
          experience: 0,
          trackEnergy: false,
          trackExperience: false,
          commanders: [] as CommanderCard[],
          commanderDamageOptions: [] as CommanderDamageOption[],
          hasMonarch: false,
          hasInitiative: false,
          isSaving: false,
        };
      }

      const isSelf = seat.userId === selfUserId;

      const remote =
        !isSelf
          ? remoteByUsername.get(seat.username.toLowerCase()) ?? null
          : null;

      const commanderDamageMap = seat.stats?.commanderDamage ?? {};

      const commanderDamageOptions: CommanderDamageOption[] = orderedSeats
        .filter((entry) => entry.userId !== seat.userId)
        .map((entry) => ({
          userId: entry.userId,
          label: getSeatCommanders(entry).map((card) => card.name).join(" / ") || entry.username,
          amount: commanderDamageMap[entry.userId] ?? 0,
        }));

      return {
        seatNumber,
        title: isSelf ? "You" : seat.username,
        stream: isSelf ? mediaSession.localStream : remote?.stream ?? null,
        isSelf,
        status: seat.connectionStatus,
        life: seat.stats?.life ?? defaultLife,
        poison: seat.stats?.poison ?? 0,
        energy: seat.stats?.energy ?? 0,
        experience: seat.stats?.experience ?? 0,
        trackEnergy: Boolean(game?.settings?.trackEnergy),
        trackExperience: Boolean(game?.settings?.trackExperience),
        commanders: getSeatCommanders(seat),
        commanderDamageOptions,
        hasMonarch: game?.monarchSeatNumber === seatNumber,
        hasInitiative: game?.initiativeSeatNumber === seatNumber,
        isSaving: savingSeatNumbers.includes(seatNumber),
      };
    });
  }, [game, mediaSession.localStream, mediaSession.remoteMedia, savingSeatNumbers]);

  const displaySeatSlots = useMemo(() =>
  {
    const normalizedBoardOrder = getNormalizedBoardOrder(game?.boardOrder);
    const seatSlotMap = new Map(seatSlots.map((slot) => [slot.seatNumber, slot]));

    return normalizedBoardOrder
      .map((seatNumber) => seatSlotMap.get(seatNumber))
      .filter((slot): slot is (typeof seatSlots)[number] => Boolean(slot));
  }, [game?.boardOrder, seatSlots]);

  const activeCommanderSeat = useMemo(() =>
  {
    if (commanderPanelSeatNumber == null) return null;
    return seatSlots.find((slot) => slot.seatNumber === commanderPanelSeatNumber) || null;
  }, [seatSlots, commanderPanelSeatNumber]);

  if (mediaSession.status !== "connected")
  {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-6 py-4 text-sm text-slate-300 backdrop-blur">
            Reconnecting session...
          </div>
        </div>
      </div>
    );
  }

  const fallbackHostUserId =
    [...(game?.seats ?? [])]
      .sort((a, b) => a.seatNumber - b.seatNumber)[0]?.userId ?? "";

  const roomTitle = session.roomTitle || "Placeholder Room";
  const isHost = fallbackHostUserId === getStoredUserId();
  const maxPlayers = 4;
  const playerCount = game?.seats?.filter((seat) => Boolean(seat.userId)).length ?? 0;

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/78 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

        <div className="relative flex w-full items-center justify-between gap-4 px-5 py-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white drop-shadow-[0_1px_10px_rgba(255,255,255,0.08)] sm:text-xl">
              {roomTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleLeaveGame(); }}
              disabled={leaving}
              className="inline-flex shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:bg-red-500/12 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {leaving ? "Leaving..." : "Leave"}
            </button>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100dvh-74px)] w-full overflow-hidden">
        <main className="h-full w-full px-4 py-3">
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-2.5">
            {displaySeatSlots.map((slot) => (
              <PlayerTile
                key={slot.seatNumber}
                seatNumber={slot.seatNumber}
                isSelf={slot.isSelf}
                title={slot.title}
                stream={slot.stream}
                status={slot.status}
                life={slot.life}
                poison={slot.poison}
                energy={slot.energy}
                experience={slot.experience}
                trackEnergy={slot.trackEnergy}
                trackExperience={slot.trackExperience}
                commanders={slot.commanders}
                commanderDamageOptions={slot.commanderDamageOptions}
                hasMonarch={slot.hasMonarch}
                hasInitiative={slot.hasInitiative}
                isSaving={slot.isSaving}
                onLifeChange={
                  slot.isSelf
                    ? (nextLife) => { void handleLifeChange(slot.seatNumber, nextLife); }
                    : undefined
                }
                onPoisonChange={
                  slot.isSelf
                    ? (nextPoison) => { void handlePoisonChange(slot.seatNumber, nextPoison); }
                    : undefined
                }
                onEnergyChange={
                  slot.isSelf
                    ? (nextEnergy) => { void handleEnergyChange(slot.seatNumber, nextEnergy); }
                    : undefined
                }
                onExperienceChange={
                  slot.isSelf
                    ? (nextExperience) => { void handleExperienceChange(slot.seatNumber, nextExperience); }
                    : undefined
                }
                onCommanderDamageChange={
                  slot.isSelf
                    ? (nextCommanderDamage) =>
                    {
                      void handleCommanderDamageChange(slot.seatNumber, nextCommanderDamage);
                    }
                    : undefined
                }
                onSetMonarch={
                  slot.isSelf
                    ? (nextSeatNumber) => { void handleSetMonarch(nextSeatNumber); }
                    : undefined
                }
                onSetInitiative={
                  slot.isSelf
                    ? (nextSeatNumber) => { void handleSetInitiative(nextSeatNumber); }
                    : undefined
                }
                onOpenCommanderPanel={
                  slot.isSelf
                    ? () =>
                    {
                      setCommanderPanelSeatNumber(slot.seatNumber);
                      setCommanderPanelOpen(true);
                    }
                    : undefined
                }
              />
            ))}
          </div>
        </main>

        <PlayerOrderShuffleOverlay
          open={shuffleOverlay.open}
          phase={shuffleOverlay.phase}
          rollingLabel={shuffleOverlay.rollingLabel}
          finalOrder={shuffleOverlay.finalOrder}
        />

        <CommanderPanel
          open={commanderPanelOpen}
          seatTitle={activeCommanderSeat?.title || "You"}
          commanders={activeCommanderSeat?.commanders || []}
          canEdit={Boolean(activeCommanderSeat?.isSelf)}
          onClose={() =>
          {
            setCommanderPanelOpen(false);
            setCommanderPanelSeatNumber(null);
          }}
          onChange={(nextCommanders) =>
          {
            if (commanderPanelSeatNumber != null)
            {
              void handleCommandersChange(commanderPanelSeatNumber, nextCommanders);
            }
          }}
        />

        <LeftSidePanel
          open={leftOpen}
          onToggle={() => setLeftOpen((value) => !value)}
          isHost={Boolean(isHost)}
          playerCount={playerCount}
          maxPlayers={maxPlayers}
          randomizingOrder={randomizingOrder}
          resettingGame={resettingGame}
          endingGame={endingGame}
          dayNightState={game?.dayNightState ?? null}
          micEnabled={mediaSession.micEnabled}
          camEnabled={mediaSession.camEnabled}
          onRandomizePlayerOrder={() => { void handleRandomizePlayerOrder(); }}
          onResetGame={() => { void handleResetGame(); }}
          onEndGame={() => { void handleEndGame(); }}
          onToggleDayNight={
            isSeatedPlayer
              ? () => { void handleToggleDayNight(); }
              : undefined
          }
          onToggleSelfMic={handleToggleSelfMic}
          onToggleSelfCam={handleToggleSelfCam}
        />

        <RightSidePanel
          open={rightOpen}
          onToggle={() => setRightOpen((value) => !value)}
          roomId={roomId}
        />
      </div>
    </div>
  );
}