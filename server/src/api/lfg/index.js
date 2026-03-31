const router = require("express").Router();

const requireAuth = require("../../middleware/requireAuth");
const RoomModel = require("../../database/models/Room");
const LiveGameModel = require("../../database/models/LiveGame");
const LFGChatMessageModel = require("../../database/models/LFGChatMessage");

function getPlayerMemberCount(room)
{
  return Array.isArray(room.members)
    ? room.members.filter((member) => member.role !== "spectator").length
    : 0;
}

function getMaxPlayers(room)
{
  return Number(room.settings?.maxPlayers ?? 4);
}

function isListedRoom(room)
{
  if (room.visibility !== "public") return false;
  if (room.status === "full") return false;

  return getPlayerMemberCount(room) < getMaxPlayers(room);
}

function sortRooms(a, b)
{
  const remainingA = getMaxPlayers(a) - getPlayerMemberCount(a);
  const remainingB = getMaxPlayers(b) - getPlayerMemberCount(b);

  if (remainingA !== remainingB)
  {
    return remainingA - remainingB;
  }

  const playersDelta = getPlayerMemberCount(b) - getPlayerMemberCount(a);
  if (playersDelta !== 0)
  {
    return playersDelta;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

router.get("/", (req, res) =>
{
  return res.status(200).json({ ok: true, route: "lfg" });
});

router.get("/games", async (req, res) =>
{
  try
  {
    const rooms = await RoomModel.find({ visibility: "public" })
      .populate("members.userID", "username")
      .sort({ createdAt: -1 })
      .limit(60)
      .lean()
      .exec();

    const listedRooms = rooms
      .filter(isListedRoom)
      .sort(sortRooms);

    const roomIds = listedRooms.map((room) => room._id);

    const activeGames = await LiveGameModel.find({
      roomId: { $in: roomIds },
      status: "active",
    })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const liveGameByRoomId = new Map();

    for (const game of activeGames)
    {
      const key = String(game.roomId);
      if (!liveGameByRoomId.has(key))
      {
        liveGameByRoomId.set(key, game);
      }
    }

    const games = listedRooms.map((room) =>
    {
      const liveGame = liveGameByRoomId.get(String(room._id));

      const seats = Array.isArray(liveGame?.seats) && liveGame.seats.length > 0
        ? [...liveGame.seats]
          .sort((a, b) => Number(a.seatNumber ?? 99) - Number(b.seatNumber ?? 99))
          .map((seat, index) =>
          ({
            role: seat.username === room.hostName ? "host" : "player",
            username: seat.username,
            seatNumber:
              typeof seat.seatNumber === "number" && Number.isFinite(seat.seatNumber)
                ? seat.seatNumber
                : index + 1,
            commanders: Array.isArray(seat.commanders)
              ? seat.commanders.map((entry) => entry?.name).filter(Boolean)
              : [],
          }))
        : Array.isArray(room.members)
          ? room.members.map((member, index) =>
          ({
            role: member.role,
            username: member.userID?.username || "Unknown",
            seatNumber: index + 1,
            commanders: [],
          }))
          : [];

      return {
        _id: room._id,
        title: room.title,
        description: room.description,
        hostName: room.hostName,
        createdAt: room.createdAt,
        settings: room.settings,
        seats,
      };
    });

    return res.status(200).json({ ok: true, games });
  }
  catch (err)
  {
    console.error("Error fetching LFG games:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch games." });
  }
});

router.get("/messages", async (req, res) =>
{
  try
  {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.floor(requestedLimit)))
      : 80;

    const messages = await LFGChatMessageModel.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return res.status(200).json({ ok: true, messages: messages.reverse() });
  }
  catch (err)
  {
    console.error("Error fetching LFG messages:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch messages." });
  }
});

router.post("/messages", requireAuth, async (req, res) =>
{
  try
  {
    const body = typeof req.body?.body === "string"
      ? req.body.body.trim()
      : "";

    if (!body)
    {
      return res.status(400).json({ ok: false, error: "Message body is required." });
    }

    const message = await LFGChatMessageModel.create({
      authorUserId: req.user._id,
      authorUsername: req.user.username,
      body,
    });

    const io = req.app.get("io");
    io.emit("lfg-chat:new-message", { message });

    return res.status(201).json({ ok: true, message });
  }
  catch (err)
  {
    console.error("Error sending LFG message:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to send message." });
  }
});

module.exports = router;