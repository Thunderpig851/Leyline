const LiveGameModel = require("../database/models/LiveGame");
const RoomModel = require("../database/models/Room");

const livePresence = new Map();

const DISCONNECT_GRACE_MS = 90_000;
const AWAY_GRACE_MS = 120_000;
const SWEEP_INTERVAL_MS = 10_000;

function makeKey(gameId, userId)
{
  return `${gameId}:${userId}`;
}

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = Array.isArray(room.members) ? room.members.length : 0;
  return memberCount >= maxPlayers ? "full" : "open";
}

function getOrCreateEntry({ gameId, roomId, userId, username })
{
  const key = makeKey(gameId, userId);

  if (!livePresence.has(key))
  {
    livePresence.set(key, {
      key,
      gameId,
      roomId,
      userId,
      username: username || null,
      socketIds: new Set(),
      state: "connected",
      lastHeartbeatAt: Date.now(),
      disconnectDeadlineAt: null,
      awayDeadlineAt: null,
    });
  }

  const entry = livePresence.get(key);

  entry.roomId = roomId || entry.roomId;
  entry.username = username || entry.username;

  return entry;
}

async function markSeatState(gameId, userId, updates = {})
{
  const game = await LiveGameModel.findById(gameId).exec();
  if (!game) return null;

  const seat = game.seats.find((s) => s.userId?.toString() === userId);
  if (!seat) return null;

  if (updates.connectionStatus !== undefined) seat.connectionStatus = updates.connectionStatus;
  if (updates.lastSeenAt !== undefined) seat.lastSeenAt = updates.lastSeenAt;
  if (updates.lastActiveAt !== undefined) seat.lastActiveAt = updates.lastActiveAt;
  if (updates.disconnectDeadlineAt !== undefined) seat.disconnectDeadlineAt = updates.disconnectDeadlineAt;
  if (updates.awaySinceAt !== undefined) seat.awaySinceAt = updates.awaySinceAt;
  if (updates.username !== undefined && updates.username) seat.username = updates.username;

  await game.save();
  return game;
}

async function removePlayerFromGameAndRoom(gameId, roomId, userId)
{
  const [game, room] = await Promise.all([
    LiveGameModel.findById(gameId).exec(),
    RoomModel.findById(roomId).exec(),
  ]);

  let updatedGame = null;
  let updatedRoom = null;

  if (game)
  {
    const before = game.seats.length;
    game.seats = game.seats.filter((seat) => seat.userId?.toString() !== userId);

    if (game.seats.length !== before)
    {
      await game.save();
      updatedGame = game;
    }
  }

  if (room)
  {
    const before = room.members.length;
    room.members = room.members.filter((member) => member.userID?.toString() !== userId);
    room.status = normalizeRoomStatus(room);

    if (room.members.length !== before)
    {
      await room.save();
      updatedRoom = room;
    }
  }

  return { game: updatedGame, room: updatedRoom };
}

function emitPresenceChanged(io, entry)
{
  io.to(`live-game:${entry.gameId}`).emit("live-game:presence", {
    gameId: entry.gameId,
    roomId: entry.roomId,
    userId: entry.userId,
    username: entry.username,
    state: entry.state,
  });
}

function emitGameUpdated(io, game)
{
  io.to(`live-game:${game._id}`).emit("game:updated", { game });
  io.to(`room:${game.roomId}`).emit("live-game:updated", { game });
}

function emitRoomUpdated(io, room)
{
  io.to(`room:${room._id}`).emit("room:updated", { room });
  io.emit("rooms:changed");
}

async function handleJoin(io, socket, payload = {})
{
  const { gameId, roomId, userId, username } = payload;

  if (!gameId || !roomId || !userId) return;

  const entry = getOrCreateEntry({ gameId, roomId, userId, username });

  entry.socketIds.add(socket.id);
  entry.state = "connected";
  entry.lastHeartbeatAt = Date.now();
  entry.disconnectDeadlineAt = null;
  entry.awayDeadlineAt = null;

  socket.data.liveGamePresenceKey = entry.key;
  socket.data.gameId = gameId;
  socket.data.roomId = roomId;
  socket.data.userId = userId;
  socket.data.username = username || null;

  socket.join(`live-game:${gameId}`);
  socket.join(`room:${roomId}`);

  const game = await markSeatState(gameId, userId, {
    connectionStatus: "connected",
    lastSeenAt: new Date(),
    lastActiveAt: new Date(),
    disconnectDeadlineAt: null,
    awaySinceAt: null,
    username,
  });

  if (game) emitGameUpdated(io, game);
  emitPresenceChanged(io, entry);
}

async function handleHeartbeat(io, payload = {})
{
  const { gameId, roomId, userId, username, hidden = false } = payload;

  if (!gameId || !roomId || !userId) return;

  const entry = getOrCreateEntry({ gameId, roomId, userId, username });

  entry.lastHeartbeatAt = Date.now();

  if (hidden)
  {
    entry.state = "away";
    entry.awayDeadlineAt = Date.now() + AWAY_GRACE_MS;

    const game = await markSeatState(gameId, userId, {
      connectionStatus: "away",
      lastSeenAt: new Date(),
      awaySinceAt: new Date(),
      disconnectDeadlineAt: null,
      username,
    });

    if (game) emitGameUpdated(io, game);
  }
  else
  {
    entry.state = "connected";
    entry.disconnectDeadlineAt = null;
    entry.awayDeadlineAt = null;

    const game = await markSeatState(gameId, userId, {
      connectionStatus: "connected",
      lastSeenAt: new Date(),
      lastActiveAt: new Date(),
      disconnectDeadlineAt: null,
      awaySinceAt: null,
      username,
    });

    if (game) emitGameUpdated(io, game);
  }

  emitPresenceChanged(io, entry);
}

async function handleExplicitLeave(io, socket, payload = {})
{
  const gameId = payload.gameId || socket.data.gameId;
  const roomId = payload.roomId || socket.data.roomId;
  const userId = payload.userId || socket.data.userId;

  if (!gameId || !roomId || !userId) return;

  const key = makeKey(gameId, userId);
  livePresence.delete(key);

  socket.leave(`live-game:${gameId}`);
  socket.leave(`room:${roomId}`);

  const { game, room } = await removePlayerFromGameAndRoom(gameId, roomId, userId);

  if (game) emitGameUpdated(io, game);
  if (room) emitRoomUpdated(io, room);
}

async function handleDisconnect(io, socket)
{
  const { gameId, roomId, userId } = socket.data || {};
  if (!gameId || !roomId || !userId) return;

  const key = makeKey(gameId, userId);
  const entry = livePresence.get(key);
  if (!entry) return;

  entry.socketIds.delete(socket.id);

  if (entry.socketIds.size > 0) return;

  entry.state = "reconnecting";
  entry.disconnectDeadlineAt = Date.now() + DISCONNECT_GRACE_MS;
  entry.awayDeadlineAt = null;

  const game = await markSeatState(gameId, userId, {
    connectionStatus: "reconnecting",
    lastSeenAt: new Date(),
    disconnectDeadlineAt: new Date(entry.disconnectDeadlineAt),
    awaySinceAt: null,
  });

  if (game) emitGameUpdated(io, game);
  emitPresenceChanged(io, entry);
}

async function sweep(io)
{
  const now = Date.now();

  for (const [key, entry] of livePresence.entries())
  {
    const reconnectExpired =
      entry.state === "reconnecting" &&
      entry.disconnectDeadlineAt &&
      now >= entry.disconnectDeadlineAt;

    const awayExpired =
      entry.state === "away" &&
      entry.awayDeadlineAt &&
      now >= entry.awayDeadlineAt;

    if (!reconnectExpired && !awayExpired) continue;

    livePresence.delete(key);

    const { game, room } = await removePlayerFromGameAndRoom(
      entry.gameId,
      entry.roomId,
      entry.userId
    );

    if (game) emitGameUpdated(io, game);
    if (room) emitRoomUpdated(io, room);
  }
}

function registerLiveGamePresence(io)
{
  io.on("connection", (socket) =>
  {
    socket.on("live-game:join", (payload) =>
    {
      handleJoin(io, socket, payload).catch((err) =>
      {
        console.error("live-game:join failed:", err);
      });
    });

    socket.on("live-game:heartbeat", (payload) =>
    {
      handleHeartbeat(io, payload).catch((err) =>
      {
        console.error("live-game:heartbeat failed:", err);
      });
    });

    socket.on("live-game:leave", (payload) =>
    {
      handleExplicitLeave(io, socket, payload).catch((err) =>
      {
        console.error("live-game:leave failed:", err);
      });
    });

    socket.on("disconnect", () =>
    {
      handleDisconnect(io, socket).catch((err) =>
      {
        console.error("live-game disconnect failed:", err);
      });
    });
  });

  setInterval(() =>
  {
    sweep(io).catch((err) =>
    {
      console.error("live-game sweep failed:", err);
    });
  }, SWEEP_INTERVAL_MS);
}

module.exports =
{
  registerLiveGamePresence,
};