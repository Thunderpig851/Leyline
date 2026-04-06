import { io } from 'socket.io-client';

const configuredApiBase = import.meta.env.VITE_API_URL?.trim();
const socketUrl = configuredApiBase ? configuredApiBase.replace(/\/$/, '') : undefined;

export const socket = io(socketUrl,
{
  transports: ['websocket'],
  withCredentials: true,
});
