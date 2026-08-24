'use client';

import { useEffect, useRef } from 'react';
import { realtime } from './socket';
import type { SocketEventName } from './events';

type EventHandler<T = unknown> = (payload: T) => void;

export function useRealtimeEvent<T = unknown>(
  event: SocketEventName | '__connected' | '__disconnected',
  handler: EventHandler<T>,
  enabled = true,
) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const wrapped: EventHandler<T> = (p) => ref.current(p);
    const off = realtime.on(event, wrapped);
    return () => {
      off();
    };
  }, [event, enabled]);
}
