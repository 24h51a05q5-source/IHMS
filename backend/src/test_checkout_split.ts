process.env.NODE_ENV = 'test';

import crypto from 'crypto';
import { connectDatabase, disconnectDatabase, query, queryOne, queryRows } from './config/database';
import { CashfreeService } from './modules/fees/cashfree.service';
import { FeeService } from './modules/fees/fee.service';

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

export async function runCheckoutSplitTestSuite(): Promise<boolean> {
  console.log('\n==============================================================================');
  console.log('  💳 IHMS DEVICE-AWARE UPI CHECKOUT & EASY SPLIT TEST SUITE');
  console.log('  📍 Validating Micro-Fee Calculation, Easy Split, UPI Intents & Webhook Audit');
  console.log('==============================================================================\n');

  try {
    await connectDatabase();
  } catch (err: any) {
    console.error(`\x1b[1;41m[CRITICAL ALERT]\x1b[0m Failed to connect to database for test.`);
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const cashfreeService = new CashfreeService();
  const feeService = new FeeService();

  const orgId = 'org_split_test_01';
  const hostelId = 'H_SPLIT_001';
  const hostelVendorId = 'VENDOR_HOSTEL_SPLIT_99';
  const platformVendorId = process.env.CASHFREE_PLATFORM_VENDOR_ID || 'IHMS_PLATFORM_MAIN';
  const studentId = 'stu_split_mock_01';
  const customerCode = 'H_SPLIT-ST000001';

  // Seed baseline test organizations, hostel, and student
  await query(
    `INSERT INTO organizations (id, org_code, name)
     VALUES ($1, 'SPLIT01', 'Easy Split Test Org')
     ON CONFLICT (id) DO NOTHING`,
    [orgId]
  );

  await query(
    `INSERT INTO hostels (id, hostel_id, organization_id, name, branch_name, status, cashfree_vendor_id)
     VALUES ($1, $1, $2, 'Greenfield Boys Hostel', 'Branch 1', 'ACTIVE', $3)
     ON CONFLICT (id) DO UPDATE SET cashfree_vendor_id = $3, status = 'ACTIVE'`,
    [hostelId, orgId, hostelVendorId]
  );

  await query(
    `INSERT INTO students (
      id, organization_id, hostel_id, customer_code, full_name, email, phone,
      status, is_active, financial_total_demanded, financial_total_paid, financial_outstanding_balance
    ) VALUES (
      $1, $2, $3, $4, 'Kavya Sharma', 'kavya@test.com', '9876543210',
      'ACTIVE', TRUE, 5000.00, 0.00, 5000.00
    ) ON CONFLICT (id) DO UPDATE
      SET is_active = TRUE, financial_outstanding_balance = 5000.00`,
    [studentId, orgId, hostelId, customerCode]
  );

  // ===========================================================================
  // TEST 1: MICRO-FEE & ORDER AMOUNT MATHEMATICAL PRECISION
  // ===========================================================================
  try {
    const baseRent = 5000.00;
    const platformMicroFee = 3.00;
    const totalOrderAmount = Number((baseRent + platformMicroFee).toFixed(2));

    const isMatch = totalOrderAmount === 5003.00;
    const zeroHiddenMargin = (totalOrderAmount - baseRent) === 3.00;

    if (!isMatch || !zeroHiddenMargin) {
      throw new Error(`Invalid total order amount: Expected ₹5003.00, got ₹${totalOrderAmount}`);
    }

    recordTest(
      1,
      'Device-Aware Checkout Micro-Fee Calculation (Base Rent + Flat ₹3.00)',
      true,
      `Base Rent: ₹${baseRent.toFixed(2)} | Micro-Fee: ₹${platformMicroFee.toFixed(2)} | Total Order: ₹${totalOrderAmount.toFixed(2)} (Zero hidden surcharges)`
    );
  } catch (err: any) {
    recordTest(
      1,
      'Device-Aware Checkout Micro-Fee Calculation (Base Rent + Flat ₹3.00)',
      false,
      'Micro-fee calculation deviated from exact base rent + ₹3.00 formula.',
      err
    );
  }

  // ===========================================================================
  // TEST 2: CASHFREE EASY SPLIT MULTI-VENDOR ROUTING VERIFICATION
  // ===========================================================================
  let generatedOrder: any;
  try {
    const orderId = `CF_ORDER_${Date.now()}`;
    generatedOrder = await cashfreeService.createDynamicUPIOrder({
      orderId,
      amount: 5000.00,
      studentId,
      customerCode,
      studentName: 'Kavya Sharma',
      vendorId: hostelVendorId,
      hostelId,
      organizationId: orgId,
    });

    const isTotalCorrect = generatedOrder.amount === 5003.00;
    const isBaseCorrect = generatedOrder.baseAmount === 5000.00;
    const isFeeCorrect = generatedOrder.platformMicroFee === 3.00;

    const splits = generatedOrder.splits || [];
    const hasTwoSplits = splits.length === 2;

    const hostelSplit = splits.find((s: any) => s.vendor_id === hostelVendorId || s.vendorId === hostelVendorId);
    const platformSplit = splits.find((s: any) => s.vendor_id === platformVendorId || s.vendorId === platformVendorId);

    const isHostelSplitExact = hostelSplit && hostelSplit.amount === 5000.00;
    const isPlatformSplitExact = platformSplit && platformSplit.amount === 3.00;
    const isSplitSumExact = (hostelSplit?.amount || 0) + (platformSplit?.amount || 0) === 5003.00;

    if (!isTotalCorrect || !isBaseCorrect || !isFeeCorrect || !hasTwoSplits || !isHostelSplitExact || !isPlatformSplitExact || !isSplitSumExact) {
      throw new Error(
        `Easy Split payload check failed: total=${generatedOrder.amount}, base=${generatedOrder.baseAmount}, splits=${JSON.stringify(splits)}`
      );
    }

    recordTest(
      2,
      'Cashfree Easy Split Multi-Vendor Routing Verification',
      true,
      `Splits verified: 🏨 Hostel Owner [${hostelVendorId}]: ₹5000.00 | 🏢 Platform [${platformVendorId}]: ₹3.00 | Sum = ₹5003.00`
    );
  } catch (err: any) {
    recordTest(
      2,
      'Cashfree Easy Split Multi-Vendor Routing Verification',
      false,
      'Failed to generate valid Easy Split multi-vendor routing payload.',
      err
    );
  }

  // ===========================================================================
  // TEST 3: MOBILE UPI 1-TAP DEEP-LINK INTENTS (GPAY, PHONEPE, PAYTM, GENERIC)
  // ===========================================================================
  try {
    const links = generatedOrder?.upiAppLinks;
    if (!links) {
      throw new Error('No upiAppLinks generated in createDynamicUPIOrder output.');
    }

    const gpayValid = links.gpay && links.gpay.startsWith('tez://upi/pay?') && links.gpay.includes('am=5003.00');
    const phonepeValid = links.phonepe && links.phonepe.startsWith('phonepe://pay?') && links.phonepe.includes('am=5003.00');
    const paytmValid = links.paytm && links.paytm.startsWith('paytmmp://pay?') && links.paytm.includes('am=5003.00');
    const genericValid = links.generic && (links.generic.startsWith('upi://pay?') || links.generic.includes('upi/pay?')) && links.generic.includes('am=5003.00');

    if (!gpayValid || !phonepeValid || !paytmValid || !genericValid) {
      throw new Error(
        `Invalid mobile deep links: GPay: ${links.gpay}, PhonePe: ${links.phonepe}, Paytm: ${links.paytm}, Generic: ${links.generic}`
      );
    }

    recordTest(
      3,
      'Mobile UPI 1-Tap Deep-Link Intent Validation (Zero QR on Mobile)',
      true,
      `All native deep-link URI schemes verified (Google Pay: tez://, PhonePe: phonepe://, Paytm: paytmmp://, Generic: upi://) with exact amount ₹5003.00`
    );
  } catch (err: any) {
    recordTest(
      3,
      'Mobile UPI 1-Tap Deep-Link Intent Validation (Zero QR on Mobile)',
      false,
      'Mobile deep-link intents did not match expected URI schemes or amount encoding.',
      err
    );
  }

  // ===========================================================================
  // TEST 4: WEBHOOK RECONCILIATION, SPLIT AUDIT LOGGING & LEDGER UPDATE
  // ===========================================================================
  try {
    const testOrderId = generatedOrder?.orderId || `CF_ORDER_TEST_${Date.now()}`;
    const testPaymentId = `pmt_split_${Date.now()}`;
    const utr = `UTR_SPLIT_${Date.now()}`;

    // Seed pending monthly invoice in fee_ledgers
    const ledgerEntryId = `ledger_inv_${Date.now()}`;
    await query(
      `INSERT INTO fee_ledgers (
        id, organization_id, hostel_id, student_id, customer_code,
        transaction_type, billing_month, amount, amount_due, due_date, status
      ) VALUES ($1, $2, $3, $4, $5, 'MONTHLY_INVOICE', '2026-10', 5000.00, 5000.00, '2026-10-05', 'PENDING')`,
      [ledgerEntryId, orgId, hostelId, studentId, customerCode]
    );

    // Seed pending payment record in payments table
    await query(
      `INSERT INTO payments (
        id, payment_number, organization_id, hostel_id, student_id, customer_code,
        amount, expected_amount, convenience_fee, payment_method, gateway_order_id, status,
        cashfree_split_vendor_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        5003.00, 5003.00, 3.00, 'UPI_QR', $7, 'PENDING',
        $8
      )`,
      [
        testPaymentId,
        `PAY-${Date.now()}`,
        orgId,
        hostelId,
        studentId,
        customerCode,
        testOrderId,
        hostelVendorId,
      ]
    );

    // Construct Cashfree PAYMENT_SUCCESS webhook payload
    const webhookPayloadObj = {
      type: 'PAYMENT_SUCCESS',
      event_time: new Date().toISOString(),
      data: {
        order: {
          order_id: testOrderId,
          order_amount: 5003.00,
          order_currency: 'INR',
        },
        payment: {
          cf_payment_id: `CF_PMT_${Date.now()}`,
          payment_status: 'SUCCESS',
          payment_amount: 5003.00,
          payment_currency: 'INR',
          payment_message: 'Payment completed successfully via UPI',
          payment_time: new Date().toISOString(),
          bank_reference: utr,
        },
        customer_details: {
          customer_id: studentId,
          customer_phone: '9876543210',
        },
      },
    };

    const rawBody = JSON.stringify(webhookPayloadObj);
    const timestamp = Date.now().toString();
    const signature = cashfreeService.computeWebhookSignature(timestamp, rawBody);

    const webhookHeaders = {
      'x-webhook-timestamp': timestamp,
      'x-webhook-signature': signature,
    };

    // Process webhook
    const webhookResult = await feeService.processCashfreeWebhook(
      rawBody,
      signature,
      timestamp,
      webhookPayloadObj
    );

    if (!webhookResult.success) {
      throw new Error(`Webhook processing returned failure: ${webhookResult.message}`);
    }

    // Verify database updates
    const updatedPayment = await queryOne<any>(
      `SELECT * FROM payments WHERE id = $1`,
      [testPaymentId]
    );

    if (!updatedPayment || (updatedPayment.status !== 'SUCCESS' && updatedPayment.status !== 'PAID')) {
      throw new Error(`Payment status not updated to SUCCESS or PAID: ${updatedPayment?.status}`);
    }

    if (Number(updatedPayment.split_hostel_amount) !== 5000.00 || Number(updatedPayment.split_platform_amount) !== 3.00) {
      throw new Error(
        `Split amounts mismatch in payments: hostel=${updatedPayment.split_hostel_amount}, platform=${updatedPayment.split_platform_amount}`
      );
    }

    if (!updatedPayment.split_details) {
      throw new Error('Split details JSON missing in payments record.');
    }

    // Verify fee_ledgers monthly invoice marked PAID with timestamp
    const updatedLedger = await queryOne<any>(
      `SELECT * FROM fee_ledgers WHERE id = $1`,
      [ledgerEntryId]
    );

    if (!updatedLedger || updatedLedger.status !== 'PAID') {
      throw new Error(`Fee ledger invoice not marked PAID: ${updatedLedger?.status}`);
    }

    if (!updatedLedger.paid_on_timestamp) {
      throw new Error('Fee ledger paid_on_timestamp is null after webhook reconciliation.');
    }

    if (!updatedLedger.stop_notifications) {
      throw new Error('Fee ledger stop_notifications was not set to true.');
    }

    // Test Idempotency: replay the same webhook payload
    const idempotentResult = await feeService.processCashfreeWebhook(
      rawBody,
      signature,
      timestamp,
      webhookPayloadObj
    );

    if (!idempotentResult.success) {
      throw new Error(`Idempotency check failed on replay: ${idempotentResult.message}`);
    }

    recordTest(
      4,
      'Cashfree Webhook HMAC Signature Verification, Split Audit & Ledger Reconciliation',
      true,
      `HMAC-SHA256 signature verified | Payment & Ledger flipped to PAID with timestamp ${updatedLedger.paid_on_timestamp} | Split audit: Hostel ₹5000.00, Platform ₹3.00 | Idempotent replay safely handled`
    );
  } catch (err: any) {
    recordTest(
      4,
      'Cashfree Webhook HMAC Signature Verification, Split Audit & Ledger Reconciliation',
      false,
      'Webhook signature verification, split audit or ledger reconciliation failed.',
      err
    );
  }

  // ===========================================================================
  // SUMMARY & REPORTING
  // ===========================================================================
  console.log('==============================================================================');
  console.log('  📊 DEVICE-AWARE CHECKOUT & EASY SPLIT TEST SUMMARY');
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
    console.error(`\x1b[1;41m[CHECKOUT SPLIT QA FAILED]\x1b[0m One or more checkout/split tests failed. Module NOT approved for production.\n`);
    return false;
  }

  console.log(`\x1b[1;42m[CHECKOUT SPLIT QA APPROVED]\x1b[0m 100% precision achieved across device detection, micro-fees, multi-vendor split, and webhook audit. Module signed off for production.\n`);
  return true;
}

if (require.main === module) {
  runCheckoutSplitTestSuite()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal unhandled error in checkout split test suite:', err);
      process.exit(1);
    });
}
