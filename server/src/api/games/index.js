const requireAuth = require("../../middleware/requireAuth");
const router = require("express").Router();

const LiveGameModel = require("../../database/models/LiveGame");
const RoomModel = require("../../database/models/Room");
const RoomChatMessageModel = require("../../database/models/RoomChatMessage");
const { clearPresenceForGame, clearPresenceForUser } = require("../../middleware/liveGamePresence");

router.get("/", (req, res) => res.json({ ok: true, route: "live-games" }));

function getStartingLife(format)
{
  return format === "commander" ? 40 : 20;
}

function getHostUserIdForGame(game, room)
{
  if (room?.hostID)
  {
    return room.hostID.toString();
  }

  const firstSeat = [...(game.seats || [])]
    .sort((a, b) => a.seatNumber - b.seatNumber)[0];

  return firstSeat?.userId?.toString() || null;
}

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = Array.isArray(room.members) ? room.members.length : 0;
  return memberCount >= maxPlayers ? "full" : "open";
}

function clearCommanderDamageForUser(game, removedUserId)
{
  const normalizedRemovedUserId = String(removedUserId || "");

  if (!normalizedRemovedUserId)
  {
    return;
  }

  for (const seat of game.seats || [])
  {
    const commanderDamage = seat?.stats?.commanderDamage;

    if (!commanderDamage)
    {
      continue;
    }

    if (typeof commanderDamage.delete === "function")
    {
      commanderDamage.delete(normalizedRemovedUserId);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(commanderDamage, normalizedRemovedUserId))
    {
      delete commanderDamage[normalizedRemovedUserId];
    }
  }
}

function emitGameUpdated(io, game)
{
  io.to(`live-game:${game._id}`).emit("game:updated", { game });
  io.to(`room:${game.roomId}`).emit("live-game:updated", { game });
}

function emitGameStarted(io, game)
{
  io.to(`room:${game.roomId}`).emit("game:started", {
    gameId: game._id,
    roomId: game.roomId,
  });

  io.to(`live-game:${game._id}`).emit("game:started", {
    gameId: game._id,
    roomId: game.roomId,
  });
}

function emitGameEnded(io, game)
{
  io.to(`room:${game.roomId}`).emit("game:ended", {
    gameId: game._id,
    roomId: game.roomId,
  });

  io.to(`live-game:${game._id}`).emit("game:ended", {
    gameId: game._id,
    roomId: game.roomId,
  });
}

function emitHostTransferred(io, game, room)
{
  const payload = {
    gameId: String(game._id),
    roomId: String(game.roomId),
    hostUserId: room.hostID ? room.hostID.toString() : "",
    hostName: room.hostName || "",
  };

  io.to(`live-game:${game._id}`).emit("game:host-transferred", payload);
  io.to(`room:${game.roomId}`).emit("game:host-transferred", payload);
  io.emit("rooms:changed");
}

function emitBoardOrderRandomized(io, game)
{
  io.to(`live-game:${game._id}`).emit("game:player-order-randomized", {
    gameId: game._id,
    roomId: game.roomId,
    boardOrder: game.boardOrder,
  });

  io.to(`room:${game.roomId}`).emit("game:player-order-randomized", {
    gameId: game._id,
    roomId: game.roomId,
    boardOrder: game.boardOrder,
  });
}

function emitRoomUpdated(io, room)
{
  io.to(`room:${room._id}`).emit("room:updated", { room });
  io.emit("rooms:changed");
}

function emitLobbyRefresh(io)
{
  io.emit("rooms:changed");
}

function getSpectatorParticipant(game, userId)
{
  return Array.isArray(game?.spectators)
    ? game.spectators.find((spectator) => spectator.userId?.toString() === String(userId))
    : null;
}

function getSpectatorCount(game)
{
  return Array.isArray(game?.spectators) ? game.spectators.length : 0;
}

function emitPlayerKicked(io, game, payload)
{
  io.to(`room:${game.roomId}`).emit("game:player-kicked", payload);
  io.to(`live-game:${game._id}`).emit("game:player-kicked", payload);
}

async function forceKickUserSockets(io, game, room, targetUserId, payload)
{
  if (!io || !game?._id || !room?._id || !targetUserId)
  {
    return;
  }

  const normalizedTargetUserId = String(targetUserId);
  const liveGameRoom = `live-game:${game._id}`;
  const presenceRoom = `room:${room._id}`;
  const sfuRoom = String(room._id);
  const sockets = await io.fetchSockets();

  for (const clientSocket of sockets)
  {
    if (String(clientSocket.data?.userId || "") !== normalizedTargetUserId)
    {
      continue;
    }

    const belongsToThisGame =
      String(clientSocket.data?.gameId || "") === String(game._id) ||
      clientSocket.rooms.has(liveGameRoom) ||
      clientSocket.rooms.has(presenceRoom) ||
      clientSocket.rooms.has(sfuRoom);

    if (!belongsToThisGame)
    {
      continue;
    }

    clientSocket.emit("game:player-kicked", payload);

    await clientSocket.leave(liveGameRoom);
    await clientSocket.leave(presenceRoom);
    await clientSocket.leave(sfuRoom);
  }
}

function clampCounter(value, min, max)
{
  const numeric = Number(value);

  if (!Number.isFinite(numeric))
  {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function sanitizeTrackedCounterFlag(value, fallback)
{
  if (value === undefined)
  {
    return fallback;
  }

  return Boolean(value);
}

function sanitizeCommanderEntry(raw)
{
  if (!raw) return null;

  if (typeof raw === "string")
  {
    const name = raw.trim().slice(0, 120);
    return name ? { name } : null;
  }

  if (typeof raw === "object")
  {
    const name = typeof raw.name === "string"
      ? raw.name.trim().slice(0, 120)
      : "";

    return name ? { name } : null;
  }

  return null;
}

function sanitizeCommanders(raw)
{
  let source = [];

  if (Array.isArray(raw))
  {
    source = raw;
  }
  else if (raw)
  {
    source = [raw];
  }

  const normalized = [];
  const seen = new Set();

  for (const entry of source)
  {
    const commander = sanitizeCommanderEntry(entry);
    if (!commander) continue;

    const key = commander.name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    normalized.push(commander);

    if (normalized.length >= 2)
    {
      break;
    }
  }

  return normalized;
}

function sanitizeCommanderDamageMap(rawValue, game, seat)
{
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue))
  {
    return {};
  }

  const validOpponentIds = new Set(
    game.seats
      .filter((entry) => entry.userId?.toString() !== seat.userId?.toString())
      .map((entry) => entry.userId?.toString())
      .filter(Boolean)
  );

  const sanitized = {};

  for (const [userId, value] of Object.entries(rawValue))
  {
    if (!validOpponentIds.has(userId))
    {
      continue;
    }

    sanitized[userId] = clampCounter(value, 0, 99);
  }

  return sanitized;
}

function normalizeBoardOrder(game)
{
  const defaultOrder = [1, 2, 3, 4];
  const occupiedSeatNumbers = new Set(
    (Array.isArray(game?.seats) ? game.seats : [])
      .map((seat) => Number(seat?.seatNumber))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 4)
  );

  const baseOrderSource = Array.isArray(game?.boardOrder) && game.boardOrder.length > 0
    ? game.boardOrder
    : defaultOrder;

  const baseOrder = [];

  for (const value of baseOrderSource)
  {
    const seatNumber = Number(value);
    if (!Number.isInteger(seatNumber) || seatNumber < 1 || seatNumber > 4) continue;
    if (baseOrder.includes(seatNumber)) continue;
    baseOrder.push(seatNumber);
  }

  for (const seatNumber of defaultOrder)
  {
    if (!baseOrder.includes(seatNumber))
    {
      baseOrder.push(seatNumber);
    }
  }

  const occupied = baseOrder.filter((seatNumber) => occupiedSeatNumbers.has(seatNumber));
  const empty = baseOrder.filter((seatNumber) => !occupiedSeatNumbers.has(seatNumber));

  return [...occupied, ...empty];
}

function syncBoardOrder(game)
{
  game.boardOrder = normalizeBoardOrder(game);
  return game.boardOrder;
}

function getOccupiedTurnOrder(game)
{
  const normalizedBoardOrder = normalizeBoardOrder(game);

  return normalizedBoardOrder.filter((seatNumber) =>
    game.seats.some(
      (seat) => Number(seat.seatNumber) === Number(seatNumber) && Boolean(seat.userId)
    )
  );
}

function clearActiveTurnIfNeeded(game)
{
  if (!game.activeTurnSeatNumber)
  {
    game.activeTurnSeatNumber = null;
    return false;
  }

  const activeSeatStillExists = game.seats.some(
    (seat) => Number(seat.seatNumber) === Number(game.activeTurnSeatNumber) && Boolean(seat.userId)
  );

  if (activeSeatStillExists)
  {
    return false;
  }

  game.activeTurnSeatNumber = null;
  game.turnStartedAt = null;
  return true;
}

function shuffleSeatNumbers(values)
{
  const next = [...values];

  for (let i = next.length - 1; i > 0; i -= 1)
  {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }

  return next;
}

function clearSeatMarkersIfNeeded(game, seatNumber)
{
  if (Number(game.monarchSeatNumber) === Number(seatNumber))
  {
    game.monarchSeatNumber = null;
  }

  if (Number(game.initiativeSeatNumber) === Number(seatNumber))
  {
    game.initiativeSeatNumber = null;
  }

  if (Number(game.activeTurnSeatNumber) === Number(seatNumber))
  {
    game.activeTurnSeatNumber = null;
    game.turnStartedAt = null;
  }
}

function isValidOccupiedSeat(game, seatNumber)
{
  if (seatNumber === null) return true;
  if (!Number.isInteger(Number(seatNumber))) return false;

  return game.seats.some(
    (seat) => Number(seat.seatNumber) === Number(seatNumber) && Boolean(seat.userId)
  );
}

function sanitizeDayNightState(value)
{
  if (value === undefined)
  {
    return { provided: false, value: undefined };
  }

  if (value === null || value === "")
  {
    return { provided: true, value: null };
  }

  if (typeof value !== "string")
  {
    return { provided: true, valid: false };
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "day" || normalized === "night")
  {
    return { provided: true, valid: true, value: normalized };
  }

  return { provided: true, valid: false };
}

router.get("/room/:roomId", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findOne({
      roomId: req.params.roomId,
      status: "active",
    }).exec();

    if (!game)
    {
      return res.status(404).json({ ok: false, error: "No active game found for this room." });
    }

    syncBoardOrder(game);
    clearActiveTurnIfNeeded(game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error fetching active game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch active game." });
  }
});

router.post("/start", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId, format } = req.body;

    if (!roomId)
    {
      return res.status(400).json({ ok: false, error: "roomId is required." });
    }

    const room = await RoomModel.findById(roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const isMember = room.members?.some(
      (member) => member.userID.toString() === req.user._id.toString()
    );

    if (!isMember)
    {
      return res.status(403).json({ ok: false, error: "You must be in the room to start a live game." });
    }

    const existingGame = await LiveGameModel.findOne({
      roomId,
      status: "active",
    }).exec();

    if (existingGame)
    {
      syncBoardOrder(existingGame);
      return res.status(200).json({ ok: true, game: existingGame, alreadyActive: true });
    }

    const startingLife = getStartingLife(format);

    const game = await LiveGameModel.create({
      roomId,
      status: "active",

      settings: {
        format,
        trackEnergy: false,
        trackMonarch: true,
        trackInitiative: true,
        trackExperience: false,
        enableDayNight: false,
      },

      boardOrder: [1, 2, 3, 4],

      seats: [
        {
          seatNumber: 1,
          userId: req.user._id,
          username: req.user.username,
          joinedAt: new Date(),
          connectionStatus: "connected",
          isReady: false,
          isAway: false,
          deck: null,
          commanders: [],
          stats: {
            commanderDamage: {},
            commanderCastCount: 0,
            life: startingLife,
            poison: 0,
            energy: 0,
            experience: 0,
          }
        }
      ],
      spectators: []
    });

    syncBoardOrder(game);
    await game.save();

    const io = req.app.get("io");
    emitGameStarted(io, game);

    return res.status(201).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error starting game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to start game." });
  }
});

router.post("/:gameId/join", requireAuth, async (req, res) =>
{
  try
  {
    const { seatNumber } = req.body || {};
    const requestedRole = req.body?.role === "spectator" ? "spectator" : "player";

    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    if (game.status !== "active")
    {
      return res.status(400).json({ ok: false, error: "Game is not active." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found for game." });
    }

    const roomMember = room.members?.find(
      (member) => member.userID.toString() === req.user._id.toString()
    );

    if (!roomMember)
    {
      return res.status(403).json({ ok: false, error: "You must join the room before joining a game." });
    }

    const existingSeat = game.seats?.find(
      (seat) => seat.userId?.toString() === req.user._id.toString()
    );

    const existingSpectator = getSpectatorParticipant(game, req.user._id);

    if (requestedRole === "spectator")
    {
      if (existingSeat)
      {
        return res.status(400).json({ ok: false, error: "Seated players cannot join the game as spectators." });
      }

      if (existingSpectator)
      {
        existingSpectator.connectionStatus = "connected";
        existingSpectator.username = req.user.username;
        existingSpectator.lastSeenAt = new Date();
        existingSpectator.lastActiveAt = new Date();
        if (!existingSpectator.joinedAt) existingSpectator.joinedAt = new Date();

        await game.save();

        const io = req.app.get("io");
        emitGameUpdated(io, game);
        emitLobbyRefresh(io);

        return res.status(200).json({ ok: true, game, alreadySpectating: true });
      }

      if (getSpectatorCount(game) >= 4)
      {
        return res.status(400).json({ ok: false, error: "This game already has the maximum number of spectators." });
      }

      game.spectators.push({
        userId: req.user._id,
        username: req.user.username,
        joinedAt: new Date(),
        connectionStatus: "connected",
        lastSeenAt: new Date(),
        lastActiveAt: new Date(),
        disconnectDeadlineAt: null,
        awaySinceAt: null,
      });

      await game.save();

      const io = req.app.get("io");
      emitGameUpdated(io, game);
      emitLobbyRefresh(io);

      return res.status(200).json({ ok: true, game, role: "spectator" });
    }

    if (roomMember.role === "spectator")
    {
      return res.status(403).json({ ok: false, error: "Spectators cannot claim a player seat." });
    }

    if (existingSeat)
    {
      existingSeat.connectionStatus = "connected";
      existingSeat.username = req.user.username;
      existingSeat.lastSeenAt = new Date();
      if (!existingSeat.joinedAt) existingSeat.joinedAt = new Date();

      syncBoardOrder(game);
      await game.save();

      const io = req.app.get("io");
      emitGameUpdated(io, game);
      emitLobbyRefresh(io);

      return res.status(200).json({ ok: true, game, alreadySeated: true });
    }

    if (existingSpectator)
    {
      return res.status(400).json({ ok: false, error: "Spectators cannot claim a player seat." });
    }

    const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
    const takenSeatNumbers = new Set(game.seats.map((seat) => seat.seatNumber));

    let assignedSeatNumber = seatNumber;

    if (!assignedSeatNumber)
    {
      for (let i = 1; i <= maxPlayers; i += 1)
      {
        if (!takenSeatNumbers.has(i))
        {
          assignedSeatNumber = i;
          break;
        }
      }
    }

    if (!assignedSeatNumber)
    {
      return res.status(400).json({ ok: false, error: "No open seats available." });
    }

    if (takenSeatNumbers.has(assignedSeatNumber))
    {
      return res.status(400).json({ ok: false, error: "Seat is already taken." });
    }

    const startingLife = getStartingLife(game.settings?.format);

    game.seats.push({
      seatNumber: assignedSeatNumber,
      userId: req.user._id,
      username: req.user.username,
      joinedAt: new Date(),
      lastSeenAt: new Date(),
      connectionStatus: "connected",
      isReady: false,
      isAway: false,
      deck: null,
      commanders: [],
      stats: {
        commanderDamage: {},
        commanderCastCount: 0,
        life: startingLife,
        poison: 0,
        energy: 0,
        experience: 0,
      }
    });

    syncBoardOrder(game);
    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);
    emitLobbyRefresh(io);

    return res.status(200).json({ ok: true, game, role: "player" });
  }
  catch (err)
  {
    console.error("Error joining game seat:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to join game seat." });
  }
});

router.post("/:gameId/leave", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const userId = req.user._id.toString();
    const seatIndex = game.seats.findIndex((seat) => seat.userId?.toString() === userId);

    if (seatIndex !== -1)
    {
      const [removedSeat] = game.seats.splice(seatIndex, 1);

      clearSeatMarkersIfNeeded(game, removedSeat.seatNumber);
      syncBoardOrder(game);
      clearActiveTurnIfNeeded(game);

      await game.save();

      const io = req.app.get("io");
      emitGameUpdated(io, game);
      emitLobbyRefresh(io);

      return res.status(200).json({ ok: true, game });
    }

    const spectatorIndex = Array.isArray(game.spectators)
      ? game.spectators.findIndex((spectator) => spectator.userId?.toString() === userId)
      : -1;

    if (spectatorIndex === -1)
    {
      return res.status(200).json({ ok: true, game, alreadyLeft: true });
    }

    game.spectators.splice(spectatorIndex, 1);
    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);
    emitLobbyRefresh(io);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error leaving game seat:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to leave game." });
  }
});

router.post("/:gameId/seats/:seatNumber/state", requireAuth, async (req, res) =>
{
  try
  {
    const { gameId, seatNumber } = req.params;
    const numericSeatNumber = Number(seatNumber);

    if (!Number.isInteger(numericSeatNumber))
    {
      return res.status(400).json({ ok: false, error: "Invalid seat number." });
    }

    const game = await LiveGameModel.findById(gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const actingSeat = game.seats.find(
      (seat) => seat.userId?.toString() === req.user._id.toString()
    );

    if (!actingSeat)
    {
      return res.status(403).json({ ok: false, error: "Only seated players can update state." });
    }

    if (actingSeat.seatNumber !== numericSeatNumber)
    {
      return res.status(403).json({ ok: false, error: "You can only update your own seat." });
    }

    const seat = game.seats.find((entry) => entry.seatNumber === numericSeatNumber);
    if (!seat)
    {
      return res.status(404).json({ ok: false, error: "Seat not found." });
    }

    if (!seat.stats)
    {
      seat.stats = {};
    }

    const {
      life,
      poison,
      energy,
      experience,
      commanderDamage,
      commanders,
      commander,
      isReady,
      isAway,
      connectionStatus,
    } = req.body || {};

    if (life !== undefined)
    {
      seat.stats.life = clampCounter(life, 0, 999);
    }

    if (poison !== undefined)
    {
      seat.stats.poison = clampCounter(poison, 0, 99);
    }

    if (energy !== undefined)
    {
      seat.stats.energy = clampCounter(energy, 0, 999);
    }

    if (experience !== undefined)
    {
      seat.stats.experience = clampCounter(experience, 0, 999);
    }

    if (commanderDamage !== undefined)
    {
      seat.stats.commanderDamage = sanitizeCommanderDamageMap(commanderDamage, game, seat);
    }

    if (commanders !== undefined)
    {
      seat.commanders = sanitizeCommanders(commanders);
    }
    else if (commander !== undefined)
    {
      seat.commanders = sanitizeCommanders(commander);
    }

    if (isReady !== undefined)
    {
      seat.isReady = Boolean(isReady);
    }

    if (isAway !== undefined)
    {
      seat.isAway = Boolean(isAway);
    }

    if (connectionStatus !== undefined)
    {
      if (!["connected", "away"].includes(connectionStatus))
      {
        return res.status(400).json({ ok: false, error: "Invalid connection status." });
      }

      seat.connectionStatus = connectionStatus;
      seat.awaySinceAt = connectionStatus === "away" ? new Date() : null;
      seat.lastSeenAt = new Date();
      seat.lastActiveAt = new Date();
    }

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    if (commanders !== undefined || commander !== undefined)
    {
      emitLobbyRefresh(io);
    }

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error updating seat state:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update seat state." });
  }
});

router.post("/:gameId/randomize-player-order", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const hostUserId = getHostUserIdForGame(game, room);
    if (hostUserId !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the host can randomize player order." });
    }

    const occupiedSeatNumbers = normalizeBoardOrder(game).filter((seatNumber) =>
      game.seats.some((seat) => seat.seatNumber === seatNumber)
    );

    if (occupiedSeatNumbers.length <= 1)
    {
      return res.status(200).json({ ok: true, game, unchanged: true });
    }

    const shuffledOccupiedSeatNumbers = shuffleSeatNumbers(occupiedSeatNumbers);
    const emptySeatNumbers = normalizeBoardOrder(game).filter(
      (seatNumber) => !occupiedSeatNumbers.includes(seatNumber)
    );

    game.boardOrder = [...shuffledOccupiedSeatNumbers, ...emptySeatNumbers];
    await game.save();

    const io = req.app.get("io");
    emitBoardOrderRandomized(io, game);
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error randomizing player order:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to randomize player order." });
  }
});

router.post("/:gameId/turn/advance", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const requesterSeat = game.seats.find(
      (seat) => seat.userId?.toString() === req.user._id.toString()
    );

    if (!requesterSeat)
    {
      return res.status(403).json({ ok: false, error: "You must be seated in the game to advance the turn." });
    }

    syncBoardOrder(game);
    clearActiveTurnIfNeeded(game);

    const occupiedTurnOrder = getOccupiedTurnOrder(game);

    if (occupiedTurnOrder.length === 0)
    {
      game.activeTurnSeatNumber = null;
      game.turnStartedAt = null;

      await game.save();

      const io = req.app.get("io");
      emitGameUpdated(io, game);

      return res.status(200).json({ ok: true, game, unchanged: true });
    }

    const currentIndex = occupiedTurnOrder.findIndex(
      (seatNumber) => Number(seatNumber) === Number(game.activeTurnSeatNumber)
    );

    const nextSeatNumber = currentIndex === -1
      ? occupiedTurnOrder[0]
      : occupiedTurnOrder[(currentIndex + 1) % occupiedTurnOrder.length];

    const now = new Date();

    if (!game.gameStartedAt)
    {
      const occupiedSeats = game.seats.filter((seat) => Boolean(seat.userId));
      const allReady = occupiedSeats.length > 0 && occupiedSeats.every((seat) => seat.isReady);

      if (!allReady)
      {
        return res.status(400).json({ ok: false, error: "All seated players must be ready before the game can start." });
      }

      game.gameStartedAt = now;
    }

    game.activeTurnSeatNumber = nextSeatNumber;
    game.turnStartedAt = now;

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error advancing turn:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to advance turn." });
  }
});

router.post("/:gameId/markers", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const requesterSeat = game.seats.find(
      (entry) => entry.userId?.toString() === req.user._id.toString()
    );

    if (!requesterSeat)
    {
      return res.status(403).json({ ok: false, error: "You must be seated in the game to update shared markers." });
    }

    const { monarchSeatNumber, initiativeSeatNumber, dayNightState } = req.body || {};
    const parsedDayNightState = sanitizeDayNightState(dayNightState);

    if (monarchSeatNumber !== undefined && !isValidOccupiedSeat(game, monarchSeatNumber))
    {
      return res.status(400).json({ ok: false, error: "Invalid monarch seat." });
    }

    if (initiativeSeatNumber !== undefined && !isValidOccupiedSeat(game, initiativeSeatNumber))
    {
      return res.status(400).json({ ok: false, error: "Invalid initiative seat." });
    }

    if (parsedDayNightState.provided && parsedDayNightState.valid === false)
    {
      return res.status(400).json({ ok: false, error: "Invalid day/night state." });
    }

    if (monarchSeatNumber !== undefined)
    {
      game.monarchSeatNumber = monarchSeatNumber === null
        ? null
        : Number(monarchSeatNumber);
    }

    if (initiativeSeatNumber !== undefined)
    {
      game.initiativeSeatNumber = initiativeSeatNumber === null
        ? null
        : Number(initiativeSeatNumber);
    }

    if (parsedDayNightState.provided)
    {
      game.dayNightState = parsedDayNightState.value;
    }

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error updating shared markers:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update shared markers." });
  }
});

router.post("/:gameId/settings", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const requesterUserId = req.user._id.toString();
    const requesterSeat = game.seats.find(
      (seat) => seat.userId?.toString() === requesterUserId
    );

    if (!requesterSeat)
    {
      return res.status(403).json({ ok: false, error: "You must be seated in the game to update settings." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    const hostUserId = getHostUserIdForGame(game, room);

    if (!game.settings)
    {
      game.settings = {};
    }

    const {
      trackEnergy,
      trackExperience,
      enableDayNight,
    } = req.body || {};

    const wantsProtectedSettings =
      trackEnergy !== undefined ||
      trackExperience !== undefined;

    if (wantsProtectedSettings)
    {
      if (!hostUserId)
      {
        return res.status(403).json({ ok: false, error: "Unable to determine game host." });
      }

      if (hostUserId !== requesterUserId)
      {
        return res.status(403).json({ ok: false, error: "Only the room host can update those game settings." });
      }

      game.settings.trackEnergy = sanitizeTrackedCounterFlag(
        trackEnergy,
        game.settings.trackEnergy
      );

      game.settings.trackExperience = sanitizeTrackedCounterFlag(
        trackExperience,
        game.settings.trackExperience
      );
    }

    if (enableDayNight !== undefined)
    {
      game.settings.enableDayNight = Boolean(enableDayNight);

      if (game.settings.enableDayNight)
      {
        if (!game.dayNightState)
        {
          game.dayNightState = "day";
        }
      }
      else
      {
        game.dayNightState = null;
      }
    }

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error updating game settings:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update game settings." });
  }
});

router.post("/:gameId/kick-player", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    if (game.status !== "active")
    {
      return res.status(400).json({ ok: false, error: "Game is not active." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const requesterUserId = req.user._id.toString();
    const currentHostUserId = getHostUserIdForGame(game, room);

    if (!currentHostUserId)
    {
      return res.status(403).json({ ok: false, error: "Unable to determine current host." });
    }

    if (currentHostUserId !== requesterUserId)
    {
      return res.status(403).json({ ok: false, error: "Only the current host can kick players." });
    }

    const targetUserId = typeof req.body?.targetUserId === "string"
      ? req.body.targetUserId.trim()
      : "";

    if (!targetUserId)
    {
      return res.status(400).json({ ok: false, error: "targetUserId is required." });
    }

    if (targetUserId === requesterUserId)
    {
      return res.status(400).json({ ok: false, error: "You cannot kick yourself. Use the leave game option instead." });
    }

    const targetSeatIndex = game.seats.findIndex(
      (seat) => seat.userId?.toString() === targetUserId
    );

    if (targetSeatIndex === -1)
    {
      return res.status(404).json({ ok: false, error: "Target player must be seated in the live game." });
    }

    const targetMemberIndex = room.members.findIndex(
      (member) => member.userID?.toString() === targetUserId
    );

    if (targetMemberIndex === -1)
    {
      return res.status(404).json({ ok: false, error: "Target player must still be in the room." });
    }

    const targetSeat = game.seats[targetSeatIndex];
    const targetSeatNumber = Number(targetSeat?.seatNumber ?? 0);

    game.seats.splice(targetSeatIndex, 1);
    clearSeatMarkersIfNeeded(game, targetSeatNumber);
    clearCommanderDamageForUser(game, targetUserId);
    syncBoardOrder(game);
    clearActiveTurnIfNeeded(game);

    room.members.splice(targetMemberIndex, 1);
    room.status = normalizeRoomStatus(room);

    await Promise.all([
      game.save(),
      room.save(),
    ]);

    clearPresenceForUser(String(game._id), targetUserId);

    const io = req.app.get("io");
    const kickedPayload = {
      gameId: String(game._id),
      roomId: String(game.roomId),
      targetUserId,
      removedByUserId: requesterUserId,
    };

    await forceKickUserSockets(io, game, room, targetUserId, kickedPayload);

    emitGameUpdated(io, game);
    emitRoomUpdated(io, room);
    emitPlayerKicked(io, game, kickedPayload);

    return res.status(200).json({
      ok: true,
      game,
      roomId: String(room._id),
      targetUserId,
    });
  }
  catch (err)
  {
    console.error("Error kicking player:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to kick player." });
  }
});

router.post("/:gameId/reset", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec() || null;
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    const hostUserId = getHostUserIdForGame(game, room);

    if (hostUserId !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the host can reset the game." });
    }

    const startingLife = getStartingLife(game.settings?.format);

    for (const seat of game.seats)
    {
      seat.stats = {
        commanderDamage: {},
        commanderCastCount: 0,
        life: startingLife,
        poison: 0,
        energy: 0,
        experience: 0,
      };
      seat.commanders = [];
      seat.isReady = false;
    }

    game.boardOrder = normalizeBoardOrder(game);
    game.monarchSeatNumber = null;
    game.initiativeSeatNumber = null;
    game.activeTurnSeatNumber = null;
    game.turnStartedAt = null;
    game.gameStartedAt = null;
    game.dayNightState = null;

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);
    emitLobbyRefresh(io);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error resetting game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to reset game." });
  }
}); 

router.post("/:gameId/transfer-host", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    if (game.status !== "active")
    {
      return res.status(400).json({ ok: false, error: "Game is not active." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const requesterUserId = req.user._id.toString();
    const currentHostUserId = getHostUserIdForGame(game, room);

    if (!currentHostUserId)
    {
      return res.status(403).json({ ok: false, error: "Unable to determine current host." });
    }

    if (currentHostUserId !== requesterUserId)
    {
      return res.status(403).json({ ok: false, error: "Only the current host can promote another player." });
    }

    const targetUserId = typeof req.body?.targetUserId === "string"
      ? req.body.targetUserId.trim()
      : "";

    if (!targetUserId)
    {
      return res.status(400).json({ ok: false, error: "targetUserId is required." });
    }

    if (targetUserId === requesterUserId)
    {
      return res.status(200).json({
        ok: true,
        unchanged: true,
        hostUserId: currentHostUserId,
        hostName: room.hostName || req.user.username,
      });
    }

    const targetSeat = game.seats.find(
      (seat) => seat.userId?.toString() === targetUserId
    );

    if (!targetSeat)
    {
      return res.status(404).json({ ok: false, error: "Target player must be seated in the live game." });
    }

    const currentHostMember = room.members.find(
      (member) => member.userID?.toString() === requesterUserId
    );

    const targetMember = room.members.find(
      (member) => member.userID?.toString() === targetUserId
    );

    if (!targetMember)
    {
      return res.status(404).json({ ok: false, error: "Target player must still be in the room." });
    }

    if (currentHostMember)
    {
      currentHostMember.role = "player";
    }

    targetMember.role = "host";
    room.hostID = targetSeat.userId;
    room.hostName = targetSeat.username;

    await room.save();

    const io = req.app.get("io");
    emitHostTransferred(io, game, room);

    return res.status(200).json({
      ok: true,
      hostUserId: room.hostID.toString(),
      hostName: room.hostName,
    });
  }
  catch (err)
  {
    console.error("Error transferring host:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to transfer host.",
    });
  }
});

router.post("/:gameId/end", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    const hostUserId = getHostUserIdForGame(game, room);

    if (hostUserId !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the host can end the game." });
    }

    game.status = "inactive";
    await game.save();

    const io = req.app.get("io");
    emitGameEnded(io, game);

    clearPresenceForGame(game._id);

    await Promise.all([
      RoomChatMessageModel.deleteMany({ roomId: game.roomId }).exec(),
      LiveGameModel.deleteOne({ _id: game._id }).exec(),
      room
        ? RoomModel.findByIdAndDelete(room._id).exec()
        : Promise.resolve(),
    ]);

    io.emit("rooms:changed");
    io.to(`room:${game.roomId}`).emit("room:deleted", { roomId: String(game.roomId) });

    return res.status(200).json({ ok: true });
  }
  catch (err)
  {
    console.error("Error ending game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to end game." });
  }
});

module.exports = router;
