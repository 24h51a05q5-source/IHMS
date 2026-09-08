import crypto from 'crypto';
import { query, queryOne, queryRows } from '../../config/database';
import { AppError } from '../../common/filters/http-exception.filter';
import { OwnerAiPreference, PreferenceCategory } from './ai-assistant.types';

export class AiAssistantLearningService {
  /**
   * Strict privacy filter pattern checking to prevent any credentials,
   * OTPs, bank/UPI details, tokens, or API keys from being learned/stored.
   */
  private readonly SENSITIVE_PATTERNS: RegExp[] = [
    // Passwords & Passcodes
    /(?:password|passwd|pwd|passcode|secret_key|private_key)\s*[:=]\s*\S+/i,
    /\b(?:mypassword|password\s+is|pass\s+is)\b/i,
    // OTPs & PINs
    /\b(?:otp|pin|verification\s+code|2fa|mfa)\b.{0,10}\b\d{4,8}\b/i,
    /\b\d{4,8}\b.{0,10}\b(?:is\s+my\s+otp|otp|verification\s+pin)\b/i,
    // UPI VPAs (e.g. user@okaxis, hostel@icici, 9876543210@paytm)
    /\b[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}\b/,
    // Bank details (Account numbers & IFSC)
    /\b[A-Z]{4}0[A-Z0-9]{6}\b/, // IFSC code format
    /\b(?:account\s*number|acc\s*no|acct\s*no|bank\s*acc)\b.{0,15}\b\d{9,18}\b/i,
    // Card numbers (13-19 digits)
    /\b(?:\d[ -]*?){13,19}\b/,
    // Tokens & API keys
    /\b(?:bearer\s+[a-zA-Z0-9._\-]+|ey[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,})\b/i,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b/i,
  ];

  /**
   * Verify if candidate content contains any sensitive data.
   */
  isSensitiveContent(content: string): boolean {
    if (!content || typeof content !== 'string') return false;
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Learn or update an owner preference (with strict privacy sanitization).
   */
  async savePreference(
    orgId: string,
    ownerId: string,
    key: string,
    value: string,
    category: PreferenceCategory = 'TERMINOLOGY'
  ): Promise<OwnerAiPreference> {
    const trimmedKey = String(key || '').trim().toLowerCase();
    const trimmedValue = String(value || '').trim();

    if (!trimmedKey || !trimmedValue) {
      throw new AppError('Preference key and value are required.', 400);
    }

    // Security check: NEVER learn sensitive information
    if (this.isSensitiveContent(trimmedKey) || this.isSensitiveContent(trimmedValue)) {
      throw new AppError(
        'Security Policy Violation: The AI Assistant is prohibited from learning or storing sensitive information (passwords, OTPs, UPI IDs, bank accounts, tokens, or API keys).',
        400
      );
    }

    const existing = await queryOne<any>(
      `SELECT id FROM owner_ai_preferences
       WHERE organization_id = $1 AND owner_id = $2 AND LOWER(pref_key) = $3
       LIMIT 1`,
      [orgId, ownerId, trimmedKey]
    );

    if (existing) {
      const updated = await queryOne<any>(
        `UPDATE owner_ai_preferences
         SET pref_value = $1, category = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, organization_id as "organizationId", owner_id as "ownerId",
                   pref_key as "key", pref_value as "value", category,
                   created_at as "createdAt", updated_at as "updatedAt"`,
        [trimmedValue, category, existing.id]
      );
      return updated;
    }

    const prefId = crypto.randomUUID();
    const created = await queryOne<any>(
      `INSERT INTO owner_ai_preferences (
        id, organization_id, owner_id, pref_key, pref_value, category, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, organization_id as "organizationId", owner_id as "ownerId",
                pref_key as "key", pref_value as "value", category,
                created_at as "createdAt", updated_at as "updatedAt"`,
      [prefId, orgId, ownerId, trimmedKey, trimmedValue, category]
    );

    return created;
  }

  /**
   * List all learned preferences for the given owner.
   */
  async listPreferences(orgId: string, ownerId: string): Promise<OwnerAiPreference[]> {
    const rows = await queryRows<any>(
      `SELECT id, organization_id as "organizationId", owner_id as "ownerId",
              pref_key as "key", pref_value as "value", category,
              created_at as "createdAt", updated_at as "updatedAt"
       FROM owner_ai_preferences
       WHERE organization_id = $1 AND owner_id = $2
       ORDER BY category ASC, pref_key ASC`,
      [orgId, ownerId]
    );
    return rows;
  }

  /**
   * Delete a specific preference by ID or key.
   */
  async deletePreference(orgId: string, ownerId: string, idOrKey: string): Promise<boolean> {
    const res = await query(
      `DELETE FROM owner_ai_preferences
       WHERE organization_id = $1 AND owner_id = $2
         AND (id = $3 OR LOWER(pref_key) = LOWER($3))`,
      [orgId, ownerId, idOrKey.trim()]
    );
    return (res as any).rowCount > 0;
  }

  /**
   * Clear all AI memory / learned preferences for an owner.
   */
  async clearAllPreferences(orgId: string, ownerId: string): Promise<{ clearedCount: number }> {
    const res = await query(
      `DELETE FROM owner_ai_preferences
       WHERE organization_id = $1 AND owner_id = $2`,
      [orgId, ownerId]
    );
    return { clearedCount: (res as any).rowCount || 0 };
  }

  /**
   * Apply learned owner terminology to input query before classification.
   * E.g. if owner defined "unpaid students" -> "students with outstanding fees",
   * replace matching phrases so existing tool detectors recognize the intent seamlessly.
   */
  async applyLearnedTerminology(orgId: string, ownerId: string, userPrompt: string): Promise<string> {
    if (!userPrompt) return '';
    try {
      const preferences = await this.listPreferences(orgId, ownerId);
      const terminologyPrefs = preferences.filter((p) => p.category === 'TERMINOLOGY');

      let transformedPrompt = userPrompt;
      for (const pref of terminologyPrefs) {
        if (!pref.key || !pref.value) continue;
        const escapedKey = pref.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKey}\\b`, 'gi');
        transformedPrompt = transformedPrompt.replace(regex, pref.value);
      }
      return transformedPrompt;
    } catch {
      return userPrompt;
    }
  }

  /**
   * Get preferred report format for the owner ('SUMMARY' | 'DETAILED' | 'BULLET_POINTS').
   */
  async getPreferredReportFormat(orgId: string, ownerId: string): Promise<string> {
    try {
      const pref = await queryOne<any>(
        `SELECT pref_value FROM owner_ai_preferences
         WHERE organization_id = $1 AND owner_id = $2
           AND (category = 'REPORT_FORMAT' OR LOWER(pref_key) LIKE '%format%')
         LIMIT 1`,
        [orgId, ownerId]
      );
      return pref?.pref_value?.toUpperCase() || 'SUMMARY';
    } catch {
      return 'SUMMARY';
    }
  }
}

export const aiAssistantLearningService = new AiAssistantLearningService();
