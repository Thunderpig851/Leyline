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

    const hostId = req.userId;

    const room = await RoomModel.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,

      host: hostId,
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

module.exports = router;
