// ============================================================
// Real-time service abstraction
// Antigravity will connect these events to the NestJS backend
// Socket.IO / WebSocket gateway. The frontend only subscribes
// to the event names defined in events.ts.
// ============================================================

import { getAccessToken } from '@/lib/api/client';
import { SOCKET_EVENTS, type SocketEventName } from './events';

type EventHandler<T = unknown> = (payload: T) => void;

interface SocketLike {
  connected: boolean;
  connect(): void;
  disconnect(): void;
  emit(event: string, ...args: unknown[]): void;
  on<T = unknown>(event: string, handler: EventHandler<T>): void;
  off<T = unknown>(event: string, handler: EventHandler<T>): void;
}

class RealtimeService implements SocketLike {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<EventHandler>>();
  private url: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  connected = false;

  configure(url: string) {
    this.url = url;
  }

  connect() {
    if (!this.url) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      const wsUrl = appendToken(this.url, getAccessToken());
      this.socket = new WebSocket(wsUrl);
      this.socket.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emitLocal('__connected', null);
      };
      this.socket.onclose = () => {
        this.connected = false;
        this.emitLocal('__disconnected', null);
        this.scheduleReconnect();
      };
      this.socket.onerror = () => {
        this.connected = false;
      };
      this.socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.event) this.emitLocal(msg.event, msg.payload);
        } catch {
          /* ignore malformed frames */
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  emit(event: string, ...args: unknown[]) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, args }));
    }
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
      } catch {
        /* handler errors must not break the socket */
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.url) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

function appendToken(url: string, token: string | null): string {
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export const realtime = new RealtimeService();
export { SOCKET_EVENTS };
