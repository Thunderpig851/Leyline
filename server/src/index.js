require("dotenv").config();
const mongoose = require("mongoose");
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
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
