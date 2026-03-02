import type { RoomId, RoomState } from "./types";
import { createRouter } from "./mediasoup";

const rooms = new Map<RoomId, RoomState>();

export async function getOrCreateRoom(roomId: RoomId): Promise<RoomState>
{
    let existing = rooms.get(roomId);
    if (existing) return existing;

    const router = await createRouter();
    const room: RoomState = { id: roomId, router };
    rooms.set(roomId, room);
    return room;
}