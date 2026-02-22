require("dotenv").config();
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const { createApp } = require("./app");

async function start() {
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

    const app = createApp();
    const server = http.createServer(app);

    const io = new Server(server, 
    {
      cors: 
      {
        origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
        credentials: true,
      },
    })

    io.on("connection", (socket) => 
    {
      console.log("socket connected:", socket.id);

      socket.on("disconnect", () => 
      {
        console.log("socket disconnected:", socket.id)
      });
    });

    app.set("io", io)

    app.listen(port, () => 
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
