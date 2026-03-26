import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMediaSession } from "../context/MediaSession";
import { useGameSession } from "../context/GameSession";
import { apiGet, apiPost, getStoredUserId, getStoredUsername } from "../lib/api";
import { socket } from "../lib/socket";
import SidePanel from "../components/gamepage/SidePanel";
import RightSidePanel from "../components/gamepage/RightSidePanel";
import PlayerTile from "../components/gamepage/PlayerTile";
import CommanderPanel from "../components/gamepage/CommanderPanel";

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
  settings?: {
    format?: string;
  };
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

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [gameId, setGameId] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [savingSeatNumbers, setSavingSeatNumbers] = useState<number[]>([]);
  const [commanderPanelOpen, setCommanderPanelOpen] = useState(false);
  const [commanderPanelSeatNumber, setCommanderPanelSeatNumber] = useState<number | null>(null);

  const { session, reset } = useGameSession();
  const mediaSession = useMediaSession();

  const navigate = useNavigate();
  const { roomId = "" } = useParams();

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

    socket.on("game:updated", handleGameUpdated);

    return () =>
    {
      socket.off("game:updated", handleGameUpdated);
    };
  }, [gameId]);

  useEffect(() =>
  {
    if (!gameId || !roomId) return;

    const userId = getStoredUserId();
    const username = getStoredUsername();

    function sendHeartbeat(
    {
      hidden = document.visibilityState === "hidden",
      page = hidden ? "hidden" : "game",
    }: {
      hidden?: boolean;
      page?: "game" | "room" | "hidden";
    } = {})
    {
      if (!socket.connected || !userId) return;

      socket.emit("live-game:heartbeat",
      {
        gameId,
        roomId,
        userId,
        username,
        hidden,
        page,
      });
    }

    function handleSocketReconnect()
    {
      if (!socket.connected || !userId) return;

      socket.emit("live-game:join",
      {
        gameId,
        roomId,
        userId,
        username,
      });

      sendHeartbeat({ hidden: false, page: "game" });
    }

    sendHeartbeat({ hidden: false, page: "game" });

    const intervalId = window.setInterval(() =>
    {
      sendHeartbeat();
    }, 15000);

    function handleVisibilityChange()
    {
      const hidden = document.visibilityState === "hidden";

      sendHeartbeat({
        hidden,
        page: hidden ? "hidden" : "game",
      });
    }

    function handlePageHide()
    {
      sendHeartbeat({
        hidden: true,
        page: "hidden",
      });
    }

    socket.on("connect", handleSocketReconnect);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () =>
    {
      if (socket.connected && userId)
      {
        sendHeartbeat({
          hidden: false,
          page: "room",
        });
      }

      socket.off("connect", handleSocketReconnect);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.clearInterval(intervalId);
    };
  }, [gameId, roomId]);

  function setSeatSaving(seatNumber: number, isSaving: boolean)
  {
    setSavingSeatNumbers((current) =>
    {
      if (isSaving)
      {
        return current.includes(seatNumber) ? current : [...current, seatNumber];
      }

      return current.filter((value) => value !== seatNumber);
    });
  }

  async function updateSeatState(
    seatNumber: number,
    payload: {
      life?: number;
      poison?: number;
      commanderDamage?: Record<string, number>;
      commanders?: CommanderCard[];
    }
  )
  {
    if (!gameId) return;

    setSeatSaving(seatNumber, true);

    try
    {
      const res = await apiPost<SeatStateResponse>(
        `/api/live-games/${gameId}/seats/${seatNumber}/state`,
        payload
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
    catch (err)
    {
      console.error("Failed to update seat state:", err);
    }
    finally
    {
      setSeatSaving(seatNumber, false);
    }
  }

  async function handleCommandersChange(
    seatNumber: number,
    nextCommanders: CommanderCard[]
  )
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

  async function handleCommanderDamageChange(
    seatNumber: number,
    nextCommanderDamage: Record<string, number>
  )
  {
    const sanitized: Record<string, number> = {};

    for (const [userId, value] of Object.entries(nextCommanderDamage))
    {
      sanitized[userId] = clampCounter(value, 0, 99);
    }

    await updateSeatState(seatNumber,
    {
      commanderDamage: sanitized,
    });
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

  const seatSlots = useMemo(() =>
  {
    const selfUserId = getStoredUserId();

    const remoteByUsername = new Map(
      Object.values(mediaSession.remoteMedia)
        .filter((remote) => remote.username)
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
          title: `Seat ${seatNumber} · Open`,
          stream: null,
          isSelf: false,
          status: "empty" as const,
          life: defaultLife,
          poison: 0,
          commanders: [] as CommanderCard[],
          commanderDamageOptions: [] as CommanderDamageOption[],
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
        commanders: getSeatCommanders(seat),
        commanderDamageOptions,
        isSaving: savingSeatNumbers.includes(seatNumber),
      };
    });
  }, [game, mediaSession.localStream, mediaSession.remoteMedia, savingSeatNumbers]);

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

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight" />
            <div className="mt-0.5 truncate text-xs text-slate-400">
              <span className="text-slate-200">{session.roomTitle || "Placeholder Room"}</span>{" "}
              <span className="text-slate-600">·</span>{" "}
              <button
                type="button"
                onClick={() => { void handleLeaveGame(); }}
                disabled={leaving}
                className="ml-2 text-slate-200 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {leaving ? "Leaving..." : "Leave Game"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100vh-57px)] w-full overflow-hidden">
        <main className="h-full w-full px-6 py-6">
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-4">
            <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-4">
              {seatSlots.map((slot) => (
                <PlayerTile
                  key={slot.seatNumber}
                  isSelf={slot.isSelf}
                  title={slot.title}
                  stream={slot.stream}
                  status={slot.status}
                  life={slot.life}
                  poison={slot.poison}
                  commanders={slot.commanders}
                  commanderDamageOptions={slot.commanderDamageOptions}
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
                  onCommanderDamageChange={
                    slot.isSelf
                      ? (nextCommanderDamage) =>
                        {
                          void handleCommanderDamageChange(slot.seatNumber, nextCommanderDamage);
                        }
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
          </div>
        </main>

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

        <SidePanel
          side="left"
          open={leftOpen}
          title="Left Panel"
          description="Placeholder for chat, card log, notifications."
          onToggle={() => setLeftOpen((value) => !value)}
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