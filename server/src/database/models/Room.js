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
    bracket: {
        type: String,
        enum: ['1', '2', '3', '4', '5'],
        required: true,
    },
    allowSpectators: { type: Boolean, default: false },
},
    { _id: false}
);

const RoomSchema = new mongoose.Schema(
{
    title: { type: String, required: true, maxlength: 50 },
    description: { type: String, maxlength: 500 },
    hostID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hostName: { type: String, required: true },
    
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
    
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},

    members: { type: [RoomMemberSchema], default: [] },
    settings: { type: RoomSettingsSchema, default: () => ({}) },

    lfgPostID: { type: mongoose.Schema.Types.ObjectId, ref: 'LFGPost' },

});

// Room Sorting
RoomSchema.index({ visibility: 1, status: 1, updatedAt: -1 });
RoomSchema.index({ tags: 1 });

module.exports = mongoose.model("Room", RoomSchema);