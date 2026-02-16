require('dotenv').config();
const express = require('express');
const cors = require('cors');

// const { connectToMongoDB } = require('../database/mongo');

const authRoutes = require("./api/auth");
const accountRoutes = require("./api/account");
const roomsRoutes = require("./api/rooms");
const lfgRoutes = require("./api/lfg");
const lobbyRoutes = require("./api/lobby");

function createApp()
{
    const app = express();
    
    // Middleware
    app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      credentials: true,
    })
  );
}

app.get('/health', (req, res) => 
{
    res.status(200).json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/lfg', lfgRoutes);
app.use('/api/lobby', lobbyRoutes);

app.use((req, rea) =>
{
    res.status(404).json({ error: 'Not found' });
});

return app; 

module.exports = createApp;
