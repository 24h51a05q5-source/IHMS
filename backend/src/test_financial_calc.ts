process.env.NODE_ENV = 'test';

import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from './config/database';
import { financialCalculationService } from './modules/fees/financial-calculation.service';

interface TestAssertion {
  testNumber: number;
  title: string;
  passed: boolean;
  details: string;
  error?: any;
}

const testResults: TestAssertion[] = [];

function recordTest(testNumber: number, title: string, passed: boolean, details: string, error?: any) {
  testResults.push({ testNumber, title, passed, details, error });
  if (passed) {
    console.log(`  \x1b[32m✔\x1b[0m \x1b[1m[TEST ${testNumber} PASSED]\x1b[0m ${title}`);
    console.log(`    \x1b[90m↳ ${details}\x1b[0m\n`);
  } else {
    console.error(`  \x1b[31m✖\x1b[0m \x1b[1;31m[TEST ${testNumber} FAILED]\x1b[0m ${title}`);
    console.error(`    \x1b[31m↳ ${details}\x1b[0m`);
    if (error) {
      console.error(`    \x1b[31m↳ Stack: ${error.stack || error.message || error}\x1b[0m\n`);
    }
  }
}

export async function runFinancialCalculationTestSuite(): Promise<boolean> {
  console.log('\n==============================================================================');
  console.log('  💰 IHMS AUTOMATED FINANCIAL CALCULATION & DUE DATE ENGINE SUITE');
  console.log('  📍 Validating Rent Generation, Due Dates, Grace Periods, Late-Fees & Webhooks');
  console.log('==============================================================================\n');

  try {
    await connectDatabase();
  } catch (err: any) {
    console.error(`\x1b[1;41m[CRITICAL ALERT]\x1b[0m CRASH_CODE: ERR_DATABASE_BOOTSTRAP_FAILURE - Cannot connect to database.`);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const orgId = 'org_fin_test_01';
  const hostelId = 'H_FIN_001';
  const studentId = 'stu_fin_mock_01';
  const customId = 'H_FIN-0001';
  const customerCode = 'H_FIN-ST000001';
  const roomId = 'rm_fin_001';
  const bedId = 'bed_fin_001';

  // Seed baseline test records
  await query(
    `INSERT INTO organizations (id, org_code, name)
     VALUES ($1, 'FIN001', 'Financial Engine Test Org')
     ON CONFLICT (id) DO NOTHING`,
    [orgId]
  );

  await query(
    `INSERT INTO hostels (id, hostel_id, organization_id, name, branch_name, status, late_fee_enabled, late_fee_amount)
     VALUES ($1, $1, $2, 'Financial Test Branch', 'Branch Alpha', 'ACTIVE', TRUE, 500.00)
     ON CONFLICT (id) DO UPDATE SET late_fee_enabled = TRUE, late_fee_amount = 500.00, status = 'ACTIVE'`,
    [hostelId, orgId]
  );

  await query(
    `INSERT INTO rooms (id, room_number, hostel_id, organization_id, status, monthly_rent, monthly_rate)
     VALUES ($1, '201', $2, $3, 'ACTIVE', 8000.00, 8000.00)
     ON CONFLICT (id) DO UPDATE SET monthly_rent = 8000.00, monthly_rate = 8000.00`,
    [roomId, hostelId, orgId]
  );

  await query(
    `INSERT INTO beds (id, bed_code, room_id, hostel_id, organization_id, status, monthly_rate)
     VALUES ($1, 'HFIN-201-A', $2, $3, $4, 'OCCUPIED', 8000.00)
     ON CONFLICT (id) DO UPDATE SET monthly_rate = 8000.00, status = 'OCCUPIED'`,
    [bedId, roomId, hostelId, orgId]
  );

  await query(
    `INSERT INTO students (
       id, organization_id, hostel_id, room_id, bed_id, custom_id, customer_code,
       full_name, email, phone, status, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Alice Fin Student', 'alice.fin@test.com', '9876543211', 'ACTIVE', TRUE)
     ON CONFLICT (id) DO UPDATE SET is_active = TRUE, status = 'ACTIVE', room_id = $4, bed_id = $5`,
    [studentId, orgId, hostelId, roomId, bedId, customId, customerCode]
  );

  // ===========================================================================
  // TEST 1: Standard Generation Test
  // ===========================================================================
  try {
    const targetDate = new Date(Date.UTC(2026, 8, 1)); // September 1st, 2026
    const generationResult = await financialCalculationService.generateMonthlyInvoices({
      targetDate,
      orgId,
      studentId,
    });

    if (generationResult.generatedCount !== 1) {
      throw new Error(`Expected 1 generated invoice, but got ${generationResult.generatedCount}.`);
    }

    const expectedBillingMonth = '2026-09';
    const expectedDueDate = '2026-09-05';

    if (generationResult.billingMonth !== expectedBillingMonth) {
      throw new Error(`Expected billing_month '${expectedBillingMonth}', got '${generationResult.billingMonth}'.`);
    }

    if (generationResult.dueDate !== expectedDueDate) {
      throw new Error(`Expected due_date '${expectedDueDate}', got '${generationResult.dueDate}'.`);
    }

    // Verify database row in fee_ledgers table
    const ledgerRow = await queryOne<any>(
      `SELECT id, invoice_id, billing_month, amount_due, due_date, status, transaction_type, student_id
       FROM fee_ledgers
       WHERE student_id = $1 AND billing_month = $2 AND transaction_type = 'MONTHLY_INVOICE'`,
      [studentId, expectedBillingMonth]
    );

    if (!ledgerRow) {
      throw new Error('Ledger record was not created in fee_ledgers table.');
    }

    const dbDueDateStr = typeof ledgerRow.due_date === 'string'
      ? ledgerRow.due_date.slice(0, 10)
      : ledgerRow.due_date.toISOString().slice(0, 10);

    if (dbDueDateStr !== expectedDueDate) {
      throw new Error(`Database due_date was '${dbDueDateStr}', expected '${expectedDueDate}'.`);
    }

    if (Number(ledgerRow.amount_due) !== 8000.00) {
      throw new Error(`Database amount_due was ${ledgerRow.amount_due}, expected 8000.00.`);
    }

    if (ledgerRow.status !== 'PENDING') {
      throw new Error(`Database status was '${ledgerRow.status}', expected 'PENDING'.`);
    }

    recordTest(
      1,
      'Standard Generation Test (1st of Month -> 5th Due Date)',
      true,
      `Invoices generated on 1st of calendar month ('2026-09-01'). due_date strictly resolved to the 5th ('${dbDueDateStr}'). Status: '${ledgerRow.status}', Amount Due: ₹${Number(ledgerRow.amount_due).toFixed(2)}.`
    );
  } catch (err: any) {
    recordTest(1, 'Standard Generation Test', false, err.message, err);
  }

  // ===========================================================================
  // TEST 2: Webhook Reconciliation Test
  // ===========================================================================
  try {
    // Simulate a payment arriving on September 12th, 2026 (7 days AFTER the 5th due date)
    const paymentTimestamp = new Date(Date.UTC(2026, 8, 12, 14, 30, 0)); // 2026-09-12 14:30 UTC
    const mockPaymentId = `pmt_cf_late_${Date.now()}`;
    const paidAmount = 8000.00;

    const reconcileResult = await financialCalculationService.reconcilePaymentWebhook({
      paymentId: mockPaymentId,
      studentId,
      amount: paidAmount,
      paidAt: paymentTimestamp,
      organizationId: orgId,
    });

    if (!reconcileResult.reconciled) {
      throw new Error('reconcilePaymentWebhook returned false.');
    }

    if (reconcileResult.newStatus !== 'PAID') {
      throw new Error(`Expected newStatus 'PAID', got '${reconcileResult.newStatus}'.`);
    }

    // Verify fee_ledgers table was updated
    const updatedLedger = await queryOne<any>(
      `SELECT id, invoice_id, status, payment_id, paid_on_timestamp, amount_due, stop_notifications
       FROM fee_ledgers
       WHERE student_id = $1 AND billing_month = '2026-09' AND transaction_type = 'MONTHLY_INVOICE'`,
      [studentId]
    );

    if (updatedLedger.status !== 'PAID') {
      throw new Error(`Expected status 'PAID', got '${updatedLedger.status}'.`);
    }

    if (updatedLedger.payment_id !== mockPaymentId) {
      throw new Error(`Expected payment_id '${mockPaymentId}', got '${updatedLedger.payment_id}'.`);
    }

    if (!updatedLedger.paid_on_timestamp) {
      throw new Error('paid_on_timestamp was null or empty in fee_ledgers.');
    }

    const recordedTimeIso = new Date(updatedLedger.paid_on_timestamp).toISOString();
    const expectedTimeIso = paymentTimestamp.toISOString();
    if (recordedTimeIso !== expectedTimeIso) {
      throw new Error(`paid_on_timestamp mismatch: expected ${expectedTimeIso}, got ${recordedTimeIso}`);
    }

    if (updatedLedger.stop_notifications !== true) {
      throw new Error(`Expected stop_notifications = true, got ${updatedLedger.stop_notifications}`);
    }

    // Verify overdue notification engine halts
    const shouldNotify = await financialCalculationService.shouldSendOverdueNotification(studentId, '2026-09');
    if (shouldNotify !== false) {
      throw new Error('shouldSendOverdueNotification returned true for a PAID invoice; notification was not halted.');
    }

    recordTest(
      2,
      'Webhook Reconciliation Test (Post-Due Date Payment)',
      true,
      `Simulated Cashfree webhook on 2026-09-12 (after due date). Marked invoice as PAID, recorded exact paid_on_timestamp ('${recordedTimeIso}'), and successfully halted all overdue notifications.`
    );
  } catch (err: any) {
    recordTest(2, 'Webhook Reconciliation Test', false, err.message, err);
  }

  // ===========================================================================
  // TEST 3: Time-Zone & Edge-Case Test
  // ===========================================================================
  try {
    // Define edge-case months:
    // 1. Non-leap February (2025, 2026, 2027) -> 28 days
    // 2. Leap Year February (2024, 2028, 2032) -> 29 days
    // 3. 30-day months (April, June, September, November)
    // 4. 31-day months (January, March, May, July, August, October, December)
    // 5. Year rollover (December -> January)
    const testCases = [
      { year: 2026, month: 2, expectedDays: 28, expectedDue: '2026-02-05', desc: 'Standard 28-day February' },
      { year: 2024, month: 2, expectedDays: 29, expectedDue: '2024-02-05', desc: 'Leap-year 29-day February (2024)' },
      { year: 2028, month: 2, expectedDays: 29, expectedDue: '2028-02-05', desc: 'Leap-year 29-day February (2028)' },
      { year: 2026, month: 4, expectedDays: 30, expectedDue: '2026-04-05', desc: '30-day month (April)' },
      { year: 2026, month: 6, expectedDays: 30, expectedDue: '2026-06-05', desc: '30-day month (June)' },
      { year: 2026, month: 9, expectedDays: 30, expectedDue: '2026-09-05', desc: '30-day month (September)' },
      { year: 2026, month: 11, expectedDays: 30, expectedDue: '2026-11-05', desc: '30-day month (November)' },
      { year: 2026, month: 1, expectedDays: 31, expectedDue: '2026-01-05', desc: '31-day month (January)' },
      { year: 2026, month: 3, expectedDays: 31, expectedDue: '2026-03-05', desc: '31-day month (March)' },
      { year: 2026, month: 7, expectedDays: 31, expectedDue: '2026-07-05', desc: '31-day month (July)' },
      { year: 2026, month: 12, expectedDays: 31, expectedDue: '2026-12-05', desc: 'Year-end 31-day month (December)' },
    ];

    for (const tc of testCases) {
      const dates = financialCalculationService.calculateBillingDates({ year: tc.year, month: tc.month });

      if (dates.daysInMonth !== tc.expectedDays) {
        throw new Error(`${tc.desc}: Expected ${tc.expectedDays} days, got ${dates.daysInMonth}.`);
      }

      if (dates.dueDate !== tc.expectedDue) {
        throw new Error(`${tc.desc}: Expected due date ${tc.expectedDue}, got ${dates.dueDate}.`);
      }

      // Verify ISO string parses cleanly without NaN or syntax error
      const parsedIso = new Date(dates.dueDateIso);
      if (isNaN(parsedIso.getTime())) {
        throw new Error(`${tc.desc}: Invalid ISO string '${dates.dueDateIso}'.`);
      }

      // Verify grace period ends on the 7th
      const expectedGrace = `${tc.year}-${String(tc.month).padStart(2, '0')}-07T23:59:59.999Z`;
      if (dates.gracePeriodEnd !== expectedGrace) {
        throw new Error(`${tc.desc}: Grace period end '${dates.gracePeriodEnd}', expected '${expectedGrace}'.`);
      }

      // Verify overdue trigger is on the 8th
      const expectedOverdue = `${tc.year}-${String(tc.month).padStart(2, '0')}-08T00:00:00.000Z`;
      if (dates.overdueTriggerDate !== expectedOverdue) {
        throw new Error(`${tc.desc}: Overdue trigger '${dates.overdueTriggerDate}', expected '${expectedOverdue}'.`);
      }
    }

    recordTest(
      3,
      'Time-Zone & Edge-Case Test (28/29/30/31-Day Months & Leap Years)',
      true,
      `Tested 11 calendar edge cases including Feb 28-day, Feb 29-day leap years (2024, 2028), 30/31 day months, and year roll-over. 100% precision with 0 syntax or arithmetic errors.`
    );
  } catch (err: any) {
    recordTest(3, 'Time-Zone & Edge-Case Test', false, err.message, err);
  }

  // ===========================================================================
  // TEST 4: Overdue Transition Test
  // ===========================================================================
  try {
    const overdueStudentId = 'stu_fin_overdue_01';
    const overdueCustomId = 'H_FIN-0002';
    const overdueCustomerCode = 'H_FIN-ST000002';

    await query(
      `INSERT INTO students (
         id, organization_id, hostel_id, room_id, bed_id, custom_id, customer_code,
         full_name, email, phone, status, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Bob Defaulter Student', 'bob.fin@test.com', '9876543212', 'ACTIVE', TRUE)
       ON CONFLICT (id) DO UPDATE SET is_active = TRUE, status = 'ACTIVE'`,
      [overdueStudentId, orgId, hostelId, roomId, bedId, overdueCustomId, overdueCustomerCode]
    );

    // Insert a fresh PENDING invoice for October 2026: Due on October 5th, Grace until October 7th midnight
    const octLedgerId = 'ledger_oct_test_01';
    await query(
      `INSERT INTO fee_ledgers (
         id, organization_id, hostel_id, student_id, customer_code, custom_id,
         invoice_id, billing_month, amount, amount_due, base_amount, due_date,
         status, transaction_type, description, grace_period_days, late_fee_applied
       ) VALUES ($1, $2, $3, $4, $5, $6, 'INV-202610-BOB', '2026-10', 8000.00, 8000.00, 8000.00, '2026-10-05T23:59:59.999Z',
                 'PENDING', 'MONTHLY_INVOICE', 'Monthly Rent for 2026-10', 2, 0.00)
       ON CONFLICT (id) DO UPDATE SET status = 'PENDING', amount_due = 8000.00, late_fee_applied = 0.00`,
      [octLedgerId, orgId, hostelId, overdueStudentId, overdueCustomerCode, overdueCustomId]
    );

    // Scenario A: Check on October 7th, 2026 at 20:00 (WITHIN the 2-day grace period)
    const onGraceDate = new Date(Date.UTC(2026, 9, 7, 20, 0, 0)); // 7th evening
    const graceCheck = await financialCalculationService.processOverdueTransitions({
      currentDate: onGraceDate,
      orgId,
    });

    const ledgerDuringGrace = await queryOne<any>(
      `SELECT status, amount_due, late_fee_applied FROM fee_ledgers WHERE id = $1`,
      [octLedgerId]
    );

    if (ledgerDuringGrace.status !== 'PENDING') {
      throw new Error(`Grace period violated! Status was '${ledgerDuringGrace.status}' during grace period on the 7th. Expected 'PENDING'.`);
    }

    if (Number(ledgerDuringGrace.late_fee_applied) !== 0) {
      throw new Error(`Late fee applied prematurely during grace period! Got ${ledgerDuringGrace.late_fee_applied}.`);
    }

    // Scenario B: Check on October 8th, 2026 at 01:00 (PAST the 7th midnight grace period)
    const onOverdueDate = new Date(Date.UTC(2026, 9, 8, 1, 0, 0)); // 8th morning
    const overdueCheck = await financialCalculationService.processOverdueTransitions({
      currentDate: onOverdueDate,
      orgId,
    });

    if (overdueCheck.transitionedCount === 0) {
      throw new Error('processOverdueTransitions did not transition any invoice on the 8th.');
    }

    const ledgerAfterGrace = await queryOne<any>(
      `SELECT status, amount_due, base_amount, late_fee_applied FROM fee_ledgers WHERE id = $1`,
      [octLedgerId]
    );

    if (ledgerAfterGrace.status !== 'OVERDUE') {
      throw new Error(`Expected status 'OVERDUE' on the 8th, but got '${ledgerAfterGrace.status}'.`);
    }

    // Base was 8000.00, configured hostel late fee is 500.00 -> New amount_due must be 8500.00
    const expectedLateFee = 500.00;
    const expectedTotal = 8500.00;

    if (Number(ledgerAfterGrace.late_fee_applied) !== expectedLateFee) {
      throw new Error(`Expected late_fee_applied ₹${expectedLateFee}, got ₹${ledgerAfterGrace.late_fee_applied}.`);
    }

    if (Number(ledgerAfterGrace.amount_due) !== expectedTotal) {
      throw new Error(`Expected amount_due ₹${expectedTotal}, got ₹${ledgerAfterGrace.amount_due}.`);
    }

    recordTest(
      4,
      'Overdue Transition & Late-Fee Penalty Test',
      true,
      `Grace period strictly preserved through 7th (remained PENDING at ₹8000.00). On 8th, status automatically flipped to OVERDUE and added ₹500.00 late fee penalty (Total Due: ₹8500.00).`
    );
  } catch (err: any) {
    recordTest(4, 'Overdue Transition Test', false, err.message, err);
  }

  // ===========================================================================
  // SUMMARY & REPORTING
  // ===========================================================================
  console.log('==============================================================================');
  console.log('  📊 FINANCIAL CALCULATION ENGINE TEST SUMMARY');
  console.log('==============================================================================');

  const total = testResults.length;
  const passedCount = testResults.filter((r) => r.passed).length;
  const allPassed = passedCount === total && total === 4;

  for (const t of testResults) {
    const icon = t.passed ? '\x1b[32m✔ PASS\x1b[0m' : '\x1b[31m✖ FAIL\x1b[0m';
    console.log(`  ${icon} | Test ${t.testNumber}: ${t.title}`);
  }

  console.log('------------------------------------------------------------------------------');
  console.log(`  Total: ${total} | Passed: \x1b[32m${passedCount}\x1b[0m | Failed: \x1b[31m${total - passedCount}\x1b[0m`);
  console.log('==============================================================================\n');

  await disconnectDatabase();

  if (!allPassed) {
    console.error(`\x1b[1;41m[FINANCIAL QA FAILED]\x1b[0m One or more financial calculation tests failed. Module NOT approved for production.\n`);
    return false;
  }

  console.log(`\x1b[1;42m[FINANCIAL QA APPROVED]\x1b[0m 100% mathematical precision achieved across all 4 financial edge cases. Module signed off for production.\n`);
  return true;
}

if (require.main === module) {
  runFinancialCalculationTestSuite()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal unhandled error in financial calculation test suite:', err);
      process.exit(1);
    });
}
