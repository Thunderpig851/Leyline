require('dotenv').config();
const router = require("express").Router();
const jwt = require("jsonwebtoken");

const { RoomModel } = require("../../database/models/Room");
const { UserModel } = require("../../database/models/User");

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

// router.post("/create", async (req, res) => 
// {
//     try
//     {
//         userID: 
//     }
//     catch(err)
//     {
//         console.error("Error creating room:", err);
//         res.status(500).json({ ok: false, error: "Failed to create room." });
//     }
// });


module.exports = router;
