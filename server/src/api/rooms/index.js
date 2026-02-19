require("dotenv").config();
const router = require("express").Router();

const RoomModel = require("../../database/models/Room");

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

router.post("/create", async (req, res) =>
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

      visibility: visibility || "private",
      status: "open",

      members: [{ userID: hostId, role: "host" }],

      settings: settings || undefined,
    });

    return res.status(201).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error creating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to create room." });
  }
});

module.exports = router;
