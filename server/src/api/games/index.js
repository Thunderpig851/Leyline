const requireAuth = require('../../middleware/requireAuth');
const router = require('express').Router();

const LiveGameModel = require('../../database/models/LiveGame');

router.get('/', (req, res) => res.json({ ok: true, route: 'live-games' }));

router.post('/start', requireAuth, async (req, res) =>
{
    
    try
    {
        const { roomId, format} = req.body;
        
        let startingLife = 20;
        if (format === "commander") startingLife = 40;

        const game = await LiveGameModel.create(
        {
            roomId,
            
            settings: 
            {
                format,
                 trackEnergy: false,
                 trackMonarch: false,
                 trackInitiative: false,
                 trackExperience: false,
            },

            seats: 
            [
                {
                    seatNumber: 1,
                    userId: req.user._id,
                    username: req.user.username,
                    joinedAt: new Date(),
                    isConnected: true,
                    isReady: false,
                    deck: null,

                    stats: 
                    {
                        commanderDamage: {},
                        commanderCastCount: 0,

                        life: startingLife,
                        poison: 0,
                        energy: 0,
                        experience: 0,
                    }
                }
            ]
        });

        const io = req.app.get("io");
        io.to(`live-game:${game._id}`).emit("game:started", { gameId: game._id });

        return res.status(201).json({ ok: true, game });
    }
    catch(err)
    {
        console.error("Error starting game:", err);
        return res.status(500).json({ ok: false, error: err.message || "Failed to start game." });
    }
});


module.exports = router;