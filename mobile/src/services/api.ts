import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// In development, Android emulator uses 10.0.2.2, iOS simulator uses localhost, physical devices use machine IP or custom host.
export const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:5000/api',
  ios: 'http://localhost:5000/api',
  default: 'http://localhost:5000/api',
});

export const SOCKET_URL = Platform.select({
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
});

const TOKEN_KEY = '@ihms_access_token';
const REFRESH_TOKEN_KEY = '@ihms_refresh_token';
const USER_KEY = '@ihms_user_profile';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredTokens(accessToken: string, refreshToken?: string, user?: any): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error('Failed to store tokens in AsyncStorage:', err);
  }
}

export async function getStoredUser(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearStoredAuth(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
  } catch (err) {
    console.error('Failed to clear auth storage:', err);
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data: T; message?: string }> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // If not JSON
  }

  if (!res.ok) {
    const errorMsg = json?.message || `Request failed with status ${res.status}`;
    const error: any = new Error(errorMsg);
    error.status = res.status;
    error.data = json;
    throw error;
  }

  return json || { success: true, data: text as any };
}
