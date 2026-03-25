const router = require("express").Router();
const requireAuth = require("../../middleware/requireAuth");

const RoomModel = require("../../database/models/Room");
const RoomChatMessageModel = require("../../database/models/RoomChatMessage");

function isRoomMember(room, userId)
{
  return room.members?.some((member) => member.userID?.toString() === userId);
}

router.get("/rooms/:roomId/messages", requireAuth, async (req, res) =>
{
  try
  {
    const { roomId } = req.params;
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    if (!isRoomMember(room, userId))
    {
      return res.status(403).json({ ok: false, error: "You must be in the room to view chat." });
    }

    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(rawLimit, 100))
      : 50;

    const before = req.query.before ? new Date(String(req.query.before)) : null;

    const query = { roomId };

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

    const room = await RoomModel.findById(roomId).exec();
    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    if (!isRoomMember(room, userId))
    {
      return res.status(403).json({ ok: false, error: "You must be in the room to send chat." });
    }

    const message = await RoomChatMessageModel.create({
      roomId,
      authorUserId: req.user._id,
      authorUsername: req.user.username,
      body,
    });

    const io = req.app.get("io");
    io.to(`room:${roomId}`).emit("room-chat:new-message", {
      message,
    });

    return res.status(201).json({ ok: true, message });
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

module.exports = router;