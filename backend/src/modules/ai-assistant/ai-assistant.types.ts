export type AccessLevel = 'LEVEL_1_READ' | 'LEVEL_2_ACTION' | 'LEVEL_3_RESTRICTED';

export type IHMSCategory =
  | 'STUDENT_MANAGEMENT'
  | 'ROOM_BED_MANAGEMENT'
  | 'FEE_MANAGEMENT'
  | 'PAYMENTS'
  | 'COMPLAINTS'
  | 'ANNOUNCEMENTS'
  | 'REPORTS'
  | 'OWNER_ACCOUNT'
  | 'UNKNOWN';

export type PreferenceCategory = 'TERMINOLOGY' | 'REPORT_FORMAT' | 'DASHBOARD_PREF' | 'WORKFLOW';

export interface OwnerAiPreference {
  id: string;
  organizationId: string;
  ownerId: string;
  key: string;
  value: string;
  category: PreferenceCategory;
  createdAt?: string;
  updatedAt?: string;
}

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
  category: IHMSCategory;
  accessLevel: AccessLevel;
  data?: any;
  confirmationRequired?: boolean;
  confirmationProposal?: ActionConfirmationProposal;
  suggestedFollowUps?: string[];
  denialReason?: string;
}

export interface AuthenticatedOwnerContext {
  organizationId: string;
  hostelId?: string;
  userId: string;
  role: string;
  name: string;
  email: string;
}
