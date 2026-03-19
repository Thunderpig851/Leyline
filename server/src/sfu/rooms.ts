import type { PeerState, RoomId, RoomState } from "./types";
import { createRouter } from "./mediasoup";

const rooms = new Map<RoomId, RoomState>();

export async function getOrCreateRoom(roomId: RoomId): Promise<RoomState>
{
    let existing = rooms.get(roomId);
    if (existing) return existing;

    const router = await createRouter();
    const room: RoomState = { id: roomId, router, peers: new Map() };
    rooms.set(roomId, room);
    return room;
}

export function getRoom(roomId: RoomId): RoomState | undefined
{
    return rooms.get(roomId);
}

export function getPeer(room: RoomState, peerId: string): PeerState | undefined
{
    return room.peers.get(peerId);
}

export function getOrCreatePeer(room: RoomState, peerId: string, socketId: string): PeerState
{
    let existing = room.peers.get(peerId);
    if (existing) return existing;

    const peer: PeerState = { id: peerId, socketId, roomId: room.id, transports: new Map(), producers: new Map(), consumers: new Map() };
    room.peers.set(peerId, peer);
    return peer;
}

export function deletePeer(room: RoomState, peerId: string): void
{
    room.peers.delete(peerId);
}

export function deleteRoom(roomId: RoomId): void
{
    rooms.delete(roomId);
}   
