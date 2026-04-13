import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useMediaSession } from "../context/MediaSession";
import { useGameSession } from "../context/GameSession";
import { apiGet, apiPost, getStoredUserId, getStoredUsername } from "../lib/api";
import { socket } from "../lib/socket";
import LeftSidePanel from "../components/gamepage/LeftSidePanel";
import RightSidePanel from "../components/gamepage/RightSidePanel";
import PlayerTile from "../components/gamepage/PlayerTile";
import PlayerOrderShuffleOverlay from "../components/gamepage/PlayerOrderShuffleOverlay";
import CardCropDebugModal from "../components/CardCropDebugModal";
import { createDebugClickCrop } from "../card-id/debugClickCrop";
import { refineCardCrop } from "../card-id/refineCardCrop";
import { identifyCapturedCard } from "../card-id/identifyCard";
import type { CardIdentificationPreview } from "../card-id/identifyCard";
import type { IdentifiedCardCandidate } from "../card-id/identifyCard";


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

type GameSpectator =
{
  userId: string;
  username: string;
  connectionStatus: "connected" | "reconnecting" | "away";
};

type ActiveGame =
{
  _id: string;
  roomId: string;
  gameStartedAt: string | null;
  createdAt: string;
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
  activeTurnSeatNumber?: number | null;
  turnStartedAt?: string | null;
  seats: GameSeat[];
  spectators?: GameSpectator[];
};

type ActiveGameResponse =
{
  ok: boolean;
  game?: ActiveGame;
  error?: string;
};

type RoomSummary =
{
  hostID?: string;
  hostName?: string;
  visibility?: "public" | "private";
  isHost?: boolean;
};

type RoomResponse =
{
  ok: boolean;
  room?: RoomSummary;
  error?: string;
};

type PrivateCodeResponse =
{
  ok: boolean;
  privateCode?: string;
  error?: string;
};

type HostTransferResponse =
{
  ok: boolean;
  hostUserId?: string;
  hostName?: string;
  unchanged?: boolean;
  error?: string;
};

type HostTransferredPayload =
{
  gameId?: string;
  roomId?: string;
  hostUserId?: string;
  hostName?: string;
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

type KickPlayerResponse =
{
  ok: boolean;
  game?: ActiveGame;
  roomId?: string;
  targetUserId?: string;
  error?: string;
};

type PlayerKickedPayload =
{
  gameId?: string;
  roomId?: string;
  targetUserId?: string;
  removedByUserId?: string;
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

function getClockwiseDisplayBoardOrder(boardOrder?: number[])
{
  const normalized = getNormalizedBoardOrder(boardOrder);

  if (normalized.length < 4)
  {
    return normalized;
  }

  const [first, second, third, fourth, ...rest] = normalized;
  return [first, second, fourth, third, ...rest];
}

function truncateLabel(value: string, maxLength = 26)
{
  const trimmed = value.trim();

  if (trimmed.length <= maxLength)
  {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatTurnDuration(totalSeconds: number)
{
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0)
  {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function GamePage()
{
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [gameId, setGameId] = useState("");
  const [currentHostUserId, setCurrentHostUserId] = useState("");
  const [currentHostName, setCurrentHostName] = useState("");
  const [roomVisibility, setRoomVisibility] = useState<"public" | "private">("public");
  const [hostPrivateCode, setHostPrivateCode] = useState<string | null>(null);
  const [privateCodeCopiedMessage, setPrivateCodeCopiedMessage] = useState<string | null>(null);
  const [transferringHostSeatNumber, setTransferringHostSeatNumber] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [kickingSeatNumber, setKickingSeatNumber] = useState<number | null>(null);
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
  const [timerNow, setTimerNow] = useState(() => Date.now());

  const [cardCropOpen, setCardCropOpen] = useState(false);
  const [cardFrameUrl, setCardFrameUrl] = useState<string | null>(null);
  const [cardRoiDebugUrl, setCardRoiDebugUrl] = useState<string | null>(null);
  const [cardCandidateUrl, setCardCandidateUrl] = useState<string | null>(null);
  const [cardOcrPreviews, setCardOcrPreviews] = useState<CardIdentificationPreview[]>([]);
  const [cardStatusText, setCardStatusText] = useState<string>("Click a card to capture it");
  const [cardTitleSignal, setCardTitleSignal] = useState<string>("");
  const [cardTypeSignal, setCardTypeSignal] = useState<string>("");
  const [cardSignalsSummary, setCardSignalsSummary] = useState<string>("");
  const [cardCandidates, setCardCandidates] = useState<IdentifiedCardCandidate[]>([]);
  const [cardCropBusy, setCardCropBusy] = useState(false);
  const [cardCropLoading, setCardCropLoading] = useState(false);
  const [cardIdentifyLoading, setCardIdentifyLoading] = useState(false);

  const shuffleIntervalRef = useRef<number | null>(null);
  const shuffleTimeoutRef = useRef<number | null>(null);
  const shuffleCloseTimeoutRef = useRef<number | null>(null);
  const advancingTurnRef = useRef(false);
  const forcedExitRef = useRef(false);

  const { session, reset } = useGameSession();
  const mediaSession = useMediaSession();

  const navigate = useNavigate();
  const { roomId = "" } = useParams();

  const fallbackHostUserId =
    [...(game?.seats ?? [])]
      .sort((a, b) => a.seatNumber - b.seatNumber)[0]?.userId ?? "";

  const roomTitle = session.roomTitle || "Placeholder Room";
  const effectiveHostUserId = currentHostUserId || fallbackHostUserId;
  const isHost = effectiveHostUserId === getStoredUserId();
  const isCommanderGame = (game?.settings?.format || "commander") === "commander";
  const maxPlayers = isCommanderGame ? 4 : 2;
  const playerCount = game?.seats?.filter((seat) => Boolean(seat.userId)).length ?? 0;
  const spectatorCount = game?.spectators?.length ?? 0;

  const cardObjectUrlsRef = useRef<string[]>([]);

  const revokeCardObjectUrls = useCallback((urls: string[]) =>
  {
    for (const url of urls)
    {
      if (!url) continue;
      try
      {
        URL.revokeObjectURL(url);
      }
      catch
      {
      }
    }
  }, []);

  const resetCardCropState = useCallback((closeModal = true) =>
  {
    revokeCardObjectUrls(cardObjectUrlsRef.current);
    cardObjectUrlsRef.current = [];
    setCardFrameUrl(null);
    setCardRoiDebugUrl(null);
    setCardCandidateUrl(null);
    setCardOcrPreviews([]);
    setCardStatusText("Click a card to capture it");
    setCardTitleSignal("");
    setCardTypeSignal("");
    setCardSignalsSummary("");
    setCardCandidates([]);
    setCardCropLoading(false);
    setCardIdentifyLoading(false);

    if (closeModal)
    {
      setCardCropOpen(false);
    }
  }, [revokeCardObjectUrls]);

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const handleCardCropDebugClick = useCallback(
    async (
      event: ReactMouseEvent<HTMLVideoElement>,
      videoEl: HTMLVideoElement | null
    ) =>
    {
      if (!videoEl || cardCropBusy) return;
      if (!videoEl.videoWidth || !videoEl.videoHeight) return;

      const createdUrls: string[] = [];

      try
      {
        setCardCropBusy(true);
        resetCardCropState(false);
        setCardCropOpen(true);
        setCardCropLoading(true);
        setCardStatusText("Capturing local region");

        await waitForNextFrame();

        const crop = await createDebugClickCrop(
          videoEl,
          event.clientX,
          event.clientY,
          {
            maxDimension: 960,
            cropWidth: 420,
            cropHeight: 600,
            previewMaxWidth: 540,
          }
        );

        createdUrls.push(crop.frameUrl, crop.roiUrl);
        cardObjectUrlsRef.current = [...createdUrls];
        setCardFrameUrl(crop.frameUrl);
        setCardRoiDebugUrl(crop.roiUrl);
        setCardStatusText("Refining likely card candidate");

        await waitForNextFrame();

        const refined = await refineCardCrop(
          crop.roiImageData,
          crop.localClickX,
          crop.localClickY
        );

        createdUrls.push(refined.roiDebugUrl, refined.candidateUrl);
        cardObjectUrlsRef.current = [...createdUrls];
        setCardRoiDebugUrl(refined.roiDebugUrl);
        setCardCandidateUrl(refined.candidateUrl);
        setCardStatusText(refined.statusText);
        setCardIdentifyLoading(true);
        setCardStatusText(`${refined.statusText} • reading name and type`);

        await waitForNextFrame();

        try
        {
          const identification = await identifyCapturedCard(refined.candidateUrl);
          createdUrls.push(...identification.objectUrls);
          cardObjectUrlsRef.current = [...createdUrls];
          setCardOcrPreviews(identification.previews);
          setCardTitleSignal(identification.title.text);
          setCardTypeSignal(identification.typeLine.text);
          setCardSignalsSummary(identification.signalsSummary);
          setCardCandidates(identification.candidates);
          setCardStatusText(identification.signalsSummary || refined.statusText);
        }
        catch (identificationError)
        {
          console.error("Card identification failed", identificationError);
          setCardStatusText(`${refined.statusText} • identification failed`);
        }
        finally
        {
          setCardIdentifyLoading(false);
        }
      }
      catch (error)
      {
        revokeCardObjectUrls(createdUrls);
        console.error("Card crop debug failed", error);
        setCardStatusText("Capture failed");
      }
      finally
      {
        setCardCropLoading(false);
        setCardCropBusy(false);
      }
    },
    [cardCropBusy, resetCardCropState, revokeCardObjectUrls]
  );

  useEffect(() =>
  {
    return () =>
    {
      revokeCardObjectUrls(cardObjectUrlsRef.current);
      cardObjectUrlsRef.current = [];
    };
  }, [revokeCardObjectUrls]);

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

    const allowPassiveSpectatorBoot =
      session.viewerMode === "spectator"
      && session.roomId === roomId
      && (mediaSession.status === "idle" || mediaSession.status === "connecting");

    if (mediaSession.status !== "connected" && !allowPassiveSpectatorBoot)
    {
      if (forcedExitRef.current)
      {
        navigate("/lobby", { replace: true });
        return;
      }

      navigate(`/rooms/${roomId}`,
      {
        replace: true,
        state: { reason: "refresh-reconnect" },
      });
    }
}, [roomId, mediaSession.status, navigate, session.roomId, session.viewerMode]);

  useEffect(() =>
  {
    if (!roomId) return;
    if (session.viewerMode !== "spectator") return;
    if (session.roomId !== roomId) return;
    if (mediaSession.status !== "idle") return;

    let cancelled = false;

    void (async () =>
    {
      try
      {
        await mediaSession.connectToSFU(roomId, { publishLocal: false });
      }
      catch (error)
      {
        if (cancelled)
        {
          return;
        }

        console.error("Failed to connect spectator session:", error);
        navigate("/lobby", { replace: true });
      }
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, mediaSession, mediaSession.status, navigate, session.roomId, session.viewerMode]);

  useEffect(() =>
  {
    if (!roomId || mediaSession.status !== "connected") return;

    let cancelled = false;

    async function loadActiveGame()
    {
      try
      {
        const [gameRes, roomRes] = await Promise.all([
          apiGet<ActiveGameResponse>(`/api/live-games/room/${roomId}`),
          apiGet<RoomResponse>(`/api/rooms/${roomId}`),
        ]);

        if (!gameRes.ok || !gameRes.data?.ok || !gameRes.data?.game?._id) return;
        if (cancelled) return;

        if (roomRes.ok && roomRes.data?.ok && roomRes.data.room)
        {
          setCurrentHostUserId(roomRes.data.room.hostID || "");
          setCurrentHostName(roomRes.data.room.hostName || "");
          setRoomVisibility(roomRes.data.room.visibility === "private" ? "private" : "public");
        }

        const activeGame = gameRes.data.game;
        const activeGameId = activeGame._id;

        setGame(activeGame);
        setGameId(activeGameId);

        const joinGameResult = await apiPost(`/api/live-games/${activeGameId}/join`, {
          role: session.viewerMode === "spectator" ? "spectator" : "player",
        });
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
  }, [roomId, mediaSession.status, session.viewerMode]);

  useEffect(() =>
  {
    if (!gameId || !roomId) return;

    function handlePlayerKicked(payload: PlayerKickedPayload)
    {
      const storedUserId = getStoredUserId();

      if (!storedUserId) return;
      if (payload?.gameId !== gameId) return;
      if (payload?.targetUserId !== storedUserId) return;

      if (socket.connected)
      {
        socket.emit("live-game:leave",
        {
          gameId,
          roomId,
          userId: storedUserId,
        });
      }

      forcedExitRef.current = true;

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

    socket.on("game:player-kicked", handlePlayerKicked);

    return () =>
    {
      socket.off("game:player-kicked", handlePlayerKicked);
    };
  }, [gameId, roomId, mediaSession, navigate, reset]);

  useEffect(() =>
  {
    if (roomVisibility !== "private" || !isHost || !roomId)
    {
      setHostPrivateCode(null);
      return;
    }

    let cancelled = false;

    void (async () =>
    {
      const res = await apiGet<PrivateCodeResponse>(`/api/rooms/${roomId}/private-code`);

      if (cancelled)
      {
        return;
      }

      if (!res.ok)
      {
        setHostPrivateCode(null);
        return;
      }

      setHostPrivateCode(res.data.privateCode || null);
    })();

    return () =>
    {
      cancelled = true;
    };
  }, [roomId, roomVisibility, isHost]);

  useEffect(() =>
  {
    if (!privateCodeCopiedMessage)
    {
      return;
    }

    const timeout = window.setTimeout(() => setPrivateCodeCopiedMessage(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [privateCodeCopiedMessage]);

  useEffect(() =>
  {
    if (!gameId) return;

    function handleGameUpdated(payload: { game?: ActiveGame })
    {
      if (!payload?.game) return;
      if (payload.game._id !== gameId) return;

      const storedUserId = getStoredUserId();
      const stillParticipating = storedUserId
        ? payload.game.seats.some((seat) => seat.userId === storedUserId)
          || (payload.game.spectators ?? []).some((spectator) => spectator.userId === storedUserId)
        : true;

      if (!stillParticipating)
      {
        if (socket.connected && roomId && storedUserId)
        {
          socket.emit("live-game:leave",
          {
            gameId,
            roomId,
            userId: storedUserId,
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
        return;
      }

      setGame(payload.game);
    }

    function handleHostTransferred(payload: HostTransferredPayload)
    {
      if (!payload) return;
      if (payload.roomId !== roomId) return;

      setCurrentHostUserId(payload.hostUserId || "");
      setCurrentHostName(payload.hostName || "");
      setTransferringHostSeatNumber(null);
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
    socket.on("game:host-transferred", handleHostTransferred);

    return () =>
    {
      socket.off("game:updated", handleGameUpdated);
      socket.off("game:player-order-randomized", handlePlayerOrderRandomized);
      socket.off("game:host-transferred", handleHostTransferred);
    };
  }, [gameId, game, roomId, mediaSession, navigate, reset]);

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

  useEffect(() =>
  {
    if (!game?.gameStartedAt && !game?.turnStartedAt)
    {
      return;
    }

    setTimerNow(Date.now());

    const intervalId = window.setInterval(() =>
    {
      setTimerNow(Date.now());
    }, 1000);

    return () =>
    {
      window.clearInterval(intervalId);
    };
  }, [game?.gameStartedAt, game?.turnStartedAt]);

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
    payload:
    {
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
      life: clampCounter(nextLife, 0, 99999),
    });
  }

  async function handlePoisonChange(seatNumber: number, nextPoison: number)
  {
    await updateSeatState(seatNumber,
    {
      poison: clampCounter(nextPoison, 0, 10),
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

  const isSeatedPlayer = useMemo(() =>
  {
    const userId = getStoredUserId();
    return Boolean(game?.seats?.some((seat) => seat.userId === userId));
  }, [game]);

  const isSpectator = useMemo(() =>
  {
    const userId = getStoredUserId();
    return Boolean((game?.spectators ?? []).some((spectator) => spectator.userId === userId));
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

  async function handleKickPlayer(seatNumber: number)
  {
    if (!gameId || !isHost) return;

    const targetSeat = game?.seats.find((seat) => seat.seatNumber === seatNumber);
    if (!targetSeat?.userId) return;

    setKickingSeatNumber(seatNumber);

    try
    {
      const res = await apiPost<KickPlayerResponse>(
        `/api/live-games/${gameId}/kick-player`,
        { targetUserId: targetSeat.userId }
      );

      if (!res.ok)
      {
        console.error("Failed to kick player:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to kick player:", err);
    }
    finally
    {
      setKickingSeatNumber(null);
    }
  }

  async function handlePromoteToHost(seatNumber: number)
  {
    if (!gameId || !isHost) return;

    const targetSeat = game?.seats.find((seat) => seat.seatNumber === seatNumber);
    if (!targetSeat?.userId) return;

    setTransferringHostSeatNumber(seatNumber);

    try
    {
      const res = await apiPost<HostTransferResponse>(
        `/api/live-games/${gameId}/transfer-host`,
        { targetUserId: targetSeat.userId }
      );

      if (!res.ok)
      {
        console.error("Failed to transfer host:", res.error);
        return;
      }

      if (res.data?.ok)
      {
        setCurrentHostUserId(res.data.hostUserId || "");
        setCurrentHostName(res.data.hostName || "");
      }
    }
    catch (err)
    {
      console.error("Failed to transfer host:", err);
    }
    finally
    {
      setTransferringHostSeatNumber(null);
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

      forcedExitRef.current = true;

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
        const leaveGameResult = await apiPost(`/api/live-games/${gameId}/leave`, {});

        if (!leaveGameResult.ok)
        {
          console.error(
            "Failed to leave live game:",
            "error" in leaveGameResult ? leaveGameResult.error : "Request failed."
          );
        }
      }

      if (roomId)
      {
        const leaveRoomResult = await apiPost(`/api/rooms/${roomId}/leave`, {});

        if (!leaveRoomResult.ok)
        {
          console.error(
            "Failed to leave room:",
            "error" in leaveRoomResult ? leaveRoomResult.error : "Request failed."
          );
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
    mediaSession.toggleMic();
  }

  function handleToggleSelfCam()
  {
    mediaSession.toggleCam();
  }

  async function handleCopyPrivateCode()
  {
    if (!hostPrivateCode)
    {
      return;
    }

    try
    {
      await navigator.clipboard.writeText(hostPrivateCode);
      setPrivateCodeCopiedMessage("Copied");
    }
    catch
    {
      setPrivateCodeCopiedMessage("Copy failed");
    }
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

  async function handleAdvanceTurn()
  {
    if (!gameId || !isSeatedPlayer || advancingTurnRef.current) return;

    advancingTurnRef.current = true;

    try
    {
      const res = await apiPost<ActiveGameResponse>(`/api/live-games/${gameId}/turn/advance`, {});

      if (!res.ok)
      {
        console.error("Failed to advance turn:", res.error);
        return;
      }

      if (res.data?.ok && res.data.game)
      {
        setGame(res.data.game);
      }
    }
    catch (err)
    {
      console.error("Failed to advance turn:", err);
    }
    finally
    {
      advancingTurnRef.current = false;
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
          userId: "",
          title: `Seat ${seatNumber}`,
          stream: null,
          isSelf: false,
          status: "empty" as const,
          life: defaultLife,
          poison: 0,
          energy: 0,
          experience: 0,
          trackEnergy: Boolean(game?.settings?.trackEnergy),
          trackExperience: Boolean(game?.settings?.trackExperience),
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
          label: truncateLabel(getSeatCommanders(entry).map((card) => card.name).join(" / ") || entry.username),
          amount: commanderDamageMap[entry.userId] ?? 0,
        }));

      return {
        seatNumber,
        userId: seat.userId,
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
    const normalizedBoardOrder = isCommanderGame
      ? getClockwiseDisplayBoardOrder(game?.boardOrder)
      : getNormalizedBoardOrder(game?.boardOrder);
    const seatSlotMap = new Map(seatSlots.map((slot) => [slot.seatNumber, slot]));

    return normalizedBoardOrder
      .map((seatNumber) => seatSlotMap.get(seatNumber))
      .filter((slot): slot is (typeof seatSlots)[number] => Boolean(slot));
  }, [game?.boardOrder, isCommanderGame, seatSlots]);

  const activeTurnSeat = useMemo(() =>
  {
    if (!game?.activeTurnSeatNumber) return null;
    return seatSlots.find((slot) => slot.seatNumber === game.activeTurnSeatNumber) || null;
  }, [game?.activeTurnSeatNumber, seatSlots]);

  const turnElapsedSeconds = useMemo(() =>
  {
    if (!game?.turnStartedAt || !game?.activeTurnSeatNumber)
    {
      return 0;
    }

    const startedAt = new Date(game.turnStartedAt).getTime();

    if (!Number.isFinite(startedAt))
    {
      return 0;
    }

    return Math.max(0, Math.floor((timerNow - startedAt) / 1000));
  }, [game?.turnStartedAt, game?.activeTurnSeatNumber, timerNow]);

  const gameElapsedSeconds = useMemo(() =>
  {
    if (!game?.gameStartedAt)
    {
      return 0;
    }

    const startedAt = new Date(game.gameStartedAt).getTime();

    if (!Number.isFinite(startedAt))
    {
      return 0;
    }

    return Math.max(0, Math.floor((timerNow - startedAt) / 1000));
  }, [game?.gameStartedAt, timerNow]);

  useEffect(() =>
  {
    if (!gameId || !isSeatedPlayer) return;

    function isEditableTarget(target: EventTarget | null)
    {
      if (!(target instanceof HTMLElement))
      {
        return false;
      }

      if (target.isContentEditable)
      {
        return true;
      }

      const tagName = target.tagName.toLowerCase();

      if (["input", "textarea", "select", "button"].includes(tagName))
      {
        return true;
      }

      return Boolean(target.closest("input, textarea, select, button, [contenteditable='true']"));
    }

    function handleKeyDown(event: KeyboardEvent)
    {
      if (event.code !== "Space" && event.key !== " ")
      {
        return;
      }

      if (event.repeat || isEditableTarget(event.target))
      {
        return;
      }

      event.preventDefault();
      void handleAdvanceTurn();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () =>
    {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [gameId, isSeatedPlayer]);

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
    <div className="h-[100dvh] w-screen overflow-hidden bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/78 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />

        <div className="relative flex w-full items-center justify-between gap-4 px-5 py-2">
          <div className="min-w-0 flex flex-1 items-center gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white drop-shadow-[0_1px_10px_rgba(255,255,255,0.08)] sm:text-xl">
              {roomTitle}
            </h1>

            {isSpectator ? (
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-xs font-semibold text-violet-100 shadow-lg">
                Spectating
              </div>
            ) : null}

            {game?.gameStartedAt ? (
              <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100 shadow-lg">
                <span className="hidden sm:inline text-cyan-50/90">
                  Game
                </span>
                <span className="font-mono tracking-wide">
                  {formatTurnDuration(gameElapsedSeconds)}
                </span>
              </div>
            ) : null}
          </div>

          {game?.dayNightState || activeTurnSeat ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex max-w-[calc(100vw-18rem)] -translate-x-1/2 -translate-y-1/2 items-center gap-2">
              {activeTurnSeat ? (
                <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-400/12 px-3 py-1.5 text-xs font-semibold text-emerald-100 shadow-lg">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
                  <span className="max-w-[8rem] truncate sm:max-w-[12rem]">
                    {activeTurnSeat.title}
                  </span>
                  <span className="rounded-full border border-emerald-200/20 bg-slate-950/45 px-2 py-0.5 font-mono text-[11px] tracking-wide text-emerald-50">
                    {formatTurnDuration(turnElapsedSeconds)}
                  </span>
                </div>
              ) : null}

              {game?.dayNightState ? (
                <div
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg ${
                    game.dayNightState === "day"
                      ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
                      : "border-indigo-300/35 bg-indigo-400/12 text-indigo-100"
                  }`}
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                      game.dayNightState === "day"
                        ? "border-amber-200/30 bg-amber-300/12"
                        : "border-indigo-200/30 bg-indigo-300/12"
                    }`}
                  >
                    {game.dayNightState === "day" ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </span>

                  <span className="hidden sm:inline">
                    {game.dayNightState === "day" ? "Day" : "Night"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleLeaveGame(); }}
              disabled={leaving}
              className="inline-flex shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-400/40 hover:bg-red-500/12 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {leaving ? "Leaving..." : "Leave Game "}
            </button>
          </div>
        </div>
      </header>

      <div className="relative h-[calc(100dvh-70px)] w-full overflow-hidden">
        <main className="h-full w-full px-1.5 py-1">
          <div
            className={`grid h-full gap-0.5 ${
              isCommanderGame
                ? "grid-cols-2 grid-rows-2"
                : "mx-auto max-w-[1200px] grid-cols-1 grid-rows-2"
            }`}
          >
            {displaySeatSlots.map((slot) => (
              <PlayerTile
                key={slot.seatNumber}
                seatNumber={slot.seatNumber}
                mode={isCommanderGame ? "commander" : "duel"}
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
                isActiveTurn={game?.activeTurnSeatNumber === slot.seatNumber}
                isSaving={slot.isSaving}
                canPromoteToHost=
                {
                    Boolean(
                      isHost &&
                      slot.userId &&
                      !slot.isSelf &&
                      slot.userId !== effectiveHostUserId
                    )
                  }
                  canKickPlayer=
                  {
                    Boolean(
                      isHost &&
                      slot.userId &&
                      !slot.isSelf &&
                      slot.userId !== effectiveHostUserId
                    )
                  }
                  promotingToHost={transferringHostSeatNumber === slot.seatNumber}
                  kickingPlayer={kickingSeatNumber === slot.seatNumber}
                  onPromoteToHost=
                  {
                    isHost && slot.userId && !slot.isSelf
                      ? () => { void handlePromoteToHost(slot.seatNumber); }
                      : undefined
                  }
                  onKickPlayer=
                  {
                    isHost && slot.userId && !slot.isSelf
                      ? () => { void handleKickPlayer(slot.seatNumber); }
                      : undefined
                  }
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
                onCommandersChange={
                  slot.isSelf
                    ? (nextCommanders) =>
                    {
                      void handleCommandersChange(slot.seatNumber, nextCommanders);
                    }
                    : undefined
                }

                onCardCropDebugClick={handleCardCropDebugClick}
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

        <LeftSidePanel
          open={leftOpen}
          onToggle={() => setLeftOpen((value) => !value)}
          isHost={Boolean(isHost)}
          currentHostName={currentHostName || "Unknown"}
          roomVisibility={roomVisibility}
          hostPrivateCode={hostPrivateCode}
          privateCodeCopiedMessage={privateCodeCopiedMessage}
          playerCount={playerCount}
          maxPlayers={maxPlayers}
          spectatorCount={spectatorCount}
          maxSpectators={4}
          showLocalMediaControls={!isSpectator}
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
          onToggleSelfMic={isSpectator ? undefined : handleToggleSelfMic}
          onToggleSelfCam={isSpectator ? undefined : handleToggleSelfCam}
          onCopyPrivateCode={() => { void handleCopyPrivateCode(); }}
        />

        <RightSidePanel
          open={rightOpen}
          onToggle={() => setRightOpen((value) => !value)}
          roomId={roomId}
        />
      </div>

        <CardCropDebugModal
          open={cardCropOpen}
          frameUrl={cardFrameUrl}
          roiDebugUrl={cardRoiDebugUrl}
          candidateUrl={cardCandidateUrl}
          ocrPreviews={cardOcrPreviews}
          statusText={cardStatusText}
          titleSignal={cardTitleSignal}
          typeSignal={cardTypeSignal}
          signalsSummary={cardSignalsSummary}
          candidates={cardCandidates}
          loading={cardCropLoading}
          identifying={cardIdentifyLoading}
          onClose={() => resetCardCropState()}
        />
    </div>
  );
}