const router = require("express").Router();
const bcrypt = require('bcrypt');

const { UserModel } = require("../../database/models/User");

router.get("/", (req, res) => res.json({ ok: true, route: "auth" }));

router.post("/register", async (req, res) => 
{
  try 
  {
    const { username, email, password } = req.body;
    const createdAt = new Date();

    if (!username || !email || !password) 
    {
      return res.status(400).json(
      {
        ok: false,
        error: "Username, email, and password are required."
      });
    }

    if (!validateEmail(email)) 
    {
      return res.status(400).json({ ok: false, error: "Email is invalid." });
    }

    if (!validatePassword(password)) 
    {
      return res.status(400).json({ ok: false, error: "Password does not meet requirements." });
    }

    const passwordHash = await hashPassword(password);

    const user = await UserModel.create({
      username,
      email,
      passwordHash,
      createdAt,
    });

    return res.status(201).json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
      }
    });
  } 
  catch (err) 
  {
    if (err && err.code === 11000) 
    {
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || "field";
      return res.status(409).json({ ok: false, error: `${field} already in use.` });
    }

    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/login", async (req, res) => 
{
    
    try 
    {
        if (!req.body.username || !req.body.password) 
        {
            return res.status(400).json({ ok: false, error: "Username and password are required." });
        }

        const user = await UserModel.findOne({ username: req.body.username }).select('+passwordHash');

        if (!user) 
        {
            return res.status(401).json({ ok: false, error: "Invalid username or password." });
        }

        const passwordMatch = await bcrypt.compare(req.body.password, user.passwordHash);

        if (!passwordMatch)
        {
            return res.status(401).json({ ok: false, error: "Invalid username or password." });
        }

        user.status = 'online';
        await user.save();

        return res.json({
            ok: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt,
                status: user.status
            }
        });
     
    }

    catch (err)
    {
        console.error("Error during login:", err);
        return res.status(500).json({ ok: false, error: "An error occurred during login." });
    }
});

router.post("/logout", async (req, res) =>
{
    try 
    {
        const { username } = req.body;

        if (!username) 
        {
            return res.status(400).json({ ok: false, error: "Username is required." });
        }

        const user = await UserModel.findOne({ username });

        if (!user) 
        {
            return res.status(404).json({ ok: false, error: "User not found." });
        }

        user.status = 'offline';
        await user.save();

        return res.json({ ok: true, message: "User logged out successfully." });
    } 
    catch (err) 
    {
        console.error("Error during logout:", err);
        return res.status(500).json({ ok: false, error: "An error occurred during logout." });
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

function validateEmail(email) 
{
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function hashPassword(password) 
{
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

module.exports = router;
