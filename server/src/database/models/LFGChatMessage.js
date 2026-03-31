const mongoose = require("mongoose");

const LFGChatMessageSchema = new mongoose.Schema(
{
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

LFGChatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("LFGChatMessage", LFGChatMessageSchema);