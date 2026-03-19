import type { types as MsTypes } from "mediasoup";

export type RoomId = string;
export type PeerId = string;

export type RoomState =
{
  id: RoomId;
  router: MsTypes.Router;
  peers: Map<PeerId, PeerState>;
};

export type PeerState =
{
  id: PeerId;
  socketId: string;
  roomId: RoomId;

  transports: Map<string, MsTypes.Transport>;
  producers: Map<string, MsTypes.Producer>;
  consumers: Map<string, MsTypes.Consumer>;
};

export type TransportMeta = 
{
  id: string;
  peerId: PeerId;
  roomId: RoomId;
  direction: "send" | "recv";
}