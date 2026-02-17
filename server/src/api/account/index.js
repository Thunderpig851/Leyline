const router = require("express").Router();

router.get("/", (req, res) => res.json({ ok: true, route: "account" }));

module.exports = router;
