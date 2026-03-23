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
  trackMonarch: { type: Boolean, default: false },
  trackInitiative: { type: Boolean, default: false },
  trackExperience: { type: Boolean, default: false },
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

  isConnected:
  {
    type: Boolean,
    default: true,
  },

  isReady:
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

  stats:
  {
    type: GameStatsSchema,
    default: () => ({})
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
    enum: ["setup", "active"],
    default: "setup",
    index: true,
  },

  settings:
  {
    type: GameSettingsSchema,
    default: () => ({})
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
        return new Set(seatNumbers).size === seatNumbers.length;
      },
      message: "Seats must be unique and cannot exceed 4 players.",
    },
  },

  version:
  {
    type: Number,
    default: 0,
  },
},
{ timestamps: true }
);

module.exports = mongoose.model("LiveGame", LiveGameSchema);