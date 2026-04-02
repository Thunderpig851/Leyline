const LiveGameModel = require("../database/models/LiveGame");
const RoomModel = require("../database/models/Room");
const RoomChatMessageModel = require("../database/models/RoomChatMessage");
const { UserModel } = require("../database/models/User");

const livePresence = new Map();

const DISCONNECT_GRACE_MS = 90_000;
const AWAY_GRACE_MS = 120_000;
const SWEEP_INTERVAL_MS = 10_000;
const HEARTBEAT_STALE_MS = 30_000;

function makeKey(gameId, userId)
{
  return `${gameId}:${userId}`;
}

function clearPresenceForUser(gameId, userId)
{
  const normalizedGameId = String(gameId || "");
  const normalizedUserId = String(userId || "");

  if (!normalizedGameId || !normalizedUserId)
  {
    return;
  }

  livePresence.delete(makeKey(normalizedGameId, normalizedUserId));
}

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = Array.isArray(room.members)
    ? room.members.filter((member) => member.role !== "spectator").length
    : 0;
  return memberCount >= maxPlayers ? "full" : "open";
}


function getNextHostCandidate(room, liveGame, excludedUserId)
{
  const normalizedExcludedUserId = excludedUserId ? String(excludedUserId) : "";

  const seatedCandidates = Array.isArray(liveGame?.seats)
    ? [...liveGame.seats]
        .filter((seat) => String(seat.userId || "") !== normalizedExcludedUserId)
        .sort((a, b) => Number(a.seatNumber ?? 99) - Number(b.seatNumber ?? 99))
    : [];

  for (const seat of seatedCandidates)
  {
    const matchingMember = room.members.find(
      (member) => String(member.userID || "") === String(seat.userId || "")
    );

    if (matchingMember)
    {
      return {
        userId: String(seat.userId),
        username: seat.username || matchingMember.userID?.username || "",
      };
    }
  }

  const roomCandidates = Array.isArray(room.members)
    ? [...room.members]
        .filter((member) =>
          String(member.userID || "") !== normalizedExcludedUserId
          && member.role !== "spectator"
        )
        .sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime())
    : [];

  const firstRoomCandidate = roomCandidates[0];

  if (firstRoomCandidate)
  {
    return {
      userId: String(firstRoomCandidate.userID),
      username: firstRoomCandidate.userID?.username || "",
    };
  }

  const spectatorCandidate = Array.isArray(room.members)
    ? [...room.members]
        .filter((member) => String(member.userID || "") !== normalizedExcludedUserId)
        .sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime())[0]
    : null;

  if (!spectatorCandidate)
  {
    return null;
  }

  return {
    userId: String(spectatorCandidate.userID),
    username: spectatorCandidate.userID?.username || "",
  };
}

function applyHostToRoomMembers(room, nextHostUserId)
{
  for (const member of room.members)
  {
    if (String(member.userID) === String(nextHostUserId))
    {
      member.role = "host";
      continue;
    }

    if (member.role === "spectator")
    {
      continue;
    }

    member.role = "player";
  }
}

async function resolveUsername(userId, fallback = "")
{
  if (!userId)
  {
    return fallback;
  }

  const user = await UserModel.findById(userId).select("username").lean().exec();
  return user?.username || fallback;
}

function buildRoomMembersFromLiveGame(liveGame, excludedUserId)
{
  if (!liveGame)
  {
    return [];
  }

  const normalizedExcludedUserId = excludedUserId ? String(excludedUserId) : "";
  const seenUserIds = new Set();
  const rebuiltMembers = [];

  const addMember = (userId, role, joinedAt) =>
  {
    const normalizedUserId = String(userId || "");

    if (!normalizedUserId || normalizedUserId === normalizedExcludedUserId || seenUserIds.has(normalizedUserId))
    {
      return;
    }

    seenUserIds.add(normalizedUserId);
    rebuiltMembers.push({
      userID: userId,
      role,
      joinedAt: joinedAt || new Date(),
    });
  };

  const orderedSeats = Array.isArray(liveGame.seats)
    ? [...liveGame.seats].sort((a, b) => Number(a.seatNumber ?? 99) - Number(b.seatNumber ?? 99))
    : [];

  for (const seat of orderedSeats)
  {
    addMember(seat.userId, "player", seat.joinedAt);
  }

  const orderedSpectators = Array.isArray(liveGame.spectators)
    ? [...liveGame.spectators].sort(
        (a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime()
      )
    : [];

  for (const spectator of orderedSpectators)
  {
    addMember(spectator.userId, "spectator", spectator.joinedAt);
  }

  return rebuiltMembers;
}

function restoreRoomMembersFromLiveGame(room, liveGame, excludedUserId)
{
  if (!room || !liveGame)
  {
    return false;
  }

  const rebuiltMembers = buildRoomMembersFromLiveGame(liveGame, excludedUserId);

  if (rebuiltMembers.length === 0)
  {
    return false;
  }

  room.members = rebuiltMembers;
  room.status = normalizeRoomStatus(room);
  return true;
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

async function markParticipantState(gameId, userId, updates = {})
{
  const game = await LiveGameModel.findById(gameId).exec();
  if (!game) return null;

  const applyUpdates = (participant) =>
  {
    if (!participant) return false;

    if (updates.connectionStatus !== undefined) participant.connectionStatus = updates.connectionStatus;
    if (updates.lastSeenAt !== undefined) participant.lastSeenAt = updates.lastSeenAt;
    if (updates.lastActiveAt !== undefined) participant.lastActiveAt = updates.lastActiveAt;
    if (updates.disconnectDeadlineAt !== undefined) participant.disconnectDeadlineAt = updates.disconnectDeadlineAt;
    if (updates.awaySinceAt !== undefined) participant.awaySinceAt = updates.awaySinceAt;
    if (updates.username !== undefined && updates.username) participant.username = updates.username;

    return true;
  };

  const seat = game.seats.find((entry) => entry.userId?.toString() === userId);
  const spectator = Array.isArray(game.spectators)
    ? game.spectators.find((entry) => entry.userId?.toString() === userId)
    : null;

  const didUpdate = applyUpdates(seat) || applyUpdates(spectator);

  if (!didUpdate)
  {
    return null;
  }

  await game.save();
  return game;
}

async function removeParticipantFromGameAndRoom(gameId, roomId, userId)
{
  const [game, room] = await Promise.all([
    LiveGameModel.findById(gameId).exec(),
    RoomModel.findById(roomId).exec(),
  ]);

  let updatedGame = null;
  let updatedRoom = null;
  let roomDeleted = false;
  let hostTransferred = false;

  if (game)
  {
    const removedSeat = game.seats.find((seat) => seat.userId?.toString() === userId) || null;
    const beforeSeats = game.seats.length;
    game.seats = game.seats.filter((seat) => seat.userId?.toString() !== userId);

    if (removedSeat)
    {
      if (Number(game.monarchSeatNumber) === Number(removedSeat.seatNumber))
      {
        game.monarchSeatNumber = null;
      }

      if (Number(game.initiativeSeatNumber) === Number(removedSeat.seatNumber))
      {
        game.initiativeSeatNumber = null;
      }

      if (Number(game.activeTurnSeatNumber) === Number(removedSeat.seatNumber))
      {
        game.activeTurnSeatNumber = null;
        game.turnStartedAt = null;
      }
    }

    const beforeSpectators = Array.isArray(game.spectators) ? game.spectators.length : 0;
    game.spectators = Array.isArray(game.spectators)
      ? game.spectators.filter((spectator) => spectator.userId?.toString() !== userId)
      : [];

    if (game.seats.length !== beforeSeats || game.spectators.length !== beforeSpectators)
    {
      await game.save();
      updatedGame = game;
    }
  }

  if (room)
  {
    const leavingMember = room.members.find((member) => member.userID?.toString() === userId) || null;
    const before = room.members.length;
    room.members = room.members.filter((member) => member.userID?.toString() !== userId);

    if (room.members.length !== before)
    {
      if (room.members.length === 0 && !restoreRoomMembersFromLiveGame(room, updatedGame || game, userId))
      {
        await Promise.all([
          RoomChatMessageModel.deleteMany({ roomId }).exec(),
          LiveGameModel.deleteMany({ roomId }).exec(),
          RoomModel.deleteOne({ _id: roomId }).exec(),
        ]);

        clearPresenceForGame(gameId);
        roomDeleted = true;
      }
      else
      {
        const wasHost = String(room.hostID) === String(userId) || leavingMember?.role === "host";

        if (wasHost)
        {
          const nextHost = getNextHostCandidate(room, updatedGame || game, userId);

          if (nextHost)
          {
            room.hostID = nextHost.userId;
            room.hostName = await resolveUsername(nextHost.userId, nextHost.username || room.hostName);
            applyHostToRoomMembers(room, nextHost.userId);
            hostTransferred = true;
          }
        }

        room.status = normalizeRoomStatus(room);
        await room.save();
        updatedRoom = room;
      }
    }
  }

  return { game: updatedGame, room: updatedRoom, roomDeleted, hostTransferred };
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

function emitLobbyRefresh(io)
{
  io.emit("rooms:changed");
}

function emitGameUpdated(io, game)
{
  io.to(`live-game:${game._id}`).emit("game:updated", { game });
  io.to(`room:${game.roomId}`).emit("live-game:updated", { game });
}

function emitGameEnded(io, gameId, roomId)
{
  io.to(`live-game:${gameId}`).emit("game:ended", {
    gameId: String(gameId),
    roomId: String(roomId),
  });

  io.to(`room:${roomId}`).emit("game:ended", {
    gameId: String(gameId),
    roomId: String(roomId),
  });
}

function emitHostTransferred(io, game, room)
{
  const payload = {
    gameId: String(game._id),
    roomId: String(game.roomId),
    hostUserId: room.hostID ? String(room.hostID) : "",
    hostName: room.hostName || "",
  };

  io.to(`live-game:${game._id}`).emit("game:host-transferred", payload);
  io.to(`room:${game.roomId}`).emit("game:host-transferred", payload);
  io.emit("rooms:changed");
}

function emitRoomUpdated(io, room)
{
  io.to(`room:${room._id}`).emit("room:updated", { room });
  io.emit("rooms:changed");
}

function clearPresenceForGame(gameId)
{
  if (!gameId) return;

  const normalizedGameId = String(gameId);

  for (const [key, entry] of livePresence.entries())
  {
    if (String(entry.gameId) === normalizedGameId)
    {
      livePresence.delete(key);
    }
  }
}

async function handleJoin(io, socket, payload = {})
{
  const { gameId, roomId, userId, username } = payload;

  if (!gameId || !roomId || !userId) return;

  const entry = getOrCreateEntry({ gameId, roomId, userId, username });
  const previousState = entry.state;

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

  const game = await markParticipantState(gameId, userId, {
    connectionStatus: "connected",
    lastSeenAt: new Date(),
    lastActiveAt: new Date(),
    disconnectDeadlineAt: null,
    awaySinceAt: null,
    username,
  });

  if (game) emitGameUpdated(io, game);
  emitPresenceChanged(io, entry);

  if (previousState !== entry.state)
  {
    emitLobbyRefresh(io);
  }
}

async function handleHeartbeat(io, payload = {})
{
  const {
    gameId,
    roomId,
    userId,
    username,
    hidden = false,
    page = "game",
  } = payload;

  if (!gameId || !roomId || !userId) return;

  const entry = getOrCreateEntry({ gameId, roomId, userId, username });
  const previousState = entry.state;
  entry.lastHeartbeatAt = Date.now();

  const shouldBeAway = hidden || page !== "game";

  if (shouldBeAway)
  {
    entry.state = "away";
    entry.disconnectDeadlineAt = null;
    entry.awayDeadlineAt = Date.now() + AWAY_GRACE_MS;

    const game = await markParticipantState(gameId, userId, {
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

    const game = await markParticipantState(gameId, userId, {
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

  if (previousState !== entry.state)
  {
    emitLobbyRefresh(io);
  }
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

  const { game, room, roomDeleted, hostTransferred } = await removeParticipantFromGameAndRoom(gameId, roomId, userId);

  if (roomDeleted)
  {
    emitGameEnded(io, gameId, roomId);
    io.to(`room:${roomId}`).emit("room:deleted", { roomId: String(roomId) });
    io.emit("rooms:changed");
    return;
  }

  if (game) emitGameUpdated(io, game);

  if (room)
  {
    if (hostTransferred && (game || room))
    {
      emitHostTransferred(io, game || { _id: gameId, roomId }, room);
    }
    else
    {
      emitRoomUpdated(io, room);
    }
  }
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

  const previousState = entry.state;

  entry.state = "reconnecting";
  entry.disconnectDeadlineAt = Date.now() + DISCONNECT_GRACE_MS;
  entry.awayDeadlineAt = null;

  const game = await markParticipantState(gameId, userId, {
    connectionStatus: "reconnecting",
    lastSeenAt: new Date(),
    disconnectDeadlineAt: new Date(entry.disconnectDeadlineAt),
    awaySinceAt: null,
  });

  if (game) emitGameUpdated(io, game);
  emitPresenceChanged(io, entry);

  if (previousState !== entry.state)
  {
    emitLobbyRefresh(io);
  }
}

async function sweep(io)
{
  const now = Date.now();

  for (const [key, entry] of livePresence.entries())
  {
    const heartbeatStale =
      now - entry.lastHeartbeatAt >= HEARTBEAT_STALE_MS;

    if (entry.state === "connected" && heartbeatStale)
    {
      entry.state = "away";
      entry.awayDeadlineAt = now + AWAY_GRACE_MS;

      const game = await markParticipantState(entry.gameId, entry.userId, {
        connectionStatus: "away",
        lastSeenAt: new Date(),
        awaySinceAt: new Date(),
        disconnectDeadlineAt: null,
      });

      if (game) emitGameUpdated(io, game);
      emitPresenceChanged(io, entry);
      emitLobbyRefresh(io);
      continue;
    }

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

    const { game, room, roomDeleted, hostTransferred } = await removeParticipantFromGameAndRoom(
      entry.gameId,
      entry.roomId,
      entry.userId
    );

    if (roomDeleted)
    {
      emitGameEnded(io, entry.gameId, entry.roomId);
      io.to(`room:${entry.roomId}`).emit("room:deleted", { roomId: String(entry.roomId) });
      io.emit("rooms:changed");
      continue;
    }

    if (game) emitGameUpdated(io, game);

    if (room)
    {
      if (hostTransferred && (game || room))
      {
        emitHostTransferred(io, game || { _id: entry.gameId, roomId: entry.roomId }, room);
      }
      else
      {
        emitRoomUpdated(io, room);
      }
    }
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
  clearPresenceForUser,
  clearPresenceForGame,
  registerLiveGamePresence,
};