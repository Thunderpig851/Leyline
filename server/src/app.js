require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./api/auth");
const requireAuth = require("./middleware/requireAuth");
const accountRoutes = require("./api/account");
const roomsRoutes = require("./api/rooms");
const liveGamesRoutes = require("./api/games");
const chatRoutes = require("./api/chat");
const lfgRoutes = require("./api/lfg");
const cardIdRoutes = require("./api/card-id");

const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || "50mb";

function getAllowedOrigins()
{
  const configured = String(process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length > 0)
  {
    return configured;
  }

  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function createCorsOriginHandler()
{
  const allowedOrigins = getAllowedOrigins();

  return function corsOriginHandler(origin, callback)
  {
    if (!origin || allowedOrigins.includes(origin))
    {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  };
}

function createApp()
{
  const app = express();

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(
    cors({
      origin: createCorsOriginHandler(),
      credentials: true,
    })
  );

  app.get("/health", (req, res) =>
  {
    res.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/account", requireAuth, accountRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/live-games", requireAuth, liveGamesRoutes);
  app.use("/api/chat", requireAuth, chatRoutes);
  app.use("/api/lfg", requireAuth, lfgRoutes);
  app.use("/api/card-id", cardIdRoutes);

  app.use((error, req, res, next) =>
  {
    if (error?.type === "entity.too.large")
    {
      return res.status(413).json({
        ok: false,
        error: "Card OCR payload too large",
      });
    }

    return next(error);
  });

  app.use((req, res) =>
  {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

module.exports = { createApp, getAllowedOrigins, createCorsOriginHandler };
