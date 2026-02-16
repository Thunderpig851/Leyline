mongoose = require('mongoose');

const RoomMemberSchema = new mongoose.Schema(
{
    userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: 
    {
        type: String,
        enum: ['host', 'player', 'spectator'],
        default: 'player',
        required: true
    },
    joinedAt: { type: Date, default: Date.now },
});

const RoomSettingsSchema = new mongoose.Schema(
{
    format: 
    {
        type: String,
        enum: ['standard', 'commander'], //Placeholder
        default: 'commander',
    },
    bracket: {type: Number, min: 1, max: 5},
    description: { type: String, maxlength: 200 },
    allowSpectators: { type: Boolean, default: false },
},
    { _id: false}
);

const RoomSchema = new mongoose.Schema(
{
    code : { type: String, required: true, unique: true },
    title: { type: String, required: true, maxlength: 50 },
    description: { type: String, maxlength: 500 },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },

    visibility: 
    {
        type: String,
        enum: ['public', 'private'],
        default: 'private',
        index: true
    },
    status: 
    {
        type: String,
        enum: ['open', 'closed'],
        default: 'open',
        index: true
    },

    hostUserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},

    maxPlayers: { type: Number, default: 4, min: 2, max: 4 },

    members: { type: [RoomMemberSchema], default: [] },
    settings: { type: RoomSettingsSchema, default: () => ({}) },

    lfgPostID: { type: mongoose.Schema.Types.ObjectId, ref: 'LFGPost' },

}
);

// Room Sorting
RoomSchema.index({ visibility: 1, status: 1, updatedAt: -1 });
RoomSchema.index({ tags: 1 });

module.exports = mongoose.model("Room", RoomSchema);