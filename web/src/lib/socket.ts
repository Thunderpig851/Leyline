import { io } from 'socket.io-client';

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001';

export const socket = io(API_BASE, 
{
  transports: ['websocket'],
  withCredentials: true,    
});