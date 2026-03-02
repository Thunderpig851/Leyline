import type { types as MsTypes } from "mediasoup";

export type RoomId = string;
export type PeerId = string;

export type RoomState =
{
  id: RoomId;
  router: MsTypes.Router;
};

export type PeerState =
{
  id: PeerId;
  roomId: RoomId;
};