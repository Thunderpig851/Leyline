const router = require("express").Router();

const LiveGameModel = require("../../database/models/LiveGame");
const RoomModel = require("../../database/models/Room");
const RoomChatMessageModel = require("../../database/models/RoomChatMessage");

const VALID_DICE_SIDES = new Set([4, 6, 8, 12, 20]);

async function loadAuthorizedRoom(roomId, userId)
{
  const room = await RoomModel.findById(roomId).exec();

  if (!room)
  {
    return { error: { status: 404, message: "Room not found." } };
  }

  const requesterId = userId.toString();
  const isMember = Array.isArray(room.members)
    && room.members.some((member) => member.userID?.toString() === requesterId);

  if (!isMember)
  {
    return { error: { status: 403, message: "You must be in the room to use chat." } };
  }

  return { room };
}

function emitNewMessage(io, roomId, message)
{
  io.to(`room:${roomId}`).emit("room-chat:new-message", { message });
}

router.get("/", (req, res) =>
{
  return res.status(200).json({ ok: true, route: "chat" });
});

router.get("/rooms/:roomId/messages", async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const { error } = await loadAuthorizedRoom(roomId, req.user._id);

    if (error)
    {
      return res.status(error.status).json({ ok: false, error: error.message });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
      : 50;

    const messages = await RoomChatMessageModel.find({ roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return res.status(200).json({
      ok: true,
      messages: messages.reverse(),
    });
  }
  catch (err)
  {
    console.error("Error fetching room chat messages:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to fetch room chat messages.",
    });
  }
});

router.post("/rooms/:roomId/messages", async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const { error } = await loadAuthorizedRoom(roomId, req.user._id);

    if (error)
    {
      return res.status(error.status).json({ ok: false, error: error.message });
    }

    const body = typeof req.body?.body === "string"
      ? req.body.body.trim()
      : "";

    if (!body)
    {
      return res.status(400).json({ ok: false, error: "Message body is required." });
    }

    const message = await RoomChatMessageModel.create({
      roomId,
      authorUserId: req.user._id,
      authorUsername: req.user.username,
      kind: "message",
      body,
      action: null,
    });

    const io = req.app.get("io");
    emitNewMessage(io, roomId, message);

    return res.status(201).json({ ok: true, message });
  }
  catch (err)
  {
    console.error("Error sending room chat message:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to send room chat message.",
    });
  }
});

router.post("/rooms/:roomId/actions", async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const { error } = await loadAuthorizedRoom(roomId, req.user._id);

    if (error)
    {
      return res.status(error.status).json({ ok: false, error: error.message });
    }

    const liveGame = await LiveGameModel.findOne({ roomId, status: "active" })
      .select("_id")
      .lean()
      .exec();

    if (!liveGame)
    {
      return res.status(400).json({ ok: false, error: "No active game found for this room." });
    }

    const actionType = typeof req.body?.actionType === "string"
      ? req.body.actionType.trim()
      : "";

    let body = "";
    let action = null;

    if (actionType === "dice-roll")
    {
      const diceSides = Number(req.body?.diceSides);

      if (!VALID_DICE_SIDES.has(diceSides))
      {
        return res.status(400).json({ ok: false, error: "Invalid die selected." });
      }

      const resultNumber = Math.floor(Math.random() * diceSides) + 1;
      body = `rolled a d${diceSides} and got ${resultNumber}`;
      action = {
        type: "dice-roll",
        diceSides,
        resultNumber,
        resultLabel: `d${diceSides}`,
      };
    }
    else if (actionType === "coin-flip")
    {
      const resultLabel = Math.random() < 0.5 ? "Heads" : "Tails";
      body = `flipped a coin and got ${resultLabel}`;
      action = {
        type: "coin-flip",
        diceSides: null,
        resultNumber: null,
        resultLabel,
      };
    }
    else
    {
      return res.status(400).json({ ok: false, error: "Invalid action type." });
    }

    const message = await RoomChatMessageModel.create({
      roomId,
      authorUserId: req.user._id,
      authorUsername: req.user.username,
      kind: "game-action",
      body,
      action,
    });

    const io = req.app.get("io");
    emitNewMessage(io, roomId, message);

    return res.status(201).json({ ok: true, message });
  }
  catch (err)
  {
    console.error("Error sending room chat action:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to send room chat action.",
    });
  }
});

module.exports = router;