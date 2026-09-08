import { AppError } from '../../common/filters/http-exception.filter';
import {
  AiAssistantResponse,
  AuthenticatedOwnerContext,
  IHMSCategory,
  AccessLevel,
} from './ai-assistant.types';
import { aiAssistantToolsRegistry } from './ai-assistant-tools.registry';
import { aiAssistantLearningService } from './ai-assistant-learning.service';

export class AiAssistantOrchestratorService {
  /**
   * Main entrypoint: process an incoming owner prompt.
   */
  async processOwnerPrompt(
    ctx: AuthenticatedOwnerContext,
    userPrompt: string
  ): Promise<AiAssistantResponse> {
    const rawPrompt = String(userPrompt || '').trim();
    if (!rawPrompt) {
      throw new AppError('Prompt message cannot be empty.', 400);
    }

    // 1. Guardrail against Prompt Injection / Rule Bypass Attempts
    if (this.isPromptInjectionAttempt(rawPrompt)) {
      return {
        success: false,
        message:
          'Security Policy Notice: The IHMS AI Assistant operates under strict permission boundaries. System security rules, access restrictions, and credential protections cannot be bypassed, forgotten, or overridden.',
        category: 'OWNER_ACCOUNT',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'PROMPT_INJECTION_OR_RULE_BYPASS_ATTEMPT',
      };
    }

    // 2. Check for Level 3: Strictly Restricted Operations
    const restrictedCheck = this.checkRestrictedOperations(rawPrompt);
    if (restrictedCheck) {
      return restrictedCheck;
    }

    // 3. Apply Owner-Learned Terminology
    const normalizedPrompt = await aiAssistantLearningService.applyLearnedTerminology(
      ctx.organizationId,
      ctx.userId,
      rawPrompt
    );

    // 4. Intent Classification & Routing
    return this.routeAndExecute(ctx, normalizedPrompt, rawPrompt);
  }

  /**
   * Process confirmation or cancellation of an action token.
   */
  async confirmAction(
    ctx: AuthenticatedOwnerContext,
    token: string,
    confirm: boolean
  ): Promise<AiAssistantResponse> {
    if (!confirm) {
      const cancelRes = await aiAssistantToolsRegistry.cancelToken(token, ctx.organizationId, ctx.userId);
      return {
        success: true,
        message: cancelRes.message,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_2_ACTION',
      };
    }

    // Peek at token action type
    const { actionType, payload } = await aiAssistantToolsRegistry.validateAndConsumeToken(
      token,
      ctx.organizationId,
      ctx.userId
    );

    if (actionType === 'ROOM_TRANSFER') {
      const { studentService } = require('../students/student.service');
      const transferRes = await studentService.transferStudent(ctx.organizationId, payload.studentId, {
        targetBranchId: payload.targetBranchId,
        targetBedId: payload.targetBedId,
        reason: payload.reason,
        approvedBy: ctx.name || 'Owner AI Assistant',
      });

      return {
        success: true,
        message: `Confirmed! Successfully transferred ${payload.studentName} from Room ${payload.fromRoom} (Bed ${payload.fromBed}) to Room ${payload.toRoom} (Bed ${payload.toBed}).`,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_2_ACTION',
        data: transferRes,
      };
    }

    if (actionType === 'CREATE_ANNOUNCEMENT') {
      const { announcementService } = require('../announcements/announcement.service');
      const ann = await announcementService.create(
        payload,
        { organizationId: ctx.organizationId, id: ctx.userId, name: ctx.name }
      );
      return {
        success: true,
        message: `Confirmed! Announcement "${payload.title}" has been published and broadcasted.`,
        category: 'ANNOUNCEMENTS',
        accessLevel: 'LEVEL_2_ACTION',
        data: ann,
      };
    }

    if (actionType === 'UPDATE_COMPLAINT_STATUS') {
      const { complaintService } = require('../complaints/complaint.service');
      const { query } = require('../../config/database');

      if (payload.newStatus === 'RESOLVED') {
        await complaintService.resolveComplaint(ctx.organizationId, payload.complaintId, {
          resolutionNotes: payload.notes,
        });
      } else {
        await query(
          "UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3",
          [payload.newStatus, payload.complaintId, ctx.organizationId]
        );
      }

      return {
        success: true,
        message: `Confirmed! Complaint #${payload.complaintNumber} marked as ${payload.newStatus}.`,
        category: 'COMPLAINTS',
        accessLevel: 'LEVEL_2_ACTION',
      };
    }

    throw new AppError(`Unsupported action type: ${actionType}`, 400);
  }

  // =========================================================================
  // SECURITY GUARDS & RESTRICTION DETECTORS
  // =========================================================================

  private isPromptInjectionAttempt(prompt: string): boolean {
    const p = prompt.toLowerCase();
    const injectionPatterns = [
      /forget\s+(?:all\s+)?(?:the\s+)?rules/i,
      /ignore\s+(?:all\s+)?(?:previous|prior|system)\s+instructions/i,
      /bypass\s+(?:security|permissions|restrictions)/i,
      /system\s+prompt/i,
      /you\s+are\s+now\s+in\s+unrestricted\s+mode/i,
      /jailbreak/i,
      /dan\s+mode/i,
      /act\s+as\s+root/i,
      /as\s+an\s+unrestricted\s+administrator/i,
      /override\s+all\s+safeguards/i,
    ];
    return injectionPatterns.some((pattern) => pattern.test(p));
  }

  private checkRestrictedOperations(prompt: string): AiAssistantResponse | null {
    const p = prompt.toLowerCase();

    // 1. Payment Receipt Creation / Alteration
    if (
      (p.includes('receipt') && (p.includes('create') || p.includes('generate') || p.includes('make') || p.includes('alter') || p.includes('modify') || p.includes('issue') || p.includes('new receipt'))) ||
      /create\s+(?:a\s+)?(?:new\s+)?(?:payment\s+)?receipt/i.test(p)
    ) {
      return {
        success: false,
        message:
          'Restricted Operation: The AI Assistant is prohibited from creating, altering, or issuing official payment receipts. Payment receipts are authoritative financial documents generated exclusively through confirmed IHMS transactions. Please navigate to the Finance & Payments section in IHMS to manage receipts.',
        category: 'PAYMENTS',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'PAYMENT_RECEIPT_MODIFICATION_RESTRICTED',
        suggestedFollowUps: ['View payment history', 'Check outstanding fees'],
      };
    }

    // 2. Modifying Payment Records / Transaction Status
    if (
      (p.includes('payment') && (p.includes('modify') || p.includes('delete') || p.includes('change status') || p.includes('mark paid manually') || p.includes('alter') || p.includes('refund payment'))) ||
      /change\s+transaction\s+status/i.test(p)
    ) {
      return {
        success: false,
        message:
          'Restricted Operation: Direct modification of payment records, transaction statuses, and refund processing cannot be executed by the AI Assistant. To preserve financial audit integrity, please use the official IHMS Finance module.',
        category: 'PAYMENTS',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'PAYMENT_RECORD_MUTATION_RESTRICTED',
        suggestedFollowUps: ['Show today\'s payments', 'Show payment history'],
      };
    }

    // 3. Payment Gateway Settings & Credentials
    if (
      p.includes('gateway') ||
      p.includes('razorpay') ||
      p.includes('secret key') ||
      p.includes('api key') ||
      (p.includes('change') && (p.includes('upi') || p.includes('bank')))
    ) {
      return {
        success: false,
        message:
          'Restricted Operation: Payment gateway settings, merchant credentials, and payout configuration are strictly protected and inaccessible to the AI Assistant. Please configure payment methods via Settings > Payment Gateway.',
        category: 'PAYMENTS',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'PAYMENT_GATEWAY_CONFIG_RESTRICTED',
      };
    }

    // 4. Owner Sensitive Credentials (Passwords, OTPs, Tokens, UPI VPAs, Bank Details)
    if (
      /\b(?:password|passwd|pwd|passcode)\b/i.test(p) ||
      /\b(?:otp|one\s+time\s+password|verification\s+code)\b/i.test(p) ||
      /\b(?:token|auth\s+token|secret\s+key|private\s+key)\b/i.test(p) ||
      /\b(?:upi\s+id|my\s+upi|upi\s+vpa|bank\s+details|account\s+number)\b/i.test(p)
    ) {
      return {
        success: false,
        message:
          'Restricted Information: The AI Assistant does not access, expose, or store sensitive owner credentials (passwords, OTPs, UPI IDs, bank account numbers, API keys, or security tokens). Please view or update your credentials securely in Profile & Account Settings.',
        category: 'OWNER_ACCOUNT',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'SENSITIVE_CREDENTIALS_RESTRICTED',
      };
    }

    // 5. Direct Database / Raw SQL Access Attempts
    if (
      /show\s+(?:me\s+)?everything\s+in\s+the\s+database/i.test(p) ||
      /dump\s+(?:the\s+)?database/i.test(p) ||
      /\b(?:select\s+\*\s+from|drop\s+table|delete\s+from|insert\s+into)\b/i.test(p)
    ) {
      return {
        success: false,
        message:
          'Restricted Operation: Unrestricted database queries and raw SQL commands are strictly prohibited. The AI Assistant interacts only through predefined, approved IHMS tools.',
        category: 'UNKNOWN',
        accessLevel: 'LEVEL_3_RESTRICTED',
        denialReason: 'DIRECT_DATABASE_ACCESS_PROHIBITED',
        suggestedFollowUps: ['Show occupancy stats', 'How many beds are vacant?', 'Show outstanding fees'],
      };
    }

    return null;
  }

  // =========================================================================
  // ROUTING & TOOL EXECUTION
  // =========================================================================

  private async routeAndExecute(
    ctx: AuthenticatedOwnerContext,
    normalizedPrompt: string,
    originalPrompt: string
  ): Promise<AiAssistantResponse> {
    const p = normalizedPrompt.toLowerCase();

    // -----------------------------------------------------------------------
    // Level 2 Action: Room Transfer
    // -----------------------------------------------------------------------
    if (
      (p.includes('move') || p.includes('transfer') || p.includes('reassign') || p.includes('change room')) &&
      (p.includes('room') || p.includes('bed'))
    ) {
      return this.handleRoomTransferIntent(ctx, normalizedPrompt, originalPrompt);
    }

    // -----------------------------------------------------------------------
    // Level 2 Action: Create Announcement
    // -----------------------------------------------------------------------
    if (
      (p.includes('create announcement') || p.includes('post announcement') || p.includes('make announcement') || p.includes('broadcast')) &&
      p.length > 25
    ) {
      return this.handleAnnouncementIntent(ctx, normalizedPrompt);
    }

    // -----------------------------------------------------------------------
    // Level 2 Action: Update Complaint Status
    // -----------------------------------------------------------------------
    if (
      p.includes('complaint') &&
      (p.includes('resolve') || p.includes('mark resolved') || p.includes('in progress') || p.includes('update')) &&
      /#?[a-zA-Z0-9_-]+/i.test(p)
    ) {
      return this.handleComplaintUpdateIntent(ctx, normalizedPrompt);
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Vacant Beds / Available Rooms
    // -----------------------------------------------------------------------
    if (
      p.includes('vacant') ||
      p.includes('available bed') ||
      p.includes('empty bed') ||
      p.includes('free bed') ||
      (p.includes('how many') && p.includes('bed') && (p.includes('available') || p.includes('empty')))
    ) {
      const data = await aiAssistantToolsRegistry.getVacantBeds(ctx);
      const message =
        data.count === 0
          ? 'Currently, all beds in the hostel are fully occupied.'
          : `There are currently ${data.count} vacant bed(s) available across the hostel.\n\n` +
            data.vacantBeds
              .slice(0, 10)
              .map(
                (b, idx) =>
                  `${idx + 1}. Room ${b.roomNumber} (Floor ${b.floor}) — Bed ${b.bedCode} [₹${b.monthlyRate.toLocaleString('en-IN')}/mo]`
              )
              .join('\n') +
            (data.count > 10 ? `\n...and ${data.count - 10} more available beds.` : '');

      return {
        success: true,
        message,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_1_READ',
        data,
        suggestedFollowUps: ['Show occupancy stats', 'Show occupied beds', 'Show unpaid students'],
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Occupancy Stats
    // -----------------------------------------------------------------------
    if (
      p.includes('occupancy') ||
      p.includes('how full') ||
      (p.includes('hostel') && p.includes('capacity')) ||
      (p.includes('total') && p.includes('beds'))
    ) {
      const stats = await aiAssistantToolsRegistry.getOccupancyStats(ctx);
      const message =
        `Hostel Occupancy Summary:\n` +
        `• Total Rooms: ${stats.totalRooms}\n` +
        `• Total Capacity: ${stats.totalBeds} beds\n` +
        `• Occupied Beds: ${stats.occupiedBeds}\n` +
        `• Vacant Beds: ${stats.vacantBeds}\n` +
        `• Current Occupancy Rate: ${stats.occupancyRate}`;

      return {
        success: true,
        message,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_1_READ',
        data: stats,
        suggestedFollowUps: ['How many beds are vacant?', 'Show occupied beds'],
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Occupied Beds
    // -----------------------------------------------------------------------
    if (p.includes('occupied bed') || p.includes('filled bed')) {
      const data = await aiAssistantToolsRegistry.getOccupiedBeds(ctx);
      const message =
        data.count === 0
          ? 'No beds are currently occupied.'
          : `There are currently ${data.count} occupied bed(s):\n\n` +
            data.occupiedBeds
              .slice(0, 10)
              .map(
                (b, idx) =>
                  `${idx + 1}. Room ${b.roomNumber} — Bed ${b.bedCode} : ${b.studentName} (${b.customerCode})`
              )
              .join('\n') +
            (data.count > 10 ? `\n...and ${data.count - 10} more occupied beds.` : '');

      return {
        success: true,
        message,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_1_READ',
        data,
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Outstanding Fees / Unpaid Students
    // -----------------------------------------------------------------------
    if (
      p.includes('unpaid') ||
      p.includes('outstanding') ||
      p.includes('due') ||
      p.includes('defaulter') ||
      (p.includes('fee') && (p.includes('pending') || p.includes('not paid') || p.includes('who haven\'t paid')))
    ) {
      const data = await aiAssistantToolsRegistry.getOutstandingFees(ctx);
      const totalStr = `₹${data.totalOutstandingAmount.toLocaleString('en-IN')}`;

      if (data.count === 0) {
        return {
          success: true,
          message: 'Great news! There are currently no students with outstanding fee dues.',
          category: 'FEE_MANAGEMENT',
          accessLevel: 'LEVEL_1_READ',
          data,
        };
      }

      const message =
        `There are ${data.count} student(s) with pending dues totaling ${totalStr}:\n\n` +
        data.students
          .slice(0, 10)
          .map(
            (s, idx) =>
              `${idx + 1}. ${s.fullName} (${s.customerCode}) — Room ${s.roomNumber}: Pending ₹${s.outstandingBalance.toLocaleString('en-IN')} [Status: ${s.status}]`
          )
          .join('\n') +
        (data.count > 10 ? `\n...and ${data.count - 10} more student(s) with outstanding dues.` : '');

      return {
        success: true,
        message,
        category: 'FEE_MANAGEMENT',
        accessLevel: 'LEVEL_1_READ',
        data,
        suggestedFollowUps: ['Show today\'s payments', 'Show student count'],
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Payment History
    // -----------------------------------------------------------------------
    if (
      p.includes('payment') ||
      p.includes('transaction') ||
      p.includes('collections')
    ) {
      let statusFilter = 'ALL';
      if (p.includes('success')) statusFilter = 'SUCCESS';
      else if (p.includes('failed')) statusFilter = 'FAILED';
      else if (p.includes('pending')) statusFilter = 'PENDING';

      const data = await aiAssistantToolsRegistry.getPaymentHistory(ctx, undefined, statusFilter, 10);
      if (data.count === 0) {
        return {
          success: true,
          message: `No ${statusFilter === 'ALL' ? '' : statusFilter.toLowerCase() + ' '}payments recorded recently.`,
          category: 'PAYMENTS',
          accessLevel: 'LEVEL_1_READ',
          data,
        };
      }

      const message =
        `Recent Payment Records (${data.count}):\n\n` +
        data.payments
          .map(
            (pm, idx) =>
              `${idx + 1}. ${pm.studentName} (${pm.customerCode}) — ₹${pm.amount.toLocaleString('en-IN')} via ${pm.paymentMethod} [${pm.status}] ${pm.receiptNumber ? `(Receipt: ${pm.receiptNumber})` : ''}`
          )
          .join('\n');

      return {
        success: true,
        message,
        category: 'PAYMENTS',
        accessLevel: 'LEVEL_1_READ',
        data,
        suggestedFollowUps: ['Show unpaid students', 'Show occupancy stats'],
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Student Count / Admissions
    // -----------------------------------------------------------------------
    if (p.includes('student') && (p.includes('how many') || p.includes('count') || p.includes('total') || p.includes('active'))) {
      const data = await aiAssistantToolsRegistry.getStudentCount(ctx);
      const message =
        `Student Statistics:\n` +
        `• Total Registered: ${data.total}\n` +
        `• Active Residents: ${data.active}\n` +
        `• Pending Admissions: ${data.pending}\n` +
        `• Vacated / Left: ${data.left}`;

      return {
        success: true,
        message,
        category: 'STUDENT_MANAGEMENT',
        accessLevel: 'LEVEL_1_READ',
        data,
        suggestedFollowUps: ['How many beds are vacant?', 'Show unpaid students'],
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Complaints & Maintenance
    // -----------------------------------------------------------------------
    if (p.includes('complaint') || p.includes('maintenance') || p.includes('repair') || p.includes('issue')) {
      const data = await aiAssistantToolsRegistry.getComplaintsSummary(ctx);
      const message =
        `Complaints & Maintenance Overview:\n` +
        `• Open Complaints: ${data.open}\n` +
        `• In Progress: ${data.inProgress}\n` +
        `• Resolved: ${data.resolved}\n` +
        `• Total Logged: ${data.total}\n\n` +
        (data.recent.length > 0
          ? `Recent issues:\n` +
            data.recent
              .slice(0, 5)
              .map((c, i) => `${i + 1}. #${c.complaintNumber} [${c.priority} / ${c.status}]: ${c.title} (${c.studentName})`)
              .join('\n')
          : 'No recent complaints logged.');

      return {
        success: true,
        message,
        category: 'COMPLAINTS',
        accessLevel: 'LEVEL_1_READ',
        data,
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Announcements
    // -----------------------------------------------------------------------
    if (p.includes('announcement') || p.includes('notice') || p.includes('bulletin')) {
      const data = await aiAssistantToolsRegistry.getAnnouncements(ctx);
      const message =
        data.count === 0
          ? 'No active announcements currently posted.'
          : `Active Announcements (${data.count}):\n\n` +
            data.announcements
              .map((a, i) => `${i + 1}. [${a.priority}] ${a.title}\n   ${a.message}`)
              .join('\n\n');

      return {
        success: true,
        message,
        category: 'ANNOUNCEMENTS',
        accessLevel: 'LEVEL_1_READ',
        data,
      };
    }

    // -----------------------------------------------------------------------
    // Level 1 Read: Dashboard / Overall Overview
    // -----------------------------------------------------------------------
    if (p.includes('overview') || p.includes('summary') || p.includes('dashboard') || p.includes('how is the hostel')) {
      const data = await aiAssistantToolsRegistry.getDashboardSummary(ctx);
      const message =
        `IHMS Operational Summary:\n` +
        `• Occupancy: ${data.occupancy.occupiedBeds}/${data.occupancy.totalBeds} beds occupied (${data.occupancy.occupancyRate})\n` +
        `• Available Capacity: ${data.occupancy.vacantBeds} vacant beds\n` +
        `• Active Students: ${data.students.active}\n` +
        `• Open Complaints: ${data.openComplaints}`;

      return {
        success: true,
        message,
        category: 'REPORTS',
        accessLevel: 'LEVEL_1_READ',
        data,
        suggestedFollowUps: ['How many beds are vacant?', 'Show unpaid students', 'Show recent payments'],
      };
    }

    // Default conversational response with helpful capabilities guidance
    return {
      success: true,
      message:
        `I am your IHMS AI Assistant. I can help you monitor and operate your hostel using natural language:\n\n` +
        `• Room & Beds: "How many beds are vacant?", "Show occupancy stats", "Move Rahul to Room 203"\n` +
        `• Fees & Payments: "Show unpaid students", "Recent payment history"\n` +
        `• Complaints: "Show pending maintenance complaints"\n` +
        `• Operations: "Post an announcement to all students"\n\n` +
        `How can I assist you today?`,
      category: 'UNKNOWN',
      accessLevel: 'LEVEL_1_READ',
      suggestedFollowUps: [
        'How many beds are vacant?',
        'Show unpaid students',
        'Show occupancy stats',
      ],
    };
  }

  // =========================================================================
  // ACTION PROPOSAL BUILDERS (Level 2 with Confirmation)
  // =========================================================================

  private async handleRoomTransferIntent(
    ctx: AuthenticatedOwnerContext,
    normalizedPrompt: string,
    originalPrompt: string
  ): Promise<AiAssistantResponse> {
    const p = normalizedPrompt;

    // Extract student name/identifier: e.g. "move Rahul to..." or "transfer Rahul to Room 203"
    let studentIdent = '';
    let targetRoomNumber = '';
    let targetBedCode = '';

    const moveMatch = p.match(/(?:move|transfer|reassign)\s+([a-zA-Z0-9\s._-]+?)\s+(?:to|into)\s+/i);
    if (moveMatch && moveMatch[1]) {
      studentIdent = moveMatch[1].trim();
    }

    const roomMatch = p.match(/(?:room)\s+([a-zA-Z0-9_-]+)/i);
    if (roomMatch && roomMatch[1]) {
      targetRoomNumber = roomMatch[1].trim();
    }

    const bedMatch = p.match(/(?:bed)\s+([a-zA-Z0-9_-]+)/i);
    if (bedMatch && bedMatch[1]) {
      targetBedCode = bedMatch[1].trim();
    }

    if (!studentIdent) {
      // Fallback: search for words between "move" and "room"
      const fallback = p.match(/(?:move|transfer)\s+([a-zA-Z0-9]+)/i);
      if (fallback) studentIdent = fallback[1].trim();
    }

    if (!studentIdent) {
      return {
        success: false,
        message: 'Please specify the student name or ID you would like to transfer (e.g. "Move Rahul to an available room" or "Transfer Rahul to Room 203").',
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_2_ACTION',
      };
    }

    try {
      const proposal = await aiAssistantToolsRegistry.prepareRoomTransfer(ctx, {
        studentIdentifier: studentIdent,
        targetRoomNumber: targetRoomNumber || undefined,
        targetBedCode: targetBedCode || undefined,
      });

      return {
        success: true,
        message: proposal.description,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_2_ACTION',
        confirmationRequired: true,
        confirmationProposal: proposal,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Unable to prepare transfer: ${err.message || err}`,
        category: 'ROOM_BED_MANAGEMENT',
        accessLevel: 'LEVEL_2_ACTION',
      };
    }
  }

  private async handleAnnouncementIntent(
    ctx: AuthenticatedOwnerContext,
    prompt: string
  ): Promise<AiAssistantResponse> {
    let title = 'Hostel Announcement';
    let message = '';

    const quotesMatch = prompt.match(/"([^"]+)"/);
    if (quotesMatch && quotesMatch[1]) {
      title = quotesMatch[1].trim();
      message = prompt
        .replace(quotesMatch[0], '')
        .replace(/(?:create|post|make)\s+announcement(?:\s+with\s+title)?\s*(?:[:\s-]*)/i, '')
        .replace(/^(?:regarding|about|stating|with)\s+/i, '')
        .trim();
    } else {
      const titleMatch = prompt.match(/(?:title|called|about)\s*[:]\s*([^,\n]+)/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
      message = prompt.replace(/(?:create|post|make)\s+announcement\s*/i, '').trim();
    }

    if (!message) {
      message = title;
    }

    const proposal = await aiAssistantToolsRegistry.prepareCreateAnnouncement(ctx, {
      title,
      message,
      priority: prompt.toLowerCase().includes('urgent') ? 'URGENT' : 'NORMAL',
      targetType: 'ALL',
    });

    return {
      success: true,
      message: proposal.description,
      category: 'ANNOUNCEMENTS',
      accessLevel: 'LEVEL_2_ACTION',
      confirmationRequired: true,
      confirmationProposal: proposal,
    };
  }

  private async handleComplaintUpdateIntent(
    ctx: AuthenticatedOwnerContext,
    prompt: string
  ): Promise<AiAssistantResponse> {
    const numMatch = prompt.match(/#?([a-zA-Z0-9_-]+)/i);
    const complaintNumber = numMatch ? numMatch[1] : '';

    const newStatus = prompt.toLowerCase().includes('resolve') ? 'RESOLVED' : 'IN_PROGRESS';

    const proposal = await aiAssistantToolsRegistry.prepareUpdateComplaintStatus(ctx, {
      complaintNumber,
      newStatus,
    });

    return {
      success: true,
      message: proposal.description,
      category: 'COMPLAINTS',
      accessLevel: 'LEVEL_2_ACTION',
      confirmationRequired: true,
      confirmationProposal: proposal,
    };
  }
}

export const aiAssistantOrchestratorService = new AiAssistantOrchestratorService();
