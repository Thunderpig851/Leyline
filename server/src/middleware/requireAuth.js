const jwt = require("jsonwebtoken");

function getToken(req)
{
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;

  return null;
}

module.exports = function requireAuth(req, res, next)
{
  try
  {
    const token = getToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = payload.userId;

    return next();
  }
  catch (err)
  {
    return res.status(401).json({ ok: false, error: `Invalid token: ${err.message}` });
  }
};
