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

  return ["http://localhost:5173", "http://localhost"];
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

    return callback(new Error("Origin not allowed by CORS"));
  };
}

function buildAllowedOrigins()
{
  return String(process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsOriginHandler()
{
  const allowedOrigins = buildAllowedOrigins();

  return function corsOriginHandler(origin, callback)
  {
    if (!origin)
    {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin))
    {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  };
}

function createApp()
{
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: createCorsOriginHandler(),
      origin: createCorsOriginHandler(),
      credentials: true,
    })
  );

  app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/account", requireAuth, accountRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/live-games", requireAuth, liveGamesRoutes);
  app.use("/api/chat", requireAuth, chatRoutes);
  app.use("/api/lfg", requireAuth, lfgRoutes);

  app.use((req, res) =>
  app.use((req, res) =>
  {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

module.exports = { createApp, buildAllowedOrigins, createCorsOriginHandler };
