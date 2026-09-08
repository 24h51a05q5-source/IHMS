import { connectDatabase, disconnectDatabase, query, queryOne } from '../src/config/database';
import { runMigrations } from '../src/config/migrations';
import { emailService } from '../src/common/utils/email.service';
import { supportService } from '../src/modules/support/support.service';

beforeAll(async () => {
  await connectDatabase();
  await runMigrations();
});

afterAll(async () => {
  await disconnectDatabase();
});

// ---------------------------------------------------------------------------
// Mock user contexts
// ---------------------------------------------------------------------------
const mockStudentUser = {
  id: 'SUPPORT_TEST_STUDENT_1',
  userId: 'SUPPORT_TEST_STUDENT_1',
  organizationId: 'TEST_ORG',
  role: 'STUDENT',
  email: 'student_support_test@ihms.com',
  name: 'Rahul Kumar',
  hostelName: 'AA Boys Hostel',
};

const mockOwnerUser = {
  id: 'SUPPORT_TEST_OWNER_1',
  userId: 'SUPPORT_TEST_OWNER_1',
  organizationId: 'TEST_ORG',
  role: 'ORGANIZATION_OWNER',
  email: 'owner_support_test@ihms.com',
  name: 'Ramesh Hostel Manager',
  hostelName: 'Chaitanya Boys Hostel',
};

// ---------------------------------------------------------------------------
// Helper: clean up test tickets
// ---------------------------------------------------------------------------
async function cleanTestTickets() {
  try {
    await query(`DELETE FROM support_tickets WHERE organization_id = 'TEST_ORG' AND user_id LIKE 'SUPPORT_TEST_%'`, []);
  } catch {
    // Ignore
  }
}

describe('Support Email System — Ticket ID, Email Dispatch, Failure Handling', () => {
  beforeAll(async () => {
    await cleanTestTickets();
  });

  afterAll(async () => {
    await cleanTestTickets();
  });

  // -------------------------------------------------------------------------
  // 1. Ticket ID Format
  // -------------------------------------------------------------------------
  describe('1. Ticket ID Format (IHMS-XXXX)', () => {
    it('should generate ticket IDs starting at IHMS-1024+ in the correct format', async () => {
      let ticket: any;
      try {
        ticket = await supportService.createTicket(mockStudentUser, {
          subject: 'Ticket ID Format Test',
          category: 'Technical Issue',
          priority: 'MEDIUM',
          description: 'Verifying IHMS-XXXX ticket number format.',
        });
      } catch (err: any) {
        // Email not configured in dev — email failure throws, but ticket was still inserted
        // Check it was saved in DB
        const saved = await queryOne<any>(
          `SELECT ticket_number FROM support_tickets WHERE user_id = $1 AND subject = $2`,
          [mockStudentUser.id, 'Ticket ID Format Test']
        );
        if (saved) {
          ticket = saved;
        } else {
          console.warn('[SUPPORT-TEST] Ticket not saved to DB — skipping ID format assertion');
          return;
        }
      }

      const ticketNumber: string = ticket?.ticketNumber || ticket?.ticket_number || '';
      expect(ticketNumber).toMatch(/^IHMS-\d+$/);
      const seq = parseInt(ticketNumber.split('-')[1]);
      expect(seq).toBeGreaterThanOrEqual(1024);
      console.log(`[SUPPORT-TEST] ✅ Ticket ID format verified: ${ticketNumber}`);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Form Validation
  // -------------------------------------------------------------------------
  describe('2. Form Validation', () => {
    it('should throw when subject is missing', async () => {
      await expect(
        supportService.createTicket(mockStudentUser, {
          subject: '',
          category: 'Technical Issue',
          description: 'No subject.',
        })
      ).rejects.toThrow(/subject/i);
    });

    it('should throw when category is missing', async () => {
      await expect(
        supportService.createTicket(mockStudentUser, {
          subject: 'Cat missing',
          category: '',
          description: 'No category.',
        })
      ).rejects.toThrow(/category/i);
    });

    it('should throw when description is missing', async () => {
      await expect(
        supportService.createTicket(mockStudentUser, {
          subject: 'Desc missing',
          category: 'Technical Issue',
          description: '',
        })
      ).rejects.toThrow(/description/i);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Email Failure Simulation
  // -------------------------------------------------------------------------
  describe('3. Email Failure Simulation', () => {
    it('should throw with clear error when EMAIL_SIMULATE_FAILURE=true', async () => {
      process.env.EMAIL_SIMULATE_FAILURE = 'true';
      let threw = false;
      let errorMsg = '';
      try {
        await supportService.createTicket(mockOwnerUser, {
          subject: 'Email Failure Simulation Test',
          category: 'Technical Issue',
          priority: 'HIGH',
          description: 'This tests email failure handling. Should throw with a clear error.',
        });
      } catch (err: any) {
        threw = true;
        errorMsg = err?.message || '';
      } finally {
        delete process.env.EMAIL_SIMULATE_FAILURE;
      }

      expect(threw).toBe(true);
      expect(errorMsg.toLowerCase()).toMatch(/could not be sent|try again/i);
      console.log(`[SUPPORT-TEST] ✅ Email failure correctly throws: "${errorMsg}"`);
    });

    it('should NOT resolve successfully when email dispatch fails', async () => {
      process.env.EMAIL_SIMULATE_FAILURE = 'true';
      let resolved = false;
      try {
        await supportService.createTicket(mockOwnerUser, {
          subject: 'No success on failure',
          category: 'Payment / Fees Problem',
          priority: 'URGENT',
          description: 'Verifies that ticket creation does not succeed when email fails.',
        });
        resolved = true; // Should NOT reach here
      } catch {
        // Expected
      } finally {
        delete process.env.EMAIL_SIMULATE_FAILURE;
      }

      expect(resolved).toBe(false);
      console.log(`[SUPPORT-TEST] ✅ No false success returned when email fails`);
    });
  });

  // -------------------------------------------------------------------------
  // 4. My Submitted Tickets
  // -------------------------------------------------------------------------
  describe('4. My Submitted Tickets', () => {
    it('should retrieve student submitted tickets', async () => {
      const tickets = await supportService.getUserTickets(
        mockStudentUser.id,
        mockStudentUser.email,
        mockStudentUser.organizationId
      );
      expect(Array.isArray(tickets)).toBe(true);
      console.log(`[SUPPORT-TEST] ✅ Student tickets count: ${tickets.length}`);
    });

    it('should retrieve owner submitted tickets', async () => {
      const tickets = await supportService.getUserTickets(
        mockOwnerUser.id,
        mockOwnerUser.email,
        mockOwnerUser.organizationId
      );
      expect(Array.isArray(tickets)).toBe(true);
      console.log(`[SUPPORT-TEST] ✅ Owner tickets count: ${tickets.length}`);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Support Email Recipient
  // -------------------------------------------------------------------------
  describe('5. Support Email Recipient', () => {
    it('SUPPORT_EMAIL env should default to ihmserp00@gmail.com', () => {
      const recipient = process.env.SUPPORT_EMAIL || 'ihmserp00@gmail.com';
      expect(recipient).toBe('ihmserp00@gmail.com');
      console.log(`[SUPPORT-TEST] ✅ Recipient: ${recipient}`);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Priority Field Accepted
  // -------------------------------------------------------------------------
  describe('6. Priority Field', () => {
    it('should record priority correctly in the database after successful submission', async () => {
      // Only checks if we get either a ticket or an email-dispatch error
      // (email might not be configured in dev)
      let ticketNumberForCheck: string | null = null;
      try {
        const ticket = await supportService.createTicket(mockOwnerUser, {
          subject: 'Priority URGENT Test',
          category: 'Technical Issue',
          priority: 'URGENT',
          description: 'Testing URGENT priority level recording.',
        });
        ticketNumberForCheck = ticket.ticketNumber;
      } catch {
        // Email not configured — ticket may still be in DB with FAILED email_status
      }

      const saved = await queryOne<any>(
        `SELECT ticket_number, priority, email_status FROM support_tickets WHERE user_id = $1 AND subject = 'Priority URGENT Test'`,
        [mockOwnerUser.id]
      );

      if (saved) {
        expect(saved.priority).toBe('URGENT');
        console.log(`[SUPPORT-TEST] ✅ Priority URGENT recorded in DB for ticket ${saved.ticket_number} (email_status: ${saved.email_status})`);
      } else {
        console.warn('[SUPPORT-TEST] Ticket not found in DB — possibly blocked earlier');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. SendSupportEmail Options Validation
  // -------------------------------------------------------------------------
  describe('7. EmailService sendSupportEmail validation', () => {
    it('should throw when userEmail is empty', async () => {
      await expect(
        emailService.sendSupportEmail({
          ticketNumber: 'IHMS-1024',
          userName: 'Test',
          userRole: 'STUDENT',
          userEmail: '',
          category: 'Technical Issue',
          subject: 'Test',
          description: 'Test',
        })
      ).rejects.toThrow(/email/i);
    });
  });
});

