import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase, query, queryOne } from './config/database';
import { runMigrations } from './config/migrations';
import { BedStatus, ComplaintPriority, PaymentMethod, UserRole } from './config/constants';
import { generateQrDataUrl } from './common/utils/qr-generator';

export async function runSeed() {
  console.log('[Seed] Connecting to PostgreSQL database & running migrations...');
  await connectDatabase();
  await runMigrations();

  console.log('[Seed] Clearing existing relational tables...');
  const tables = [
    'announcement_reads',
    'announcements',
    'meal_attendances',
    'mess_menus',
    'vouchers',
    'expenses',
    'visitors',
    'complaints',
    'leave_requests',
    'attendances',
    'receipts',
    'payments',
    'fee_installments',
    'fee_demands',
    'fee_accounts',
    'student_transfers',
    'room_allocations',
    'students',
    'beds',
    'rooms',
    'owners',
    'users',
    'hostels',
    'organizations',
    'counters',
    'receipt_sequences',
    'assets',
    'notifications',
    'audit_logs',
  ];

  for (const table of tables) {
    try {
      await query(`DELETE FROM ${table}`);
    } catch (e) {
      // table might not exist yet
    }
  }

  console.log('[Seed] Creating Organization & Owner...');
  const orgId = require('crypto').randomUUID();
  await query(
    `INSERT INTO organizations (
      id, org_code, name, email, phone, currency, tax_gstin, subscription_tier, status
    ) VALUES ($1, 'ORG-1001', 'Green Valley Hostels Pvt Ltd', 'admin@greenvalleyhostels.com', '+91 9848012345', 'INR', '36AAACG1234F1Z5', 'ENTERPRISE', 'ACTIVE')`,
    [orgId]
  );

  const defaultPasswordHash = await bcrypt.hash('Admin@123', 10);

  // Super Admin
  await query(
    `INSERT INTO users (
      id, user_id, organization_id, name, email, password_hash, role, phone, staff_code, status
    ) VALUES ($1, 'SUP-1001', $2, 'Global Super Admin', 'superadmin@ihms.com', $3, 'SUPER_ADMIN', '+91 9848000000', 'SUP-1001', 'ACTIVE')`,
    [require('crypto').randomUUID(), orgId, defaultPasswordHash]
  );

  // Owner User
  const ownerUserId = require('crypto').randomUUID();
  const ownerIhmsId = 'IHM-GV-MN-H-0001';
  await query(
    `INSERT INTO users (
      id, user_id, ihms_id, organization_id, name, email, password_hash, role, phone, owner_id, staff_code, status
    ) VALUES ($1, $2, $2, $3, 'Rajesh Varma (Owner)', 'owner@ihms.com', $4, 'OWNER', '+91 9848011111', $2, $2, 'ACTIVE')`,
    [ownerUserId, ownerIhmsId, orgId, defaultPasswordHash]
  );

  // Admin alias user
  await query(
    `INSERT INTO users (
      id, user_id, ihms_id, organization_id, name, email, password_hash, role, phone, owner_id, staff_code, status
    ) VALUES ($1, 'IHM-GV-MN-H-0002', 'IHM-GV-MN-H-0002', $2, 'Hostel Admin', 'admin@ihms.com', $3, 'OWNER', '+91 9848011112', 'IHM-GV-MN-H-0001', 'IHM-GV-MN-H-0002', 'ACTIVE')`,
    [require('crypto').randomUUID(), orgId, defaultPasswordHash]
  );

  // Owner entity record
  await query(
    `INSERT INTO owners (
      id, user_id, ihms_id, organization_id, full_name, email, phone, business_name, registered_hostel_name, status
    ) VALUES ($1, $2, $3, $4, 'Rajesh Varma', 'owner@ihms.com', '+91 9848011111', 'Green Valley Hostels Pvt Ltd', 'Green Valley Boys Executive Hostel', 'ACTIVE')`,
    [require('crypto').randomUUID(), ownerUserId, ownerIhmsId, orgId]
  );

  console.log('[Seed] Creating 2 Hostel Branches...');
  const b1Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO hostels (
      id, organization_id, branch_code, name, type, city, address, contact_number, email, total_capacity, current_occupancy, status
    ) VALUES ($1, $2, 'HYD001', 'Green Valley Boys Executive Hostel', 'BOYS', 'Hyderabad', 'Plot 42, Hitech City Main Road, Madhapur', '+91 9848022222', 'hyd001@greenvalleyhostels.com', 50, 0, 'ACTIVE')`,
    [b1Id, orgId]
  );

  const b2Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO hostels (
      id, organization_id, branch_code, name, type, city, address, contact_number, email, total_capacity, current_occupancy, status
    ) VALUES ($1, $2, 'HYD002', 'Green Valley Elite Girls Hostel', 'GIRLS', 'Hyderabad', 'Road No 36, Jubilee Hills', '+91 9848033333', 'hyd002@greenvalleyhostels.com', 40, 0, 'ACTIVE')`,
    [b2Id, orgId]
  );

  console.log('[Seed] Creating Staff Users...');
  const staffRoles = [
    { role: UserRole.ACCOUNTANT, name: 'Vikram Sharma (Accountant)', email: 'accountant@ihms.com' },
    { role: UserRole.WARDEN, name: 'Suresh Kumar (Warden)', email: 'warden@ihms.com' },
    { role: UserRole.SECURITY_GUARD, name: 'Ramesh Guard (Security)', email: 'security@ihms.com' },
    { role: UserRole.MAINTENANCE_STAFF, name: 'Gopal Plumber (Maintenance)', email: 'maintenance@ihms.com' },
    { role: UserRole.MESS_MANAGER, name: 'Chef Ramu (Mess Manager)', email: 'mess@ihms.com' },
  ];

  for (let i = 0; i < staffRoles.length; i++) {
    const s = staffRoles[i];
    const staffIhmsId = `IHM-GV-MN-H-000${i + 3}`;
    await query(
      `INSERT INTO users (
        id, user_id, ihms_id, organization_id, branch_id, name, email, password_hash, role, staff_code, status
      ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $2, 'ACTIVE')`,
      [require('crypto').randomUUID(), staffIhmsId, orgId, b1Id, s.name, s.email, defaultPasswordHash, s.role]
    );
  }

  console.log('[Seed] Creating Rooms and Beds for Branch 1 & 2...');
  const r1Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO rooms (id, organization_id, hostel_id, room_number, room_code, room_type, floor, capacity, total_beds, occupied_beds, available_beds, monthly_rate, status)
     VALUES ($1, $2, $3, '101', 'IHM-GV-MN-R-0001', 'DOUBLE', 1, 2, 2, 1, 1, 8000.00, 'ACTIVE')`,
    [r1Id, orgId, b1Id]
  );

  const bed1Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO beds (id, organization_id, hostel_id, room_id, bed_number, bed_code, monthly_rate, status)
     VALUES ($1, $2, $3, $4, 1, 'IHM-GV-MN-B-0001', 8000.00, 'OCCUPIED')`,
    [bed1Id, orgId, b1Id, r1Id]
  );

  const bed2Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO beds (id, organization_id, hostel_id, room_id, bed_number, bed_code, monthly_rate, status)
     VALUES ($1, $2, $3, $4, 2, 'IHM-GV-MN-B-0002', 8000.00, 'AVAILABLE')`,
    [bed2Id, orgId, b1Id, r1Id]
  );

  console.log('[Seed] Admitting Sample Students...');
  // Student 1: Rahul Kumar (Active student with user account)
  const s1Id = require('crypto').randomUUID();
  const s1UserId = require('crypto').randomUUID();
  const s1IhmsId = 'IHM-GV-MN-S-0001';

  await query(
    `INSERT INTO users (
      id, user_id, ihms_id, organization_id, branch_id, student_id, name, email, password_hash, role, phone, customer_code, staff_code, status
    ) VALUES ($1, $2, $2, $3, $4, $5, 'Rahul Kumar', 'student@ihms.com', $6, 'STUDENT', '+91 9876543210', $2, $2, 'ACTIVE')`,
    [s1UserId, s1IhmsId, orgId, b1Id, s1Id, defaultPasswordHash]
  );

  await query(
    `INSERT INTO students (
      id, student_id, customer_code, ihms_id, organization_id, hostel_id, user_id, full_name, email,
      phone, gender, college, guardian_name, guardian_relation, guardian_phone, guardian_address,
      room_id, bed_id, admission_date, portal_access, status, financial_total_demanded,
      financial_total_paid, financial_outstanding_balance
    ) VALUES ($1, $2, $2, $2, $3, $4, $5, 'Rahul Kumar', 'student@ihms.com', '+91 9876543210', 'MALE', 'IIT Hyderabad (Computer Science)', 'Anand Kumar', 'Father', '+91 9876500001', 'Madhapur, Hyderabad', $6, $7, CURRENT_TIMESTAMP, true, 'ACTIVE', 14000, 14000, 0)`,
    [s1Id, s1IhmsId, orgId, b1Id, s1UserId, r1Id, bed1Id]
  );

  await query(
    `UPDATE beds SET status = 'OCCUPIED', current_student_id = $1, current_customer_code = $2, current_student_name = 'Rahul Kumar', allocated_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [s1Id, s1IhmsId, bed1Id]
  );

  await query(
    `INSERT INTO room_allocations (id, student_id, room_id, bed_id, hostel_id, organization_id, monthly_rent, status)
     VALUES ($1, $2, $3, $4, $5, $6, 8000, 'ACTIVE')`,
    [require('crypto').randomUUID(), s1Id, r1Id, bed1Id, b1Id, orgId]
  );

  // Student 2: Priya Sharma (Portal access false)
  const s2Id = require('crypto').randomUUID();
  const s2IhmsId = 'IHM-GV-MN-S-0002';
  await query(
    `INSERT INTO students (
      id, student_id, customer_code, ihms_id, organization_id, hostel_id, full_name, email,
      phone, gender, college, guardian_name, guardian_relation, guardian_phone, guardian_address,
      room_id, bed_id, admission_date, portal_access, status, financial_total_demanded,
      financial_total_paid, financial_outstanding_balance
    ) VALUES ($1, $2, $2, $2, $3, $4, 'Priya Sharma', 'priya.sharma@example.com', '+91 9876543222', 'FEMALE', 'Deloitte India (Analyst)', 'Sunil Sharma', 'Father', '+91 9876500002', 'Gachibowli, Hyderabad', $5, $6, CURRENT_TIMESTAMP, false, 'ACTIVE', 14000, 6000, 8000)`,
    [s2Id, s2IhmsId, orgId, b1Id, r1Id, bed2Id]
  );

  await query(
    `UPDATE beds SET status = 'OCCUPIED', current_student_id = $1, current_customer_code = $2, current_student_name = 'Priya Sharma', allocated_at = CURRENT_TIMESTAMP WHERE id = $3`,
    [s2Id, s2IhmsId, bed2Id]
  );

  await query(
    `INSERT INTO room_allocations (id, student_id, room_id, bed_id, hostel_id, organization_id, monthly_rent, status)
     VALUES ($1, $2, $3, $4, $5, $6, 8000, 'ACTIVE')`,
    [require('crypto').randomUUID(), s2Id, r1Id, bed2Id, b1Id, orgId]
  );

  // Student 3: Rahul Varma (Unactivated student for OTP setup test)
  const s3Id = require('crypto').randomUUID();
  const s3IhmsId = 'IHM-GV-MN-S-0003';
  await query(
    `INSERT INTO students (
      id, student_id, customer_code, ihms_id, organization_id, hostel_id, full_name, email,
      phone, gender, college, guardian_name, guardian_relation, guardian_phone, guardian_address,
      admission_date, portal_access, portal_access_approved, portal_status, activation_status, password_set, status
    ) VALUES ($1, $2, $2, $2, $3, $4, 'Rahul Varma', 'stu2026003@ihms.com', '+91 9876543333', 'MALE', 'Osmania University', 'Ramesh Varma', 'Father', '+91 9876500003', 'Banjara Hills, Hyderabad', CURRENT_TIMESTAMP, true, true, 'PENDING_ACTIVATION', 'UNACTIVATED', false, 'ACTIVE')`,
    [s3Id, s3IhmsId, orgId, b1Id]
  );

  console.log('[Seed] Creating Fee Demands, Payments, Receipts, and Ledgers...');
  const dem1Id = require('crypto').randomUUID();
  await query(
    `INSERT INTO fee_demands (
      id, demand_number, organization_id, hostel_id, student_id, customer_code,
      term_name, hostel_rent, admission_fee, security_deposit, total_amount, paid_amount,
      balance_amount, due_date, status
    ) VALUES ($1, 'DEM-10001', $2, $3, $4, 'HYD001-ST000001', 'August 2026 Fee', 8000, 1000, 5000, 14000, 14000, 0, CURRENT_TIMESTAMP + INTERVAL '7 days', 'PAID')`,
    [dem1Id, orgId, b1Id, s1Id]
  );

  const pay1Id = require('crypto').randomUUID();
  const receiptNumber = 'HYD001-REC-000001';
  await query(
    `INSERT INTO payments (
      id, payment_number, organization_id, hostel_id, student_id, customer_code,
      amount, payment_method, transaction_ref, status, receipt_number, received_by, notes
    ) VALUES ($1, 'PAY-10001', $2, $3, $4, 'HYD001-ST000001', 14000, 'UPI', 'UPI-RAHUL-9848', 'SUCCESS', $5, 'Suresh Rao (Accountant)', 'Fee collection')`,
    [pay1Id, orgId, b1Id, s1Id, receiptNumber]
  );

  const qrPayload = await generateQrDataUrl({
    receiptNumber,
    customerCode: 'HYD001-ST000001',
    studentName: 'Rahul Kumar',
    amount: 14000,
    date: new Date(),
  });

  await query(
    `INSERT INTO receipts (
      id, receipt_number, payment_number, organization_id, hostel_id, student_id,
      customer_code, student_name, room_number, bed_number, fee_type, installment_month,
      amount, payment_method, remaining_balance, issued_by, qr_payload, notes
    ) VALUES ($1, $2, 'PAY-10001', $3, $4, $5, 'HYD001-ST000001', 'Rahul Kumar', '101', 'HYD001-R101-B01', 'Hostel Fee Payment', 'August 2026', 14000, 'UPI', 0, 'Suresh Rao (Accountant)', $6, 'Full payment on admission')`,
    [require('crypto').randomUUID(), receiptNumber, orgId, b1Id, s1Id, qrPayload]
  );

  console.log('[Seed] Creating Sample Expenses & Vouchers...');
  await query(
    `INSERT INTO expenses (
      id, expense_number, organization_id, hostel_id, category, amount, payment_method, paid_to, expense_date, description, invoice_or_bill_number, approved_by
    ) VALUES ($1, 'HYD001-EXP-000001', $2, $3, 'ELECTRICITY', 4500, 'UPI', 'Telangana Southern Power (TSSPDCL)', CURRENT_DATE, 'Monthly electricity bill for Block-A', 'TSSPDCL-AUG-2026', 'Rajesh Varma')`,
    [require('crypto').randomUUID(), orgId, b1Id]
  );

  await query(
    `INSERT INTO expenses (
      id, expense_number, organization_id, hostel_id, category, amount, payment_method, paid_to, expense_date, description, invoice_or_bill_number, approved_by
    ) VALUES ($1, 'HYD001-EXP-000002', $2, $3, 'MESS_GROCERIES', 8200, 'BANK_TRANSFER', 'Sri Balaji Provisions', CURRENT_DATE, 'Weekly mess rations and groceries', 'SBP-9842', 'Rajesh Varma')`,
    [require('crypto').randomUUID(), orgId, b1Id]
  );

  await query(
    `INSERT INTO vouchers (
      id, voucher_number, voucher_type, organization_id, hostel_id, account, debit, credit, voucher_date, narration, reference_id
    ) VALUES ($1, 'HYD001-VCH-000001', 'PAYMENT', $2, $3, 'EXPENSE_ELECTRICITY', 4500, 0, CURRENT_DATE, 'Electricity bill payment', 'HYD001-EXP-000001')`,
    [require('crypto').randomUUID(), orgId, b1Id]
  );

  console.log('[Seed] Creating Complaints & Counters...');
  await query(
    `INSERT INTO complaints (
      id, complaint_number, organization_id, branch_id, student_id, customer_code,
      student_name, room_code, category, title, description, priority, status
    ) VALUES ($1, 'HYD001-CMP-000001', $2, $3, $4, 'HYD001-ST000001', 'Rahul Kumar', '101', 'ELECTRICAL', 'Study table reading lamp not working', 'Bulb flickers and turns off when switched on.', 'MEDIUM', 'OPEN')`,
    [require('crypto').randomUUID(), orgId, b1Id, s1Id]
  );

  // Initialize counters
  await query(
    `INSERT INTO counters (id, organization_id, prefix, seq) VALUES
     ($1, $2, 'HYD001-ST', 2),
     ($3, $2, 'HYD001-REC', 1),
     ($4, $2, 'HYD001-CMP', 1),
     ($5, $2, 'HYD001-EMP', 5)
     ON CONFLICT (organization_id, prefix) DO UPDATE SET seq = EXCLUDED.seq`,
    [
      `${orgId}_HYD001-ST`, orgId,
      `${orgId}_HYD001-REC`,
      `${orgId}_HYD001-CMP`,
      `${orgId}_HYD001-EMP`
    ]
  );

  console.log('===========================================================');
  console.log('  ✅ POSTGRESQL DATABASE SEEDED SUCCESSFULLY');
  console.log('===========================================================');
  console.log('  Test Login Accounts (Password for all: Admin@123):');
  console.log('  - Owner:         owner@ihms.com');
  console.log('  - Super Admin:   superadmin@ihms.com');
  console.log('  - Accountant:    accountant@ihms.com');
  console.log('  - Warden:        warden@ihms.com');
  console.log('  - Security:      security@ihms.com');
  console.log('  - Maintenance:   maintenance@ihms.com');
  console.log('  - Mess Manager:  mess@ihms.com');
  console.log('  - Student (Active): student@ihms.com (Customer Code: HYD001-ST000001)');
  console.log('  - Student (Disabled): priya.sharma@example.com (HYD001-ST000002) - Portal Access Disabled');
  console.log('===========================================================');

  if (require.main === module) {
    await disconnectDatabase();
  }
}
