import { apiRequest, clearStoredAuth, setStoredTokens, getStoredUser, getStoredToken } from './api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'ORGANIZATION_OWNER' | 'STUDENT' | 'ACCOUNTANT' | 'STAFF';
  organizationId: string;
  hostelName?: string;
  organizationName?: string;
  studentId?: string;
  customerCode?: string;
  roomNumber?: string;
  bedCode?: string;
}

export const authService = {
  async login(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = res.data;
    const token = data.accessToken || data.token;
    const user = data.user || data;

    await setStoredTokens(token, data.refreshToken, user);
    return { user, token };
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const token = await getStoredToken();
      if (!token) return null;

      const cached = await getStoredUser();
      if (cached?.role === 'STUDENT') {
        const studentProfile = await apiRequest('/student/profile');
        if (studentProfile?.data) {
          const updated = { ...cached, ...studentProfile.data };
          await setStoredTokens(token, undefined, updated);
          return updated;
        }
      }
      return cached;
    } catch {
      return await getStoredUser();
    }
  },

  async logout(): Promise<void> {
    await clearStoredAuth();
  },

  async getStudentStatus(identifier: string) {
    return await apiRequest('/auth/student-status', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim() }),
    });
  },

  async verifyActivationOtp(identifier: string, otp: string) {
    return await apiRequest('/auth/verify-activation-otp', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim(), otp: otp.trim() }),
    });
  },

  async resendActivationOtp(identifier: string) {
    return await apiRequest('/auth/resend-activation-otp', {
      method: 'POST',
      body: JSON.stringify({ identifier: identifier.trim() }),
    });
  },

  async activateStudentAccount(activationToken: string, newPassword: string, confirmPassword?: string) {
    const res = await apiRequest('/auth/activate-student-account', {
      method: 'POST',
      body: JSON.stringify({ activationToken, newPassword, confirmPassword }),
    });

    const data = res.data;
    if (data?.token && data?.user) {
      await setStoredTokens(data.token, data.refreshToken, data.user);
    }
    return res;
  },
};
