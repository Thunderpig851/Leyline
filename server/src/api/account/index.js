const requireAuth = require("../../middleware/requireAuth");

const router = require("express").Router();

router.get("/", (req, res) => res.json({ ok: true, route: "account" }));

router.get("/me", requireAuth, (req, res) =>
{
  try
  {
    if (!req.user)
    return res.status(401).json({ ok: false, error: "Unauthorized" });

    const { _id, username } = req.user;
    return res.json({ ok: true, user: { _id, username } });
  }
  catch (err)
  {
    console.error("Error fetching user data:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch user data." });
  }
});

module.exports = router;
