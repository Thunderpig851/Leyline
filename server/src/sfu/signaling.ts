import { Server, Socket } from "socket.io";
import { getOrCreateRoom } from "./rooms";
import type { types as MsTypes } from "mediasoup";

const peerTransports = new Map<string, Map<string, MsTypes.WebRtcTransport>>();

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

        socket.on("sfu:createTransport", async (payload: {roomId: string}, cb) =>
        {
            try
            {
                const { roomId } = payload;
                const room = await getOrCreateRoom(roomId);

                const transport = await room.router.createWebRtcTransport(
                    {
                        listenInfos:
                        [
                            {
                                protocol: "udp",
                                ip: "0.0.0.0",
                                announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
                            },
                            {
                                protocol: "tcp",
                                ip: "0.0.0.0",
                                announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
                            }
                        ],
                        enableUdp: true,
                        enableTcp: true,    
                        preferUdp: true,
                    });

                const peerTransportMap = getPeerTransportMap(socket.id);
                peerTransportMap.set(transport.id, transport);

                transport.on("dtlsstatechange", (state) =>
                {
                    if (state === "closed") transport.close();
                });

                transport.on("@close", () =>
                {
                    peerTransportMap.delete(transport.id);
                });

                cb(
                    {
                        ok: true,
                        transportOptions:
                        {
                            id: transport.id,
                            iceParameters: transport.iceParameters,
                            iceCandidates: transport.iceCandidates,
                            dtlsParameters: transport.dtlsParameters,
                        }
                    }
                )
            }
            catch(err: any)
            {
                console.error("sfu:createTransport error.", err);
                cb({ ok: false, error: err?.message || "Failed to create transport." });
            }
        })

        socket.on("sfu:connectTransport", async (payload: { transportId: string, dtlsParameters: any }, cb) =>
        {
            try
            {
                const peerTransportMap = peerTransports.get(socket.id);
                const transport = peerTransportMap?.get(payload.transportId);
                if (!transport) return cb({ ok: false, error: "Transport not found." });

                await transport.connect({ dtlsParameters: payload.dtlsParameters });
                cb({ ok: true });
            }
            catch(err: any)
            {
                console.error("sfu:connectTransport error.", err);
                cb({ ok: false, error: err?.message || "Failed to connect transport." });
            }
        });

        socket.on("disconnect", () =>
        {
            const peerTransportMap = peerTransports.get(socket.id);
            if (peerTransportMap)
            {
                for (const transport of peerTransportMap.values())
                {
                    transport.close();
                }
                peerTransports.delete(socket.id);
            }
        });
    });
}

function getPeerTransportMap(socketId: string): Map<string, MsTypes.WebRtcTransport>
{
  let m = peerTransports.get(socketId);
  if (!m)
  {
    m = new Map<string, MsTypes.WebRtcTransport>();
    peerTransports.set(socketId, m);
  }
  return m;
}