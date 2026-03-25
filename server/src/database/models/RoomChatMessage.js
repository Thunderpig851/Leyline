const mongoose = require("mongoose");

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

  body:
  {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500,
  },
},
{
  timestamps: true,
}
);

RoomChatMessageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model("RoomChatMessage", RoomChatMessageSchema);