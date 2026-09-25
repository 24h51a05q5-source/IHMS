import { query, queryOne } from './config/database';
import { runMigrations } from './config/migrations';
import { feeService } from './modules/fees/fee.service';
import crypto from 'crypto';

async function runAdvanceMaintenanceTestSuite() {
  console.log('====================================================');
  console.log('STARTING EXPANDED 18-TEST ADVANCE & MAINTENANCE SUITE');
  console.log('====================================================');

  await runMigrations();

  const testOrgId = 'ORG-TEST-' + Date.now();
  const testHostelId = 'IHMSAA9998';
  const testOwnerId = 'OWNER-' + Date.now();

  await query(
    `INSERT INTO organizations (id, org_code, name) VALUES ($1, $2, $3)`,
    [testOrgId, 'ORG-TEST-CODE-' + Date.now(), 'Test Org']
  );

  await query(
    `INSERT INTO hostels (id, hostel_id, branch_code, owner_id, organization_id, hostel_name, name, advance_enabled, advance_amount, annual_maintenance_enabled, annual_maintenance_amount)
     VALUES ($1, $2, $2, $3, $4, 'Test Hostel AA9998', 'Test Hostel AA9998', false, 0, false, 0)`,
    [testHostelId, testHostelId, testOwnerId, testOrgId]
  );

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail?: string) => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ' - ' + detail : ''}`);
      failed++;
    }
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Existing hostel with both features disabled remains 100% unchanged
    // ----------------------------------------------------
    const hostel1 = await queryOne<any>(
      `SELECT advance_enabled, annual_maintenance_enabled FROM hostels WHERE id = $1`,
      [testHostelId]
    );
    assert(
      hostel1?.advance_enabled === false && hostel1?.annual_maintenance_enabled === false,
      'Test 1: Existing hostel with both features disabled remains 100% unchanged'
    );

    // Create student A
    const studentAId = crypto.randomUUID();
    const custCodeA = 'IHMSAA9998-a001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email, financial_total_demanded, financial_total_paid, financial_outstanding_balance)
       VALUES ($1, $2, $2, $3, $4, 'Student A', 'a@test.com', 10000, 0, 10000)`,
      [studentAId, custCodeA, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, total_paid, balance_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 0, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentAId, custCodeA]
    );

    // ----------------------------------------------------
    // TEST 2: Owner enables Advance and Annual Maintenance
    // ----------------------------------------------------
    await query(
      `UPDATE hostels 
       SET advance_enabled = true, advance_amount = 10000, annual_maintenance_enabled = true, annual_maintenance_amount = 2000 
       WHERE id = $1`,
      [testHostelId]
    );
    const hostel2 = await queryOne<any>(
      `SELECT advance_enabled, advance_amount, annual_maintenance_enabled, annual_maintenance_amount FROM hostels WHERE id = $1`,
      [testHostelId]
    );
    assert(
      hostel2?.advance_enabled === true &&
        Number(hostel2?.advance_amount) === 10000 &&
        hostel2?.annual_maintenance_enabled === true &&
        Number(hostel2?.annual_maintenance_amount) === 2000,
      'Test 2: Owner enables Advance Fee and Annual Maintenance Fee policies'
    );

    // ----------------------------------------------------
    // TEST 3 & 4: Advance payment updates fee_accounts & does not increase monthly rent paid
    // ----------------------------------------------------
    await feeService.recordPayment(testOrgId, {
      studentId: studentAId,
      amount: 10000,
      feeType: 'ADVANCE',
      notes: 'Advance Fee Collection',
    });

    const feeAccA = await queryOne<any>(
      `SELECT advance_credit, advance_balance, advance_applied, total_paid FROM fee_accounts WHERE student_id = $1`,
      [studentAId]
    );
    assert(
      Number(feeAccA?.advance_credit) === 10000 &&
        Number(feeAccA?.advance_balance) === 10000 &&
        Number(feeAccA?.advance_applied) === 0,
      'Test 3: Advance payment updates fee_accounts credit & balance as single source of truth'
    );
    assert(
      Number(feeAccA?.total_paid) === 0,
      'Test 4: Advance payment does NOT increase monthly rent paid'
    );

    // ----------------------------------------------------
    // TEST 5: Annual Maintenance payment for one academic period works
    // ----------------------------------------------------
    await feeService.recordPayment(testOrgId, {
      studentId: studentAId,
      amount: 2000,
      feeType: 'ANNUAL_MAINTENANCE',
      academicPeriod: '2026-2027',
      notes: 'Annual Maintenance 2026-2027',
    } as any);

    const maintDemand = await queryOne<any>(
      `SELECT * FROM fee_demands WHERE student_id = $1 AND academic_period = '2026-2027'`,
      [studentAId]
    );
    assert(
      maintDemand && maintDemand.status === 'PAID' && Number(maintDemand.total_amount) === 2000,
      'Test 5: Annual Maintenance payment for one academic period 2026-2027 works'
    );

    // ----------------------------------------------------
    // TEST 6: Duplicate Annual Maintenance for same student + period is blocked
    // ----------------------------------------------------
    let duplicatePrevented = false;
    try {
      await feeService.recordPayment(testOrgId, {
        studentId: studentAId,
        amount: 2000,
        feeType: 'ANNUAL_MAINTENANCE',
        academicPeriod: '2026-2027',
      } as any);
    } catch (err: any) {
      if (err.message && (err.message.includes('already been') || err.message.includes('paid'))) {
        duplicatePrevented = true;
      }
    }
    assert(
      duplicatePrevented,
      'Test 6: Duplicate Annual Maintenance for same student + period 2026-2027 is blocked'
    );

    // ----------------------------------------------------
    // TEST 7: Annual Maintenance for next academic period is allowed
    // ----------------------------------------------------
    await feeService.recordPayment(testOrgId, {
      studentId: studentAId,
      amount: 2000,
      feeType: 'ANNUAL_MAINTENANCE',
      academicPeriod: '2027-2028',
    } as any);
    const maintDemandNext = await queryOne<any>(
      `SELECT * FROM fee_demands WHERE student_id = $1 AND academic_period = '2027-2028'`,
      [studentAId]
    );
    assert(
      maintDemandNext && maintDemandNext.status === 'PAID',
      'Test 7: Annual Maintenance for next academic period 2027-2028 is allowed'
    );

    // ----------------------------------------------------
    // TEST 8: Exact one-month final-term advance application
    // ----------------------------------------------------
    const applyResult = await feeService.applyFinalMonthAdvance(testOrgId, studentAId, 1);
    const feeAccAAfter = await queryOne<any>(
      `SELECT advance_balance, advance_applied FROM fee_accounts WHERE student_id = $1`,
      [studentAId]
    );
    assert(
      applyResult.applied === 10000 &&
        Number(feeAccAAfter?.advance_balance) === 0 &&
        Number(feeAccAAfter?.advance_applied) === 10000,
      'Test 8: Exact one-month final-term advance application covers fee and sets advance_balance to 0'
    );

    // ----------------------------------------------------
    // TEST 9: Partial advance application
    // ----------------------------------------------------
    const studentBId = crypto.randomUUID();
    const custCodeB = 'IHMSAA9998-b001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student B', 'b@test.com')`,
      [studentBId, custCodeB, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentBId, custCodeB]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentBId,
      amount: 5000,
      feeType: 'ADVANCE',
    });

    const partialApply = await feeService.applyFinalMonthAdvance(testOrgId, studentBId, 1);
    assert(
      partialApply.applied === 5000 && partialApply.netPayable === 5000 && partialApply.advanceBalance === 0,
      'Test 9: Partial advance application (Advance = ₹5,000, Monthly Fee = ₹10,000 -> Net Payable = ₹5,000)'
    );

    // ----------------------------------------------------
    // TEST 10: Multi-month advance application
    // ----------------------------------------------------
    const studentMId = crypto.randomUUID();
    const custCodeM = 'IHMSAA9998-m001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student Multi', 'm@test.com')`,
      [studentMId, custCodeM, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 20000, 10000, 2, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentMId, custCodeM]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentMId,
      amount: 20000,
      feeType: 'ADVANCE',
    });
    const multiApply = await feeService.applyFinalMonthAdvance(testOrgId, studentMId, 1);
    assert(
      multiApply.applied === 20000 && multiApply.advanceBalance === 0,
      'Test 10: Multi-month advance application (₹20,000 advance covers 2 final ₹10,000 installments)'
    );

    // ----------------------------------------------------
    // TEST 11: No reliable end-term/installment data -> advance remains unapplied
    // ----------------------------------------------------
    const studentCId = crypto.randomUUID();
    const custCodeC = 'IHMSAA9998-c001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student C (Open-Ended)', 'c@test.com')`,
      [studentCId, custCodeC, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 0, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentCId, custCodeC]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentCId,
      amount: 10000,
      feeType: 'ADVANCE',
    });

    const noEndDateApply = await feeService.applyFinalMonthAdvance(testOrgId, studentCId, 1);
    const feeAccC = await queryOne<any>(
      `SELECT advance_balance FROM fee_accounts WHERE student_id = $1`,
      [studentCId]
    );
    assert(
      noEndDateApply.applied === 0 && Number(feeAccC?.advance_balance) === 10000,
      'Test 11: No reliable end-term/installment data -> advance remains unapplied'
    );

    // ----------------------------------------------------
    // TEST 12: Repeated advance calculation cannot apply advance twice
    // ----------------------------------------------------
    const doubleApplyResult = await feeService.applyFinalMonthAdvance(testOrgId, studentAId, 1);
    const feeAccADouble = await queryOne<any>(
      `SELECT advance_balance, advance_applied FROM fee_accounts WHERE student_id = $1`,
      [studentAId]
    );
    assert(
      doubleApplyResult.applied === 0 && Number(feeAccADouble?.advance_balance) === 0,
      'Test 12: Repeated advance calculation cannot apply advance twice'
    );

    // ----------------------------------------------------
    // TEST 13: Advance balance never becomes negative
    // ----------------------------------------------------
    assert(
      Number(feeAccADouble?.advance_balance) >= 0 && Number(feeAccC?.advance_balance) >= 0,
      'Test 13: Advance balance never becomes negative'
    );

    // ----------------------------------------------------
    // TEST 14: Advance greater than remaining eligible fees leaves excess balance
    // ----------------------------------------------------
    const studentDId = crypto.randomUUID();
    const custCodeD = 'IHMSAA9998-d001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student D', 'd@test.com')`,
      [studentDId, custCodeD, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentDId, custCodeD]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentDId,
      amount: 20000,
      feeType: 'ADVANCE',
    });

    const excessApply = await feeService.applyFinalMonthAdvance(testOrgId, studentDId, 1);
    assert(
      excessApply.applied === 10000 && excessApply.advanceBalance === 10000,
      'Test 14: Advance greater than remaining eligible fees leaves excess balance'
    );

    // ----------------------------------------------------
    // TEST 15: Final-month net payable = 0 is not overdue
    // ----------------------------------------------------
    const studentEId = crypto.randomUUID();
    const custCodeE = 'IHMSAA9998-e001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student E', 'e@test.com')`,
      [studentEId, custCodeE, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentEId, custCodeE]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentEId,
      amount: 10000,
      feeType: 'ADVANCE',
    });
    await feeService.applyFinalMonthAdvance(testOrgId, studentEId, 1);

    const studentEObj = await queryOne<any>(
      `SELECT financial_outstanding_balance FROM students WHERE id = $1`,
      [studentEId]
    );
    assert(
      Number(studentEObj?.financial_outstanding_balance) === 0,
      'Test 15: Final-month net payable = 0 is not overdue (outstanding = 0)'
    );

    // ----------------------------------------------------
    // TEST 16: Policy Disable Must Not Destroy History
    // ----------------------------------------------------
    await query(
      `UPDATE hostels SET advance_enabled = false, annual_maintenance_enabled = false WHERE id = $1`,
      [testHostelId]
    );
    const feeAccEHistory = await queryOne<any>(
      `SELECT advance_credit, advance_balance, advance_applied FROM fee_accounts WHERE student_id = $1`,
      [studentEId]
    );
    const maintHistory = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM fee_demands WHERE student_id = $1 AND fee_structure_id = 'ANNUAL_MAINTENANCE'`,
      [studentAId]
    );
    assert(
      Number(feeAccEHistory?.advance_applied) === 10000 && Number(maintHistory?.count) >= 2,
      'Test 16: Disabling fee policy does NOT destroy historical advance or maintenance records'
    );

    // ----------------------------------------------------
    // TEST 17: Concurrent advance application cannot double-consume the same balance
    // ----------------------------------------------------
    const studentConcId = crypto.randomUUID();
    const custCodeConc = 'IHMSAA9998-conc001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student Concurrent', 'conc@test.com')`,
      [studentConcId, custCodeConc, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentConcId, custCodeConc]
    );
    await feeService.recordPayment(testOrgId, {
      studentId: studentConcId,
      amount: 10000,
      feeType: 'ADVANCE',
    });

    const [concRes1, concRes2] = await Promise.all([
      feeService.applyFinalMonthAdvance(testOrgId, studentConcId, 1),
      feeService.applyFinalMonthAdvance(testOrgId, studentConcId, 1),
    ]);
    const feeAccConc = await queryOne<any>(
      `SELECT advance_balance, advance_applied FROM fee_accounts WHERE student_id = $1`,
      [studentConcId]
    );
    const sumApplied = (concRes1?.applied || 0) + (concRes2?.applied || 0);
    const finalBal = Number(feeAccConc?.advance_balance || 0);
    const test17Passed = sumApplied === 10000 && finalBal === 0;
    if (!test17Passed) {
      console.log('Test 17 debug:', { concRes1, concRes2, feeAccConc, sumApplied, finalBal });
    }
    assert(
      test17Passed,
      'Test 17: Concurrent advance application cannot double-consume the same balance'
    );

    // ----------------------------------------------------
    // TEST 18: Partial Annual Maintenance payment leaves remaining due & later completes demand
    // ----------------------------------------------------
    const studentPId = crypto.randomUUID();
    const custCodeP = 'IHMSAA9998-p001';
    await query(
      `INSERT INTO students (id, student_id, customer_code, organization_id, hostel_id, full_name, email)
       VALUES ($1, $2, $2, $3, $4, 'Student Partial Maint', 'p@test.com')`,
      [studentPId, custCodeP, testOrgId, testHostelId]
    );
    await query(
      `INSERT INTO fee_accounts (id, organization_id, hostel_id, student_id, customer_code, total_fee, monthly_amount, number_of_installments, paid_installments)
       VALUES ($1, $2, $3, $4, $5, 10000, 10000, 1, 0)`,
      [crypto.randomUUID(), testOrgId, testHostelId, studentPId, custCodeP]
    );

    // 1st partial payment of ₹1,000 for ₹2,000 annual maintenance demand
    await feeService.recordPayment(testOrgId, {
      studentId: studentPId,
      amount: 1000,
      feeType: 'ANNUAL_MAINTENANCE',
      academicPeriod: '2026-2027',
    } as any);

    const partialMaint1 = await queryOne<any>(
      `SELECT * FROM fee_demands WHERE student_id = $1 AND academic_period = '2026-2027'`,
      [studentPId]
    );
    assert(
      partialMaint1 && partialMaint1.status === 'PARTIAL' && Number(partialMaint1.balance_amount) === 1000,
      'Test 18a: Partial Annual Maintenance payment leaves remaining due balance'
    );

    // 2nd payment of ₹1,000 completing the same demand
    await feeService.recordPayment(testOrgId, {
      studentId: studentPId,
      amount: 1000,
      feeType: 'ANNUAL_MAINTENANCE',
      academicPeriod: '2026-2027',
    } as any);

    const partialMaint2 = await queryOne<any>(
      `SELECT * FROM fee_demands WHERE student_id = $1 AND academic_period = '2026-2027'`,
      [studentPId]
    );
    const countDemandsP = await queryOne<any>(
      `SELECT COUNT(*)::int as count FROM fee_demands WHERE student_id = $1 AND academic_period = '2026-2027'`,
      [studentPId]
    );
    assert(
      partialMaint2 && partialMaint2.status === 'PAID' && Number(partialMaint2.balance_amount) === 0 && Number(countDemandsP?.count) === 1,
      'Test 18b: 2nd payment completes billing-period demand without creating a duplicate demand'
    );

    console.log('====================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  }
}

runAdvanceMaintenanceTestSuite();
