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

      seats: [
        {
          seatNumber: 1,
          userId: req.user._id,
          username: req.user.username,
          joinedAt: new Date(),
          connectionStatus: "connected",
          isReady: false,
          deck: null,

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
      stats: {
        commanderDamage: {},
        commanderCastCount: 0,
        life: startingLife,
        poison: 0,
        energy: 0,
        experience: 0,
      }
    });

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

    seat.connectionStatus = "disconnected";
    seat.lastSeenAt = new Date();

    await game.save();

    const io = req.app.get("io");
    emitGameUpdated(io, game);

    return res.status(200).json({ ok: true, game });
  }
  catch (err)
  {
    console.error("Error disconnecting player from game:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to mark player disconnected." });
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