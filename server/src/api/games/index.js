const requireAuth = require("../../middleware/requireAuth");
const router = require("express").Router();

const LiveGameModel = require("../../database/models/LiveGame");
const RoomModel = require("../../database/models/Room");

router.get("/", (req, res) => res.json({ ok: true, route: "live-games" }));

function getStartingLife(format)
{
  return format === "commander" ? 40 : 20;
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

function clampCounter(value, min, max)
{
  const numeric = Number(value);

  if (!Number.isFinite(numeric))
  {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
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
        trackMonarch: false,
        trackInitiative: false,
        trackExperience: false,
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
      ]
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

    const isRoomMember = room.members?.some(
      (member) => member.userID.toString() === req.user._id.toString()
    );

    if (!isRoomMember)
    {
      return res.status(403).json({ ok: false, error: "You must join the room before joining a game seat." });
    }

    const existingSeat = game.seats?.find(
      (seat) => seat.userId?.toString() === req.user._id.toString()
    );

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

      return res.status(200).json({ ok: true, game, alreadySeated: true });
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

    return res.status(200).json({ ok: true, game });
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

    const seatIndex = game.seats.findIndex(
      (seat) => seat.userId?.toString() === req.user._id.toString()
    );

    if (seatIndex === -1)
    {
      return res.status(200).json({ ok: true, game, alreadyLeft: true });
    }

    game.seats.splice(seatIndex, 1);

    syncBoardOrder(game);
    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error leaving game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to leave game." });
  }
});

router.post("/:gameId/disconnect", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const seat = game.seats.find(
      (entry) => entry.userId?.toString() === req.user._id.toString()
    );

    if (!seat)
    {
      return res.status(404).json({ ok: false, error: "Player seat not found in game." });
    }

    seat.connectionStatus = "reconnecting";
    seat.lastSeenAt = new Date();

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error disconnecting player from game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to mark player as reconnecting." });
  }
});

router.post("/:gameId/reconnect", requireAuth, async (req, res) =>
{
  try
  {
    const game = await LiveGameModel.findById(req.params.gameId).exec();
    if (!game)
    {
      return res.status(404).json({ ok: false, error: "Game not found." });
    }

    const seat = game.seats.find(
      (entry) => entry.userId?.toString() === req.user._id.toString()
    );

    if (!seat)
    {
      return res.status(404).json({ ok: false, error: "Player seat not found in game." });
    }

    seat.connectionStatus = "connected";
    seat.lastSeenAt = new Date();
    seat.username = req.user.username;

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error reconnecting player to game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to mark player connected." });
  }
});

router.post("/:gameId/seats/:seatNumber/state", requireAuth, async (req, res) =>
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
      return res.status(403).json({ ok: false, error: "You must be seated in the game to update player state." });
    }

    const seatNumber = Number(req.params.seatNumber);

    if (requesterSeat.seatNumber !== seatNumber)
    {
      return res.status(403).json({ ok: false, error: "You can only update your own seat state." });
    }

    const seat = game.seats.find((entry) => entry.seatNumber === seatNumber);

    if (!seat)
    {
      return res.status(404).json({ ok: false, error: "Target seat not found." });
    }

    if (!seat.stats)
    {
      seat.stats = {};
    }

    const { life, poison, commanderDamage, commanders, commander } = req.body || {};

    if (life !== undefined)
    {
      seat.stats.life = clampCounter(life, 0, 999);
    }

    if (poison !== undefined)
    {
      seat.stats.poison = clampCounter(poison, 0, 99);
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

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error updating player state:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update player state." });
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

    if (game.status !== "active")
    {
      return res.status(400).json({ ok: false, error: "Game is not active." });
    }

    const room = await RoomModel.findById(game.roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found for game." });
    }

    if (room.hostID.toString() !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the room host can randomize player order." });
    }

    const normalizedBoardOrder = normalizeBoardOrder(game);
    const occupiedSeatNumbers = normalizedBoardOrder.filter((seatNumber) =>
      game.seats.some((seat) => Number(seat.seatNumber) === Number(seatNumber))
    );

    if (occupiedSeatNumbers.length < 2)
    {
      syncBoardOrder(game);
      await game.save();
      return res.status(200).json({ ok: true, game, unchanged: true });
    }

    const shuffledOccupied = shuffleSeatNumbers(occupiedSeatNumbers);
    const emptySeatNumbers = normalizedBoardOrder.filter(
      (seatNumber) => !occupiedSeatNumbers.includes(seatNumber)
    );

    game.boardOrder = [...shuffledOccupied, ...emptySeatNumbers];
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
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found for game." });
    }

    if (room.hostID.toString() !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the room host can end the game." });
    }

    game.status = "inactive";
    game.endedAt = new Date();

    await game.save();

    const io = req.app.get("io");
    emitGameEnded(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error ending game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to end game." });
  }
});

module.exports = router;