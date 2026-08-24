const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. API Client
write('frontend/src/lib/api.ts', `
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; message?: string; error?: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('ihms_token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
    ...options.headers,
  };

  const url = endpoint.startsWith('http') ? endpoint : \`\${API_BASE_URL}\${endpoint.startsWith('/') ? endpoint : '/' + endpoint}\`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'API request failed');
    }
    return data;
  } catch (err: any) {
    console.error(\`API Error [\${endpoint}]:\`, err);
    throw err;
  }
}
`);

// 2. Global CSS
write('frontend/src/app/globals.css', `
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-start-rgb: 15, 23, 42;
  --background-end-rgb: 2, 6, 23;
}

body {
  color: rgb(var(--foreground-rgb));
  background: #0b0f19;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh;
}

/* Custom Scrollbars */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #0f172a;
}
::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

@media print {
  body * {
    visibility: hidden;
  }
  .printable-area, .printable-area * {
    visibility: visible;
  }
  .printable-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
`);

// 3. Auth Context
write('frontend/src/context/AuthContext.tsx', `
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../lib/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string;
  branchId?: string;
  customerCode?: string;
  staffCode?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  login: (email: string, pass: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBranchId, setActiveBranchId] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem('ihms_token');
    const savedUser = localStorage.getItem('ihms_user');
    const savedBranch = localStorage.getItem('ihms_active_branch');

    if (savedToken && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsedUser);
        if (savedBranch) {
          setActiveBranchId(savedBranch);
        } else if (parsedUser.branchId) {
          setActiveBranchId(parsedUser.branchId);
        }
      } catch (err) {
        localStorage.removeItem('ihms_token');
        localStorage.removeItem('ihms_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });

    if (res.success && res.data) {
      const { token: jwtToken, user: authUser } = res.data;
      setToken(jwtToken);
      setUser(authUser);
      localStorage.setItem('ihms_token', jwtToken);
      localStorage.setItem('ihms_user', JSON.stringify(authUser));

      if (authUser.branchId) {
        setActiveBranchId(authUser.branchId);
        localStorage.setItem('ihms_active_branch', authUser.branchId);
      }

      router.push('/dashboard');
    }
  };

  const register = async (data: any) => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success && res.data) {
      const { token: jwtToken, user: authUser } = res.data;
      setToken(jwtToken);
      setUser(authUser);
      localStorage.setItem('ihms_token', jwtToken);
      localStorage.setItem('ihms_user', JSON.stringify(authUser));
      router.push('/dashboard');
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('ihms_token');
    localStorage.removeItem('ihms_user');
    localStorage.removeItem('ihms_active_branch');
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        activeBranchId,
        setActiveBranchId: (id) => {
          setActiveBranchId(id);
          localStorage.setItem('ihms_active_branch', id);
        },
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
`);

// 4. Socket Context
write('frontend/src/context/SocketContext.tsx', `
'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface ToastAlert {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  time: string;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  notifications: ToastAlert[];
  clearNotification: (id: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  notifications: [],
  clearNotification: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<ToastAlert[]>([]);

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'alert' = 'info') => {
    const newToast: ToastAlert = {
      id: Date.now().toString() + Math.random(),
      title,
      message,
      type,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setNotifications((prev) => [newToast, ...prev.slice(0, 9)]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== newToast.id));
    }, 6000);
  };

  useEffect(() => {
    if (!token || !user) {
      if (socket) socket.disconnect();
      return;
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      setIsConnected(true);
      console.log('[Socket] Connected to real-time event bus');
    });

    s.on('disconnect', () => {
      setIsConnected(false);
      console.log('[Socket] Disconnected from event bus');
    });

    // Real-time Event Listeners
    s.on('bed.status_changed', (data: any) => {
      addNotification('Bed Status Updated', \`Bed \${data.bedCode} is now \${data.status}\`, 'info');
    });

    s.on('payment.completed', (data: any) => {
      addNotification('Payment Received', \`₹\${data.amount} collected. Receipt: \${data.receiptNumber}\`, 'success');
    });

    s.on('student.admitted', (data: any) => {
      addNotification('Student Admitted', \`\${data.name} admitted with Code \${data.customerCode}\`, 'success');
    });

    s.on('complaint.created', (data: any) => {
      addNotification('New Complaint Ticket', \`[\${data.category}] \${data.title} in Room \${data.roomCode}\`, 'warning');
    });

    s.on('complaint.resolved', (data: any) => {
      addNotification('Complaint Resolved', \`Ticket \${data.complaintNumber} marked resolved\`, 'success');
    });

    s.on('leave.created', (data: any) => {
      addNotification('Leave Application', \`\${data.studentName} applied for leave (\${data.leaveNumber})\`, 'info');
    });

    s.on('leave.status_changed', (data: any) => {
      addNotification('Leave Status Changed', \`Leave \${data.leaveNumber} is \${data.status}\`, data.status === 'APPROVED' ? 'success' : 'alert');
    });

    s.on('visitor.checked_in', (data: any) => {
      addNotification('Visitor Entry', \`\${data.visitorName} visiting \${data.studentName} (\${data.visitorPassNumber})\`, 'info');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [token, user]);

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, notifications, clearNotification }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
`);