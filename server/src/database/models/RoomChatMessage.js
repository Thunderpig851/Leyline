const mongoose = require("mongoose");

const RoomChatActionSchema = new mongoose.Schema(
{
  type:
  {
    type: String,
    enum: ["dice-roll", "coin-flip"],
    required: true,
  },

  diceSides:
  {
    type: Number,
    default: null,
  },

  resultNumber:
  {
    type: Number,
    default: null,
  },

  resultLabel:
  {
    type: String,
    trim: true,
    maxlength: 50,
    default: null,
  },
},
{ _id: false }
);

const RoomChatMessageSchema = new mongoose.Schema(
{
  roomId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
    index: true,
  },

  authorUserId:
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  authorUsername:
  {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },

  kind:
  {
    type: String,
    enum: ["message", "game-action"],
    default: "message",
    required: true,
  },

  body:
  {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500,
  },

  action:
  {
    type: RoomChatActionSchema,
    default: null,
  },
},
{
  timestamps: true,
}
);

RoomChatMessageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model("RoomChatMessage", RoomChatMessageSchema);