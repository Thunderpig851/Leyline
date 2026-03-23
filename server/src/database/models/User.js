const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
{
    username: 
    { 
        type: String, required: true, unique: true, trim: true, lowercase: true

    },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
});

const UserModel = mongoose.model('User', UserSchema);

module.exports = { UserModel };