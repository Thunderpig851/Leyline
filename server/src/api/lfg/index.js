const router = require("express").Router();

router.get("/", (req, res) => res.json({ ok: true, route: "lfg" }));

module.exports = router;
