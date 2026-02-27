const requireAuth = require("../../middleware/requireAuth");
const bcrypt = require('bcrypt')

const router = require("express").Router();

const { UserModel } = require("../../database/models/User");

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

router.patch("/update", requireAuth, async (req, res) =>
{
  try
  {
    const user = await UserModel.findById(req.user._id);
    if (!user) return res.status(404).json({ ok: false, error: "User not found" });

    const { password, friends, blockedUsers } = req.body;

    if (password !== undefined)
    {
      if (!validatePassword(password))
      {
        return res.status(400).json({ ok: false, error: "Password does not meet requirements." });
      }

      const passwordHash = await hashPassword(password);
      user.passwordHash = passwordHash;
    }

    if (friends !== undefined) user.friends = friends;
    if (blockedUsers !== undefined) user.blockedUsers = blockedUsers;

    await user.save();

    return res.json({ ok: true, user: { _id: user._id, username: user.username } });
  }
  catch (err)
  {
    console.error("Error updating user data:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update user data." });
  }
});

function validatePassword(password) 
{
  if (typeof password !== "string") return false;
  if (password.length < 10) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

async function hashPassword(password) 
{
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

module.exports = router;
