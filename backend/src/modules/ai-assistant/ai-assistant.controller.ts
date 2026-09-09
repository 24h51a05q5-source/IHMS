import { Router, Response, Request } from 'express';
import { AppError } from '../../common/filters/http-exception.filter';
import { authenticate } from '../../common/guards/auth.guard';
import { aiAssistantOrchestratorService } from './ai-assistant-orchestrator.service';
import { aiAssistantLearningService } from './ai-assistant-learning.service';
import { AuthenticatedOwnerContext } from './ai-assistant.types';

export const aiAssistantRouter = Router();

// Middleware to enforce Owner / Staff authorization
function requireOwnerOrManagement(req: Request, _res: Response, next: any) {
  const user = req.user;
  if (!user) {
    return next(new AppError('Authentication required.', 401));
  }

  const allowedRoles = [
    'OWNER',
    'ORGANIZATION_OWNER',
    'BRANCH_MANAGER',
    'ADMIN',
    'SUPER_ADMIN',
    'PLATFORM_SUPER_ADMIN',
  ];

  const roleUpper = String(user.role || '').toUpperCase();
  if (!allowedRoles.includes(roleUpper)) {
    return next(
      new AppError(
        'Access Denied: The AI Assistant is exclusively reserved for Hostel Owners and authorized Management staff.',
        403
      )
    );
  }

  next();
}

aiAssistantRouter.use(authenticate, requireOwnerOrManagement);

function getOwnerContext(req: Request): AuthenticatedOwnerContext {
  const u = req.user!;
  return {
    organizationId: u.organizationId || (u as any).orgId,
    hostelId: u.branchId || (u as any).hostelId,
    userId: u.id || (u as any).userId,
    role: u.role,
    name: u.name || 'Owner',
    email: u.email || '',
  };
}

/**
 * POST /ai-assistant/chat
 * Natural language chat endpoint for hostel owner
 */
aiAssistantRouter.post('/chat', async (req: Request, res: Response, next: any) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      throw new AppError('Message string is required.', 400);
    }

    const ctx = getOwnerContext(req);
    const result = await aiAssistantOrchestratorService.processOwnerPrompt(ctx, message);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /ai-assistant/confirm-action
 * Confirm or cancel a proposed Level 2 action
 */
aiAssistantRouter.post('/confirm-action', async (req: Request, res: Response, next: any) => {
  try {
    const { token, confirm } = req.body;
    if (!token) {
      throw new AppError('Confirmation token is required.', 400);
    }

    const ctx = getOwnerContext(req);
    const result = await aiAssistantOrchestratorService.confirmAction(ctx, token, confirm !== false);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /ai-assistant/preferences
 * List all learned preferences for current owner
 */
aiAssistantRouter.get('/preferences', async (req: Request, res: Response, next: any) => {
  try {
    const ctx = getOwnerContext(req);
    const preferences = await aiAssistantLearningService.listPreferences(ctx.organizationId, ctx.userId);
    return res.json({ success: true, preferences });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /ai-assistant/preferences
 * Learn or update a specific preference (subject to strict privacy sanitization)
 */
aiAssistantRouter.post('/preferences', async (req: Request, res: Response, next: any) => {
  try {
    const { key, value, category } = req.body;
    const ctx = getOwnerContext(req);
    const preference = await aiAssistantLearningService.savePreference(
      ctx.organizationId,
      ctx.userId,
      key,
      value,
      category || 'TERMINOLOGY'
    );
    return res.status(201).json({ success: true, preference });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /ai-assistant/preferences/:id
 * Delete a specific learned preference
 */
aiAssistantRouter.delete('/preferences/:id', async (req: Request, res: Response, next: any) => {
  try {
    const ctx = getOwnerContext(req);
    const deleted = await aiAssistantLearningService.deletePreference(
      ctx.organizationId,
      ctx.userId,
      req.params.id
    );
    return res.json({ success: deleted, message: deleted ? 'Preference deleted.' : 'Preference not found.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /ai-assistant/preferences/reset
 * Clear all learned memory / preferences for current owner
 */
aiAssistantRouter.post('/preferences/reset', async (req: Request, res: Response, next: any) => {
  try {
    const ctx = getOwnerContext(req);
    const result = await aiAssistantLearningService.clearAllPreferences(ctx.organizationId, ctx.userId);
    return res.json({ success: true, message: 'All AI memory and learned preferences have been cleared.', ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /ai-assistant/capabilities
 * View permission model and approved tool list
 */
aiAssistantRouter.get('/capabilities', async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    levels: {
      level1_readOnly: [
        'getStudentCount',
        'getOccupancyStats',
        'getVacantBeds',
        'getOccupiedBeds',
        'getOutstandingFees',
        'getPaymentHistory',
        'getComplaintsSummary',
        'getAnnouncements',
        'getDashboardSummary',
      ],
      level2_limitedActionsWithConfirmation: [
        'roomTransfer',
        'createAnnouncement',
        'updateComplaintStatus',
      ],
      level3_strictlyRestricted: [
        'createPaymentReceipt',
        'modifyPaymentRecords',
        'modifyPaymentGatewayCredentials',
        'retrieveOwnerPasswordsOrSecrets',
        'retrieveOTPsOrTokens',
        'retrieveUPIOrBankCredentials',
        'directDatabaseOrRawSqlAccess',
      ],
    },
    privacyPolicy: 'Sensitive credentials (passwords, OTPs, UPI IDs, bank details, API keys) are strictly barred from AI memory and cannot be stored or exposed.',
  });
});
