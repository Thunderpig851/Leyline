const router = require("express").Router();
const { randomInt } = require("node:crypto");
const requireAuth = require("../../middleware/requireAuth");

const RoomModel = require("../../database/models/Room");
const LiveGameModel = require("../../database/models/LiveGame");
const RoomChatMessageModel = require("../../database/models/RoomChatMessage");

const VALID_DICE_SIDES = new Set([4, 6, 8, 12, 20]);

function isRoomMember(room, userId)
{
  return room.members?.some((member) => member.userID?.toString() === userId);
}

function isGameSeatMember(game, userId)
{
  return game.seats?.some((seat) => seat.userId?.toString() === userId);
}

async function getAuthorizedRoom(roomId, userId)
{
  const room = await RoomModel.findById(roomId).exec();

  if (room)
  {
    if (!isRoomMember(room, userId))
    {
      return { ok: false, status: 403, error: "You must be in the room to use chat." };
    }

    return { ok: true, roomId: String(room._id), room, liveGame: null };
  }

  const liveGame = await LiveGameModel.findOne({
    roomId,
    status: "active",
  }).exec();

  if (!liveGame)
  {
    return { ok: false, status: 404, error: "Room not found." };
  }

  if (!isGameSeatMember(liveGame, userId))
  {
    return { ok: false, status: 403, error: "You must be seated in the active game to use chat." };
  }

  return { ok: true, roomId: String(liveGame.roomId), room: null, liveGame };
}

async function createAndBroadcastMessage(req, res, roomId, messageData, status = 201)
{
  const message = await RoomChatMessageModel.create(messageData);

  const io = req.app.get("io");
  io.to(`room:${roomId}`).emit("room-chat:new-message", {
    message,
  });

  return res.status(status).json({ ok: true, message });
}

router.get("/rooms/:roomId/messages", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const userId = req.user._id.toString();

    const access = await getAuthorizedRoom(roomId, userId);
    if (!access.ok)
    {
      return res.status(access.status).json({ ok: false, error: access.error });
    }

    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 100))
      : 50;

    const before = req.query.before ? new Date(String(req.query.before)) : null;

    const query = { roomId: access.roomId };

    if (before && !Number.isNaN(before.getTime()))
    {
      query.createdAt = { $lt: before };
    }

    const messages = await RoomChatMessageModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return res.status(200).json({
      ok: true,
      messages: messages.reverse(),
    });
  }
  catch (err)
  {
    console.error("Error fetching room chat:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to fetch room chat.",
    });
  }
});

router.post("/rooms/:roomId/messages", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const userId = req.user._id.toString();
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";

    if (!body)
    {
      return res.status(400).json({ ok: false, error: "Message body is required." });
    }

    const access = await getAuthorizedRoom(roomId, userId);
    if (!access.ok)
    {
      return res.status(access.status).json({ ok: false, error: access.error });
    }

    return await createAndBroadcastMessage(req, res, access.roomId,
    {
      roomId: access.roomId,
      authorUserId: req.user._id,
      authorUsername: req.user.username,
      kind: "message",
      body,
      action: null,
    });
  }
  catch (err)
  {
    console.error("Error sending room chat:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to send room chat.",
    });
  }
});

router.post("/rooms/:roomId/actions", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const userId = req.user._id.toString();
    const actionType = typeof req.body?.actionType === "string"
      ? req.body.actionType.trim()
      : "";

    const access = await getAuthorizedRoom(roomId, userId);
    if (!access.ok)
    {
      return res.status(access.status).json({ ok: false, error: access.error });
    }

    if (actionType === "dice-roll")
    {
      const diceSides = Number(req.body?.diceSides);

      if (!VALID_DICE_SIDES.has(diceSides))
      {
        return res.status(400).json({ ok: false, error: "Invalid die size." });
      }

      const resultNumber = randomInt(1, diceSides + 1);

      return await createAndBroadcastMessage(req, res, access.roomId,
      {
        roomId: access.roomId,
        authorUserId: req.user._id,
        authorUsername: req.user.username,
        kind: "game-action",
        body: `${req.user.username} rolled a d${diceSides}: ${resultNumber}`,
        action:
        {
          type: "dice-roll",
          diceSides,
          resultNumber,
          resultLabel: `d${diceSides}`,
        },
      });
    }

    if (actionType === "coin-flip")
    {
      const resultLabel = randomInt(0, 2) === 0 ? "Heads" : "Tails";

      return await createAndBroadcastMessage(req, res, access.roomId,
      {
        roomId: access.roomId,
        authorUserId: req.user._id,
        authorUsername: req.user.username,
        kind: "game-action",
        body: `${req.user.username} flipped a coin: ${resultLabel}`,
        action:
        {
          type: "coin-flip",
          resultLabel,
        },
      });
    }

    return res.status(400).json({ ok: false, error: "Unsupported chat action." });
  }
  catch (err)
  {
    console.error("Error creating chat action:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to create chat action.",
    });
  }
});

router.delete("/rooms/:roomId/messages", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const userId = req.user._id.toString();

    const access = await getAuthorizedRoom(roomId, userId);
    if (!access.ok)
    {
      return res.status(access.status).json({ ok: false, error: access.error });
    }

    await RoomChatMessageModel.deleteMany({ roomId: access.roomId }).exec();

    return res.status(200).json({ ok: true });
  }
  catch (err)
  {
    console.error("Error deleting room chat:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to delete room chat.",
    });
  }
});

module.exports = router;