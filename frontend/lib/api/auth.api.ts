import { api } from './client';
import type { AuthResponse, AuthUser, TermsContent } from '@/lib/types';

export interface RegisterOwnerPayload {
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  ownerPassword: string;
  hostelName: string;
  orgName?: string;
  branchName?: string;
  hostelType?: 'BOYS' | 'GIRLS' | 'CO_ED';
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface RegisterOwnerResponse {
  success: boolean;
  ownerId: string;
  organizationId: string;
  orgCode: string;
  hostelBranchId: string;
  hostelCode: string;
  hostelName: string;
  ownerName: string;
  email: string;
  message: string;
  accessToken?: string;
  user?: AuthUser;
}

export interface ExistingHostelAccount {
  accountAlreadyExists: boolean;
  organizationName: string;
  organizationId: string;
  ownerId: string;
  branchName: string;
  location: string;
  maskedEmail: string;
  email: string;
  status: string;
}

export interface SystemSetupStatus {
  isSetupCompleted: boolean;
  hasOrganizations: boolean;
  organizationCount: number;
  userCount: number;
}

export const authApi = {
  getSetupStatus: () =>
    api.get<SystemSetupStatus>('/auth/setup-status'),

  register: (payload: RegisterOwnerPayload) =>
    api.post<RegisterOwnerResponse>('/auth/register', payload),

  checkExistingHostel: (email: string) =>
    api.get<{ success: boolean; data: ExistingHostelAccount | null; exists: boolean }>(`/auth/check-existing-hostel?email=${encodeURIComponent(email)}`),

  login: (identifier: string, password: string, loginType?: 'STUDENT' | 'ADMIN') =>
    api.post<AuthResponse>('/auth/login', { identifier, email: identifier, password, loginType }),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<AuthUser>('/auth/me'),

  getTerms: (role?: string) =>
    api.get<TermsContent>(`/terms${role ? `?role=${encodeURIComponent(role)}` : ''}`),

  acceptTerms: (version: string) =>
    api.post<{ success: boolean; message: string; user: AuthUser; acceptedVersion: string }>('/auth/terms/accept', { version }),

  refreshToken: (refreshToken: string) =>
    api.post<AuthResponse>('/auth/refresh', { refreshToken }),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ success: boolean; message: string; tokens?: AuthResponse }>('/auth/change-password', { currentPassword, newPassword }),

  forgotPassword: (identifier: string, newPassword?: string) =>
    api.post<{ success: boolean; message: string }>('/auth/forgot-password', { identifier, newPassword }),

  requestPasswordResetOtp: (identifier: string) =>
    api.post<{ success: boolean; message: string }>('/auth/forgot-password/request-otp', { identifier }),

  resendPasswordResetOtp: (identifier: string) =>
    api.post<{ success: boolean; message: string }>('/auth/resend-otp', { identifier }),

  verifyPasswordResetOtp: (identifier: string, otp: string) =>
    api.post<{ success: boolean; resetToken: string; message: string }>('/auth/verify-otp', { identifier, otp }),

  resetPasswordWithToken: (resetToken: string, newPassword: string, confirmPassword?: string) =>
    api.post<{ success: boolean; message: string }>('/auth/reset-password', { resetToken, newPassword, confirmPassword }),

  getStudentStatus: (identifier: string) =>
    api.post<{ success: boolean; requiresActivation: boolean; requiresPassword: boolean; status: string; fullName?: string; email?: string; message?: string }>('/auth/student-status', { identifier }),

  sendStudentOtp: (identifier: string) =>
    api.post<{
      success: boolean;
      status?: string;
      alreadyActivated?: boolean;
      requiresPassword?: boolean;
      requiresOtp?: boolean;
      maskedEmail?: string;
      email?: string;
      studentId?: string;
      fullName?: string;
      message: string;
      startTime?: string | number;
      cooldownSeconds?: number;
      expiresIn?: number;
      otpSession?: {
        startTime: string | number;
        cooldownSeconds: number;
        expiresInSeconds: number;
      };
      _debugOtp?: string;
    }>('/auth/student/send-otp', { identifier }),

  verifyActivationOtp: (identifier: string, otp: string) =>
    api.post<{ success: boolean; activationToken: string; message: string }>('/auth/verify-activation-otp', { identifier, otp }),

  resendActivationOtp: (identifier: string) =>
    api.post<{
      success: boolean;
      maskedEmail?: string;
      message: string;
      startTime?: string | number;
      cooldownSeconds?: number;
      expiresIn?: number;
      otpSession?: {
        startTime: string | number;
        cooldownSeconds: number;
        expiresInSeconds: number;
      };
      _debugOtp?: string;
    }>('/auth/resend-activation-otp', { identifier }),

  activateStudentAccount: (activationToken: string, newPassword: string, confirmPassword?: string) =>
    api.post<AuthResponse>('/auth/activate-student-account', { activationToken, newPassword, confirmPassword }),
};
