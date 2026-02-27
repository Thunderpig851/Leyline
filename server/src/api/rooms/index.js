require("dotenv").config();

const router = require("express").Router();
const requireAuth = require("../../middleware/requireAuth")

const RoomModel = require("../../database/models/Room");

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

router.post("/create", requireAuth ,async (req, res) =>
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

      members: [{ userID: hostId, role: "host" }],

      settings: settings,
    });

    const io = req.app.get("io");
    io.emit("rooms:changed")

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
    return res.status(200).json({ok: true, rooms});
  }
  catch (err)
  {
    console.log("Error fetching rooms");
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch rooms." });

  }
});

router.get("/:id" , async (req, res) =>
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
      return res.status(403).json({ ok: false, error: "Only the host can update the room." });

    const { title, description, visibility, settings } = req.body;

    if (title) room.title = title.trim();
    if (description) room.description = description.trim();
    if (visibility) room.visibility = visibility;
    if (settings) room.settings = settings;

    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed")

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error updating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update room." });
  }
});

module.exports = router;
