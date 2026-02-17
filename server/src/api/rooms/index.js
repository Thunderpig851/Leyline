const router = require("express").Router();

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

module.exports = router;
