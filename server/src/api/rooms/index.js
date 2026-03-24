require("dotenv").config();

const router = require("express").Router();
const requireAuth = require("../../middleware/requireAuth");

const RoomModel = require("../../database/models/Room");

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = Array.isArray(room.members) ? room.members.length : 0;
  return memberCount >= maxPlayers ? "full" : "open";
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
          connectionStatus: "connected",
          joinedAt: new Date(),
          lastSeenAt: new Date(),
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
    const rooms = await RoomModel.find().sort({ createdAt: -1 }).limit(20).exec();
    return res.status(200).json({ ok: true, rooms });
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
      existingMember.connectionStatus = "connected";
      existingMember.lastSeenAt = new Date();

      room.status = normalizeRoomStatus(room);
      await room.save();

      const io = req.app.get("io");
      io.emit("rooms:changed");

      return res.status(200).json({ ok: true, room, alreadyMember: true });
    }

    if ((room.members?.length ?? 0) >= maxPlayers)
    {
      return res.status(400).json({ ok: false, error: "Room is full." });
    }

    room.members.push({
      userID: req.user._id,
      role: "player",
      connectionStatus: "connected",
      joinedAt: new Date(),
      lastSeenAt: new Date(),
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

router.post("/:id/disconnect", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(req.params.id).exec();
    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    const member = room.members.find(
      (m) => m.userID.toString() === userId
    );

    if (!member)
    {
      return res.status(404).json({ ok: false, error: "Member not found in room." });
    }

    member.connectionStatus = "disconnected";
    member.lastSeenAt = new Date();

    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error disconnecting room member:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to mark member disconnected." });
  }
});

router.post("/:id/reconnect", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(req.params.id).exec();
    if (!room) return res.status(404).json({ ok: false, error: "Room not found." });

    const member = room.members.find(
      (m) => m.userID.toString() === userId
    );

    if (!member)
    {
      return res.status(404).json({ ok: false, error: "Member not found in room." });
    }

    member.connectionStatus = "connected";
    member.lastSeenAt = new Date();

    room.status = normalizeRoomStatus(room);
    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error reconnecting room member:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to mark member connected." });
  }
});

module.exports = router;