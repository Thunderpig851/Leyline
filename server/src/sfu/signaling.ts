import { Server, Socket } from "socket.io";
import { getOrCreateRoom } from "./rooms";

export function registerSFUSignaling(io: Server) : void
{
    io.on("connnection", (socket: Socket) =>
    {
        socket.on("sfu:join", async (payload: { roomId: string, PeerId: string, }, cb) => 
        {
            try
            {
                const { roomId } = payload;

                const room = await getOrCreateRoom(roomId);

                socket.data.roomId = roomId;
                socket.data.peerId = payload.PeerId;

                socket.join(roomId);

                cb(
                    {
                        ok: true,
                        rtpCapabilities: room.router.rtpCapabilities
                    }

                )
            }
            catch(err: any)
            {
                console.error("sfu:joun error.", err);
                cb({ ok: false, error: err.message });
            }
        });

        // socket.on("disconnect", () => 
        // {

        // });
    })
}