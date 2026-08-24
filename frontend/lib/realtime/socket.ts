// ============================================================
// Real-time service abstraction
// Connects to the backend Socket.IO / WebSocket gateway.
// ============================================================

import { io, Socket } from 'socket.io-client';
import { getAccessToken, clearApiCache } from '@/lib/api/client';
import { SOCKET_EVENTS, type SocketEventName } from './events';

type EventHandler<T = unknown> = (payload: T) => void;

class RealtimeService {
  private socket: Socket | null = null;
  private listeners = new Map<string, Set<EventHandler>>();
  private url: string = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';
  connected = false;

  configure(url: string) {
    this.url = url;
  }

  connect() {
    if (this.socket && this.socket.connected) return;
    try {
      const token = getAccessToken();
      this.socket = io(this.url, {
        auth: { token },
        query: { token },
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.emitLocal('__connected', null);
      });

      this.socket.on('disconnect', () => {
        this.connected = false;
        this.emitLocal('__disconnected', null);
      });

      // Register all domain events
      Object.values(SOCKET_EVENTS).forEach((eventName) => {
        this.socket?.on(eventName, (data) => {
          clearApiCache();
          this.emitLocal(eventName, data);
        });
      });
    } catch (e) {
      console.error('Socket.IO connection error:', e);
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
  }

  emit(event: string, ...args: unknown[]) {
    this.socket?.emit(event, ...args);
  }

  on<T = unknown>(event: SocketEventName | '__connected' | '__disconnected', handler: EventHandler<T>) {
    const set = this.listeners.get(event as string) || new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.listeners.set(event as string, set);
    return () => this.off(event as string, handler);
  }

  off<T = unknown>(event: string, handler: EventHandler<T>) {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }

  private emitLocal(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error('Handler error:', err);
      }
    });
  }
}

export const realtime = new RealtimeService();
export { SOCKET_EVENTS };
