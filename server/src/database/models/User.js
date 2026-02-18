const mongoose = require('mongoose');
const bcypt = require('bcrypt');

mongoose.connect(process.env.MONGO_URI,)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

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


// To be expanded
const SettingsSchema = new mongoose.Schema(
{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

});



const UserModel = mongoose.model('User', UserSchema);
const SettingsModel = mongoose.model('Settings', SettingsSchema);

module.exports = { UserModel, SettingsModel };