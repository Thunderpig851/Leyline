require("dotenv").config();
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");

const { createApp, getAllowedOrigins } = require("./app");
const { registerSFUSignaling, getWorker } = require("./sfu");
const { registerLiveGamePresence } = require("./middleware/liveGamePresence");

async function start()
{
  const port = process.env.PORT || 3001;
  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI)
  {
    console.error("MONGO_URI is not defined in environment variables");
    process.exit(1);
  }

  try
  {
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB");

    await getWorker();

    const app = createApp();
    const server = http.createServer(app);

    const io = new Server(server,
    {
      cors:
      {
        origin: getAllowedOrigins(),
        credentials: true,
      }
    });

    io.on("connection", (socket) =>
    {
      console.log("socket connected:", socket.id);

      socket.on("room:join", ({ roomId } = {}) =>
      {
        if (!roomId) return;
        socket.join(`room:${roomId}`);
      });

      socket.on("room:leave", ({ roomId } = {}) =>
      {
        if (!roomId) return;
        socket.leave(`room:${roomId}`);
      });

      socket.on("disconnect", () => console.log("socket disconnected:", socket.id));
    });

    registerSFUSignaling(io);
    registerLiveGamePresence(io);
    app.set("io", io);

    server.listen(port, () =>
    {
      console.log(`Server is running on port ${port}`);
    });
  }
  catch (error)
  {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
