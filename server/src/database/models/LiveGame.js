const mongoose = require("mongoose");

const GameSettingsSchema = new mongoose.Schema(
{
  format:
  {
    type: String,
    enum: [
      "commander",
      "standard",
      "modern",
      "legacy",
      "pauper",
      "vintage",
      "pioneer",
    ],
    required: true,
  },

  trackEnergy: { type: Boolean, default: false },
  trackMonarch: { type: Boolean, default: true },
  trackInitiative: { type: Boolean, default: true },
  trackExperience: { type: Boolean, default: false },
  enableDayNight: { type: Boolean, default: false },
},
{ _id: false }
);

const CommanderCardSchema = new mongoose.Schema(
{
  name:
  {
    type: String,
    trim: true,
    default: "",
  },
},
{ _id: false }
);

const GameStatsSchema = new mongoose.Schema(
{
  commanderDamage: { type: Map, of: Number, default: {} },
  commanderCastCount: { type: Number, default: 0 },

  life: { type: Number, default: 40 },
  poison: { type: Number, default: 0 },
  energy: { type: Number, default: 0 },
  experience: { type: Number, default: 0 },
},
{ _id: false }
);

const GameSeatSchema = new mongoose.Schema(
{
  seatNumber:
  {
    type: Number,
    required: true,
    min: 1,
    max: 4,
  },

  userId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  username:
  {
    type: String,
    required: true,
    trim: true,
  },

  joinedAt:
  {
    type: Date,
    default: Date.now,
  },

  connectionStatus:
  {
    type: String,
    enum: ["connected", "reconnecting", "away"],
    default: "connected",
    required: true,
  },

  isReady:
  {
    type: Boolean,
    default: false,
  },

  isAway:
  {
    type: Boolean,
    default: false,
  },

  deck:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Deck",
    default: null,
  },

  commanders:
  {
    type: [CommanderCardSchema],
    default: [],
    validate:
    {
      validator: function(commanders)
      {
        if (!Array.isArray(commanders)) return false;
        if (commanders.length > 2) return false;

        const names = commanders
          .map((entry) => entry?.name?.trim().toLowerCase())
          .filter(Boolean);

        return new Set(names).size === names.length;
      },
      message: "Commanders must be unique and limited to 2.",
    },
  },

  stats:
  {
    type: GameStatsSchema,
    default: () => ({})
  },

  lastSeenAt:
  {
    type: Date,
    default: Date.now,
  },

  lastActiveAt:
  {
    type: Date,
    default: Date.now,
  },

  disconnectDeadlineAt:
  {
    type: Date,
    default: null,
  },

  awaySinceAt:
  {
    type: Date,
    default: null,
  },
},
{ _id: false }
);


const GameSpectatorSchema = new mongoose.Schema(
{
  userId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  username:
  {
    type: String,
    required: true,
    trim: true,
  },

  joinedAt:
  {
    type: Date,
    default: Date.now,
  },

  connectionStatus:
  {
    type: String,
    enum: ["connected", "reconnecting", "away"],
    default: "connected",
    required: true,
  },

  lastSeenAt:
  {
    type: Date,
    default: Date.now,
  },

  lastActiveAt:
  {
    type: Date,
    default: Date.now,
  },

  disconnectDeadlineAt:
  {
    type: Date,
    default: null,
  },

  awaySinceAt:
  {
    type: Date,
    default: null,
  },
},
{ _id: false }
);

const LiveGameSchema = new mongoose.Schema(
{
  roomId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
    index: true,
  },

  status:
  {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
    index: true,
  },

  settings:
  {
    type: GameSettingsSchema,
    default: () => ({})
  },

  boardOrder:
  {
    type: [Number],
    default: () => [1, 2, 3, 4],
    validate:
    {
      validator: function(boardOrder)
      {
        if (!Array.isArray(boardOrder)) return false;
        if (boardOrder.length !== 4) return false;

        const values = boardOrder.map((value) => Number(value));
        const valid = values.every((value) => Number.isInteger(value) && value >= 1 && value <= 4);

        return valid && new Set(values).size === 4;
      },
      message: "boardOrder must contain each seat number from 1 to 4 exactly once.",
    },
  },

  seats:
  {
    type: [GameSeatSchema],
    default: [],
    validate:
    {
      validator: function(seats)
      {
        if (seats.length > 4) return false;

        const seatNumbers = seats.map((seat) => seat.seatNumber);
        return new Set(seatNumbers).size === seats.length;
      },
      message: "Seats must be unique and cannot exceed 4 players.",
    },
  },

  spectators:
  {
    type: [GameSpectatorSchema],
    default: [],
    validate:
    {
      validator: function(spectators)
      {
        if (spectators.length > 4) return false;

        const userIds = spectators.map((spectator) => String(spectator.userId || ""));
        return new Set(userIds.filter(Boolean)).size === spectators.length;
      },
      message: "Spectators must be unique and cannot exceed 4 watchers.",
    },
  },

  monarchSeatNumber:
  {
    type: Number,
    min: 1,
    max: 4,
    default: null,
  },

  initiativeSeatNumber:
  {
    type: Number,
    min: 1,
    max: 4,
    default: null,
  },

  dayNightState:
  {
    type: String,
    enum: ["day", "night"],
    default: null,
  },

  activeTurnSeatNumber:
  {
    type: Number,
    min: 1,
    max: 4,
    default: null,
  },

  gameStartedAt:
  {
    type: Date,
    default: null,
  },

  turnStartedAt:
  {
    type: Date,
    default: null,
  },
},
{ timestamps: true }
);

module.exports = mongoose.model("LiveGame", LiveGameSchema);
