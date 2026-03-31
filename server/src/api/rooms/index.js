require("dotenv").config();

const router = require("express").Router();
const requireAuth = require("../../middleware/requireAuth");

const RoomModel = require("../../database/models/Room");
const LiveGameModel = require("../../database/models/LiveGame");

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

function getPlayerMemberCount(room)
{
  return Array.isArray(room.members)
    ? room.members.filter((member) => member.role !== "spectator").length
    : 0;
}

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = getPlayerMemberCount(room);
  return memberCount >= maxPlayers ? "full" : "open";
}

function getSeatSnapshot(room, liveGame)
{
  if (Array.isArray(liveGame?.seats) && liveGame.seats.length > 0)
  {
    return [...liveGame.seats]
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
      }));
  }

  if (!Array.isArray(room.members))
  {
    return [];
  }

  return room.members.map((member, index) =>
  ({
    role: member.role,
    username: member.userID?.username || (member.role === "host" ? room.hostName : "Unknown"),
    seatNumber: index + 1,
    commanders: [],
  }));
}

router.post("/create", requireAuth, async (req, res) =>
{
  try
  {
    const { title, description, visibility, settings } = req.body;

    const hostId = req.user._id;

    const room = await RoomModel.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,

      hostID: hostId,
      hostName: req.user.username,
      createdBy: hostId,

      visibility: visibility,
      status: "open",

      members: [
        {
          userID: hostId,
          role: "host",
          joinedAt: new Date(),
        }
      ],

      settings: settings,
    });

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(201).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error creating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to create room." });
  }
});

router.get("/all", async (req, res) =>
{
  try
  {
    const rooms = await RoomModel.find()
      .populate("members.userID", "username")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec();

    const roomIds = rooms.map((room) => room._id);

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

    const enrichedRooms = rooms.map((room) =>
    {
      const liveGame = liveGameByRoomId.get(String(room._id));
      const seatSnapshot = getSeatSnapshot(room, liveGame);

      return {
        ...room,
        status: normalizeRoomStatus(room),
        seats: seatSnapshot,
      };
    });

    return res.status(200).json({ ok: true, rooms: enrichedRooms });
  }
  catch (err)
  {
    console.log("Error fetching rooms");
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch rooms." });
  }
});

router.get("/:id", async (req, res) =>
{
  try
  {
    const room = await RoomModel.findById(req.params.id).exec();

    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error fetching room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch room." });
  }
});

router.patch("/:id/update", requireAuth, async (req, res) =>
{
  try
  {
    const room = await RoomModel.findById(req.params.id).exec();

    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    if (room.hostID.toString() !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the host can update the room." });
    }

    const { title, description, visibility, settings } = req.body;

    if (title) room.title = title.trim();
    if (description) room.description = description.trim();
    if (visibility) room.visibility = visibility;
    if (settings) room.settings = settings;

    room.status = normalizeRoomStatus(room);

    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error updating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update room." });
  }
});

router.post("/:id/join", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(req.params.id).exec();
    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    const maxPlayers = Number(room.settings?.maxPlayers ?? 4);

    const existingMember = room.members?.find(
      (m) => m.userID.toString() === userId
    );

    if (existingMember)
    {
      existingMember.lastSeenAt = new Date();

      room.status = normalizeRoomStatus(room);
      await room.save();

      const io = req.app.get("io");
      io.emit("rooms:changed");

      return res.status(200).json({ ok: true, room, alreadyMember: true });
    }

    if (getPlayerMemberCount(room) >= maxPlayers)
    {
      return res.status(400).json({ ok: false, error: "Room is full." });
    }

    room.members.push({
      userID: req.user._id,
      role: "player",
      joinedAt: new Date(),
    });

    room.status = normalizeRoomStatus(room);
    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error joining room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to join room." });
  }
});

router.post("/:id/leave", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(req.params.id).exec();
    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    const memberIndex = room.members.findIndex(
      (m) => m.userID.toString() === userId
    );

    if (memberIndex === -1)
    {
      return res.status(200).json({ ok: true, room, alreadyLeft: true });
    }

    const leavingMember = room.members[memberIndex];

    if (leavingMember.role === "host")
    {
      return res.status(400).json({
        ok: false,
        error: "Host leave handling is not implemented yet. Close/archive the room first."
      });
    }

    room.members.splice(memberIndex, 1);
    room.status = normalizeRoomStatus(room);

    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error leaving room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to leave room." });
  }
});

module.exports = router;