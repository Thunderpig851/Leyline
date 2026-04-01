require("dotenv").config();

const jwt = require("jsonwebtoken");
const router = require("express").Router();
const requireAuth = require("../../middleware/requireAuth");

const RoomModel = require("../../database/models/Room");
const LiveGameModel = require("../../database/models/LiveGame");
const RoomChatMessageModel = require("../../database/models/RoomChatMessage");
const { UserModel } = require("../../database/models/User");
const { clearPresenceForGame } = require("../../middleware/liveGamePresence");

const PRIVATE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

router.get("/", (req, res) => res.json({ ok: true, route: "rooms" }));

function getPlayerMemberCount(room)
{
  return Array.isArray(room.members)
    ? room.members.filter((member) => member.role !== "spectator").length
    : 0;
}

function normalizeRoomStatus(room)
{
  const maxPlayers = Number(room.settings?.maxPlayers ?? 4);
  const memberCount = getPlayerMemberCount(room);
  return memberCount >= maxPlayers ? "full" : "open";
}

function normalizePrivateCode(value)
{
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function createPrivateCode()
{
  let code = "";

  for (let index = 0; index < 6; index += 1)
  {
    const randomIndex = Math.floor(Math.random() * PRIVATE_CODE_ALPHABET.length);
    code += PRIVATE_CODE_ALPHABET[randomIndex];
  }

  return code;
}

async function generateUniquePrivateCode()
{
  for (let attempt = 0; attempt < 25; attempt += 1)
  {
    const candidate = createPrivateCode();
    const existingRoom = await RoomModel.exists({ privateCode: candidate });

    if (!existingRoom)
    {
      return candidate;
    }
  }

  throw new Error("Failed to generate a unique private room code.");
}

function getRequesterIdFromToken(req)
{
  try
  {
    const auth = req.headers.authorization;
    const bearerToken = auth && auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : null;

    const token = bearerToken || req.cookies?.access_token;

    if (!token)
    {
      return null;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const requesterId = payload?.sub || payload?.userId;

    return requesterId ? String(requesterId) : null;
  }
  catch
  {
    return null;
  }
}

function getSeatSnapshot(room, liveGame)
{
  if (Array.isArray(liveGame?.seats) && liveGame.seats.length > 0)
  {
    return [...liveGame.seats]
      .sort((a, b) => Number(a.seatNumber ?? 99) - Number(b.seatNumber ?? 99))
      .map((seat, index) =>
      ({
        role: seat.username === room.hostName ? "host" : "player",
        username: seat.username,
        seatNumber:
          typeof seat.seatNumber === "number" && Number.isFinite(seat.seatNumber)
            ? seat.seatNumber
            : index + 1,
        commanders: Array.isArray(seat.commanders)
          ? seat.commanders.map((entry) => entry?.name).filter(Boolean)
          : [],
      }));
  }

  if (!Array.isArray(room.members))
  {
    return [];
  }

  return room.members.map((member, index) =>
  ({
    role: member.role,
    username: member.userID?.username || (member.role === "host" ? room.hostName : "Unknown"),
    seatNumber: index + 1,
    commanders: [],
  }));
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

  if (!firstRoomCandidate)
  {
    return null;
  }

  return {
    userId: String(firstRoomCandidate.userID),
    username: firstRoomCandidate.userID?.username || "",
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

function emitHostTransferred(io, room, liveGame)
{
  if (!io || !room)
  {
    return;
  }

  const payload = {
    roomId: String(room._id),
    gameId: liveGame?._id ? String(liveGame._id) : undefined,
    hostUserId: room.hostID ? String(room.hostID) : "",
    hostName: room.hostName || "",
  };

  io.to(`room:${room._id}`).emit("game:host-transferred", payload);

  if (liveGame?._id)
  {
    io.to(`live-game:${liveGame._id}`).emit("game:host-transferred", payload);
  }

  io.emit("rooms:changed");
}

async function deleteRoomArtifacts(roomId)
{
  const activeGames = await LiveGameModel.find({ roomId }).select("_id roomId").lean().exec();

  await Promise.all([
    RoomChatMessageModel.deleteMany({ roomId }).exec(),
    LiveGameModel.deleteMany({ roomId }).exec(),
    RoomModel.deleteOne({ _id: roomId }).exec(),
  ]);

  for (const game of activeGames)
  {
    clearPresenceForGame(game._id);
  }

  return activeGames;
}

router.post("/create", requireAuth, async (req, res) =>
{
  try
  {
    const { title, description, visibility, settings } = req.body;

    const hostId = req.user._id;
    const nextVisibility = visibility === "private" ? "private" : "public";
    const privateCode = nextVisibility === "private"
      ? await generateUniquePrivateCode()
      : undefined;

    const room = await RoomModel.create({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : undefined,

      hostID: hostId,
      hostName: req.user.username,
      createdBy: hostId,

      visibility: nextVisibility,
      privateCode,
      status: "open",

      members: [
        {
          userID: hostId,
          role: "host",
          joinedAt: new Date(),
        }
      ],

      settings: settings,
    });

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(201).json({
      ok: true,
      room: {
        _id: room._id,
        title: room.title,
        visibility: room.visibility,
      },
      privateCode: room.privateCode || null,
    });
  }
  catch (err)
  {
    console.error("Error creating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to create room." });
  }
});

/*
  IMPORTANT:
  This route must return BOTH public and private rooms if you want
  private games visible in the lobby.
*/
router.get("/all", async (req, res) =>
{
  try
  {
    const rooms = await RoomModel.find({})
      .populate("members.userID", "username")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    const roomIds = rooms.map((room) => room._id);

    const activeGames = await LiveGameModel.find({
      roomId: { $in: roomIds },
      status: "active",
    })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    const liveGameByRoomId = new Map();

    for (const game of activeGames)
    {
      const key = String(game.roomId);

      if (!liveGameByRoomId.has(key))
      {
        liveGameByRoomId.set(key, game);
      }
    }

    const enrichedRooms = rooms.map((room) =>
    {
      const liveGame = liveGameByRoomId.get(String(room._id));
      const seatSnapshot = getSeatSnapshot(room, liveGame);

      return {
        ...room,
        status: normalizeRoomStatus(room),
        seats: seatSnapshot,
        activeGameId: liveGame?._id ? String(liveGame._id) : null,
        spectatorCount: Array.isArray(liveGame?.spectators) ? liveGame.spectators.length : 0,
        maxSpectators: 4,
      };
    });

    return res.status(200).json({ ok: true, rooms: enrichedRooms });
  }
  catch (err)
  {
    console.error("Error fetching rooms:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch rooms." });
  }
});

router.post("/private/lookup", requireAuth, async (req, res) =>
{
  try
  {
    const privateCode = normalizePrivateCode(req.body?.privateCode);

    if (privateCode.length !== 6)
    {
      return res.status(400).json({ ok: false, error: "Enter a valid 6-character private code." });
    }

    const room = await RoomModel.findOne({ privateCode })
      .select("_id title visibility")
      .lean()
      .exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Private room not found for that code." });
    }

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error looking up private room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to find private room." });
  }
});

router.get("/:id/private-code", requireAuth, async (req, res) =>
{
  try
  {
    const room = await RoomModel.findById(req.params.id)
      .select("hostID visibility privateCode")
      .exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    if (String(room.hostID) !== String(req.user._id))
    {
      return res.status(403).json({ ok: false, error: "Only the host can view the private code." });
    }

    if (room.visibility !== "private")
    {
      return res.status(404).json({ ok: false, error: "This room does not have a private code." });
    }

    if (!room.privateCode)
    {
      room.privateCode = await generateUniquePrivateCode();
      await room.save();
    }

    return res.status(200).json({ ok: true, privateCode: room.privateCode });
  }
  catch (err)
  {
    console.error("Error fetching private room code:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch private room code." });
  }
});

router.get("/:id", async (req, res) =>
{
  try
  {
    const room = await RoomModel.findById(req.params.id)
      .select("_id title description visibility hostID hostName settings status createdAt updatedAt")
      .lean()
      .exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const requesterId = getRequesterIdFromToken(req);
    const isHost = requesterId ? String(room.hostID) === requesterId : false;
    const activeGame = await LiveGameModel.findOne({
      roomId: room._id,
      status: "active",
    })
      .select("_id spectators")
      .lean()
      .exec();

    return res.status(200).json({
      ok: true,
      room: {
        _id: room._id,
        title: room.title,
        description: room.description,
        visibility: room.visibility,
        hostID: String(room.hostID),
        hostName: room.hostName,
        status: room.status,
        createdAt: room.createdAt,
        settings: room.settings,
        isHost,
        activeGameId: activeGame?._id ? String(activeGame._id) : null,
        spectatorCount: Array.isArray(activeGame?.spectators) ? activeGame.spectators.length : 0,
        maxSpectators: 4,
      },
    });
  }
  catch (err)
  {
    console.error("Error fetching room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to fetch room." });
  }
});

router.patch("/:id/update", requireAuth, async (req, res) =>
{
  try
  {
    const room = await RoomModel.findById(req.params.id).exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    if (room.hostID.toString() !== req.user._id.toString())
    {
      return res.status(403).json({ ok: false, error: "Only the host can update the room." });
    }

    const { title, description, visibility, settings } = req.body;

    if (title) room.title = title.trim();
    if (description) room.description = description.trim();

    if (visibility === "public" || visibility === "private")
    {
      room.visibility = visibility;

      if (visibility === "private" && !room.privateCode)
      {
        room.privateCode = await generateUniquePrivateCode();
      }

      if (visibility === "public")
      {
        room.privateCode = undefined;
      }
    }

    if (settings) room.settings = settings;

    room.status = normalizeRoomStatus(room);

    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room });
  }
  catch (err)
  {
    console.error("Error updating room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to update room." });
  }
});

router.post("/:id/join", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();
    const privateCode = normalizePrivateCode(req.body?.privateCode);
    const requestedRole = req.body?.role === "spectator" ? "spectator" : "player";

    const room = await RoomModel.findById(req.params.id).exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const maxPlayers = Number(room.settings?.maxPlayers ?? 4);

    const existingMember = room.members?.find(
      (m) => m.userID.toString() === userId
    );

    if (existingMember)
    {
      room.status = normalizeRoomStatus(room);
      await room.save();

      const io = req.app.get("io");
      io.emit("rooms:changed");

      return res.status(200).json({ ok: true, room, alreadyMember: true, role: existingMember.role });
    }

    if (room.visibility === "private")
    {
      if (!room.privateCode)
      {
        room.privateCode = await generateUniquePrivateCode();
        await room.save();
      }

      if (privateCode.length !== 6)
      {
        return res.status(400).json({ ok: false, error: "Private room code is required." });
      }

      if (privateCode !== room.privateCode)
      {
        return res.status(403).json({ ok: false, error: "Private room code is incorrect." });
      }
    }

    if (requestedRole === "spectator")
    {
      const activeLiveGame = await LiveGameModel.findOne({ roomId: room._id, status: "active" })
        .select("_id spectators")
        .lean()
        .exec();

      if (!activeLiveGame?._id)
      {
        return res.status(400).json({ ok: false, error: "There is no active game to spectate right now." });
      }

      if (Array.isArray(activeLiveGame.spectators) && activeLiveGame.spectators.length >= 4)
      {
        return res.status(400).json({ ok: false, error: "This game already has the maximum number of spectators." });
      }

      room.members.push({
        userID: req.user._id,
        role: "spectator",
        joinedAt: new Date(),
      });

      room.status = normalizeRoomStatus(room);
      await room.save();

      const io = req.app.get("io");
      io.emit("rooms:changed");

      return res.status(200).json({ ok: true, room, role: "spectator" });
    }

    if (getPlayerMemberCount(room) >= maxPlayers)
    {
      return res.status(400).json({ ok: false, error: "Room is full." });
    }

    room.members.push({
      userID: req.user._id,
      role: "player",
      joinedAt: new Date(),
    });

    room.status = normalizeRoomStatus(room);
    await room.save();

    const io = req.app.get("io");
    io.emit("rooms:changed");

    return res.status(200).json({ ok: true, room, role: "player" });
  }
  catch (err)
  {
    console.error("Error joining room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to join room." });
  }
});

router.post("/:id/leave", requireAuth, async (req, res) =>
{
  try
  {
    const userId = req.user._id.toString();

    const room = await RoomModel.findById(req.params.id).exec();

    if (!room)
    {
      return res.status(404).json({ ok: false, error: "Room not found." });
    }

    const memberIndex = room.members.findIndex(
      (m) => m.userID.toString() === userId
    );

    if (memberIndex === -1)
    {
      return res.status(200).json({ ok: true, room, alreadyLeft: true });
    }

    const leavingMember = room.members[memberIndex];
    const io = req.app.get("io");
    const activeLiveGame = await LiveGameModel.findOne({ roomId: room._id, status: "active" }).exec();
    const wasHost = String(room.hostID) === userId || leavingMember.role === "host";

    room.members.splice(memberIndex, 1);

    if (room.members.length === 0)
    {
      const deletedGames = await deleteRoomArtifacts(room._id);

      if (io)
      {
        io.emit("rooms:changed");
        io.to(`room:${room._id}`).emit("room:deleted", { roomId: String(room._id) });

        for (const game of deletedGames)
        {
          io.to(`live-game:${game._id}`).emit("game:ended", {
            gameId: String(game._id),
            roomId: String(room._id),
          });
        }
      }

      return res.status(200).json({ ok: true, deleted: true, roomId: String(room._id) });
    }

    if (wasHost)
    {
      const nextHost = getNextHostCandidate(room, activeLiveGame, userId);

      if (!nextHost)
      {
        return res.status(500).json({ ok: false, error: "Failed to assign a new host." });
      }

      room.hostID = nextHost.userId;
      room.hostName = await resolveUsername(nextHost.userId, nextHost.username || room.hostName);
      applyHostToRoomMembers(room, nextHost.userId);
    }

    room.status = normalizeRoomStatus(room);
    await room.save();

    if (io)
    {
      if (wasHost)
      {
        emitHostTransferred(io, room, activeLiveGame);
      }
      else
      {
        io.emit("rooms:changed");
      }
    }

    return res.status(200).json({ ok: true, room, hostTransferred: wasHost });
  }
  catch (err)
  {
    console.error("Error leaving room:", err);
    return res.status(500).json({ ok: false, error: err.message || "Failed to leave room." });
  }
});

module.exports = router;