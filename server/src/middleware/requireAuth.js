const jwt = require("jsonwebtoken");
const { UserModel } = require("../database/models/User");

function getToken(req)
{
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;

  return null;
}

module.exports = async function requireAuth(req, res, next)
{
  try
  {
    const token = getToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const userId = payload.sub || payload.userId;
    if (!userId) return res.status(401).json({ ok: false, error: "Invalid token: missing user id" });

    req.userId = userId;

    const user = await UserModel.findById(userId).select("_id username").lean();
    if (!user) return res.status(401).json({ ok: false, error: "Invalid token: user not found" });

    req.user = user;

    return next();
  }
  catch (err)
  {
    if (err && err.name === "TokenExpiredError")
    {
      return res.status(401).json({ ok: false, error: "Invalid token: jwt expired" });
    }

    return res.status(401).json({ ok: false, error: `Invalid token: ${err.message}` });
  }
};