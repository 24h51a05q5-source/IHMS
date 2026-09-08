import { api } from './client';

export interface ActionConfirmationProposal {
  token: string;
  actionType: string;
  description: string;
  actionDetails: Record<string, any>;
  expiresAt: string;
}

export interface AiAssistantResponse {
  success: boolean;
  message: string;
  category: string;
  accessLevel: 'LEVEL_1_READ' | 'LEVEL_2_ACTION' | 'LEVEL_3_RESTRICTED';
  data?: any;
  confirmationRequired?: boolean;
  confirmationProposal?: ActionConfirmationProposal;
  suggestedFollowUps?: string[];
  denialReason?: string;
}

export interface OwnerAiPreference {
  id: string;
  organizationId: string;
  ownerId: string;
  key: string;
  value: string;
  category: 'TERMINOLOGY' | 'REPORT_FORMAT' | 'DASHBOARD_PREF' | 'WORKFLOW';
  createdAt?: string;
  updatedAt?: string;
}

export const aiAssistantApi = {
  chat: (message: string) =>
    api.post<AiAssistantResponse>('/ai-assistant/chat', { message }),

  confirmAction: (token: string, confirm: boolean = true) =>
    api.post<AiAssistantResponse>('/ai-assistant/confirm-action', { token, confirm }),

  getPreferences: () =>
    api.get<{ success: boolean; preferences: OwnerAiPreference[] }>('/ai-assistant/preferences'),

  savePreference: (key: string, value: string, category: string = 'TERMINOLOGY') =>
    api.post<{ success: boolean; preference: OwnerAiPreference }>('/ai-assistant/preferences', { key, value, category }),

  deletePreference: (id: string) =>
    api.delete<{ success: boolean; message: string }>(`/ai-assistant/preferences/${id}`),

  resetPreferences: () =>
    api.post<{ success: boolean; message: string; clearedCount: number }>('/ai-assistant/preferences/reset', {}),

  getCapabilities: () =>
    api.get<any>('/ai-assistant/capabilities'),
};
