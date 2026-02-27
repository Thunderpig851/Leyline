require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./api/auth");
const requireAuth = require("./middleware/requireAuth");
const accountRoutes = require("./api/account");
const roomsRoutes = require("./api/rooms");
const lfgRoutes = require("./api/lfg");

function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  );

  app.get("/health", (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/account", requireAuth, accountRoutes);
  app.use("/api/rooms", roomsRoutes); 
  app.use("/api/lfg", lfgRoutes);

  app.use((req, res) => 
  {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

module.exports = { createApp };
