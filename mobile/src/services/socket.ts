import { io, Socket } from 'socket.io-client';
import { SOCKET_URL, getStoredToken } from './api';

let socketInstance: Socket | null = null;

export async function initMobileSocket(onEvent?: (event: string, data: any) => void): Promise<Socket | null> {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  const token = await getStoredToken();
  if (!token) return null;

  socketInstance = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
  });

  socketInstance.on('connect', () => {
    console.log('[Mobile Socket] Connected to IHMS Real-time Stream');
  });

  socketInstance.on('announcement.created', (data) => {
    onEvent?.('announcement.created', data);
  });

  socketInstance.on('payment.recorded', (data) => {
    onEvent?.('payment.recorded', data);
  });

  socketInstance.on('complaint.updated', (data) => {
    onEvent?.('complaint.updated', data);
  });

  socketInstance.on('notification.created', (data) => {
    onEvent?.('notification.created', data);
  });

  socketInstance.on('dashboard.kpi_updated', (data) => {
    onEvent?.('dashboard.kpi_updated', data);
  });

  socketInstance.on('disconnect', () => {
    console.log('[Mobile Socket] Disconnected');
  });

  return socketInstance;
}

export function disconnectMobileSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
