import { query } from './database';

export async function runMigrations(): Promise<void> {
  console.log('[Migrations] Running PostgreSQL schema migrations...');

  const statements = [
    // 0. Counters
    `CREATE TABLE IF NOT EXISTS counters (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      prefix TEXT NOT NULL,
      seq INT DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_counters_org_prefix ON counters(organization_id, prefix)`,

    // 1. Organizations table
    `CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      org_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      currency TEXT DEFAULT 'INR',
      tax_gstin TEXT,
      subscription_tier TEXT DEFAULT 'ENTERPRISE',
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 2. Users table (Central auth for owner, student, admin, staff)
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      phone TEXT,
      organization_id TEXT,
      branch_id TEXT,
      student_id TEXT,
      owner_id TEXT,
      staff_code TEXT,
      customer_code TEXT,
      hostel_name TEXT,
      must_change_password BOOLEAN DEFAULT FALSE,
      terms_accepted BOOLEAN DEFAULT FALSE,
      accepted_terms_version TEXT,
      terms_accepted_at TIMESTAMPTZ,
      status TEXT DEFAULT 'ACTIVE',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 3. Owners table
    `CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      organization_id TEXT,
      full_name TEXT,
      owner_name TEXT,
      email TEXT,
      phone TEXT,
      alternate_phone TEXT,
      address TEXT,
      business_name TEXT,
      registered_hostel_name TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 4. Hostels / Branches table
    `CREATE TABLE IF NOT EXISTS hostels (
      id TEXT PRIMARY KEY,
      hostel_id TEXT,
      branch_code TEXT,
      owner_id TEXT,
      organization_id TEXT,
      hostel_name TEXT,
      name TEXT,
      branch_name TEXT,
      type TEXT DEFAULT 'BOYS',
      hostel_type TEXT DEFAULT 'BOYS',
      address TEXT,
      city TEXT DEFAULT 'Hyderabad',
      state TEXT DEFAULT 'Telangana',
      pincode TEXT,
      contact_number TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      email TEXT,
      total_rooms INT DEFAULT 0,
      total_beds INT DEFAULT 0,
      total_capacity INT DEFAULT 0,
      current_occupancy INT DEFAULT 0,
      facilities TEXT DEFAULT '',
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 5. Rooms table
    `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      room_number TEXT NOT NULL,
      room_code TEXT,
      hostel_id TEXT,
      organization_id TEXT,
      room_type TEXT DEFAULT 'DOUBLE',
      floor INT DEFAULT 1,
      floor_number INT DEFAULT 1,
      building_name TEXT DEFAULT 'Main Building',
      block_name TEXT DEFAULT '1',
      capacity INT DEFAULT 2,
      total_beds INT DEFAULT 2,
      occupied_beds INT DEFAULT 0,
      available_beds INT DEFAULT 2,
      monthly_rent NUMERIC(12, 2) DEFAULT 8000.00,
      monthly_rate NUMERIC(12, 2) DEFAULT 8000.00,
      status TEXT DEFAULT 'ACTIVE',
      amenities TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 6. Beds table
    `CREATE TABLE IF NOT EXISTS beds (
      id TEXT PRIMARY KEY,
      room_id TEXT,
      hostel_id TEXT,
      organization_id TEXT,
      bed_number INT DEFAULT 1,
      bed_code TEXT NOT NULL,
      monthly_rate NUMERIC(12, 2) DEFAULT 8000.00,
      status TEXT DEFAULT 'AVAILABLE',
      current_student_id TEXT,
      current_customer_code TEXT,
      current_student_name TEXT,
      allocated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 7. Students table
    `CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      customer_code TEXT UNIQUE NOT NULL,
      user_id TEXT,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      branch_id TEXT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      gender TEXT DEFAULT 'MALE',
      date_of_birth DATE,
      blood_group TEXT,
      aadhar_number TEXT,
      course TEXT,
      college TEXT,
      guardian_name TEXT,
      guardian_relation TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      guardian_address TEXT,
      room_id TEXT,
      bed_id TEXT,
      admission_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      portal_access BOOLEAN DEFAULT FALSE,
      portal_access_approved BOOLEAN DEFAULT FALSE,
      portal_status TEXT DEFAULT 'PENDING_APPROVAL',
      activation_status TEXT DEFAULT 'ACCOUNT_CREATED',
      password_set BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'ACTIVE',
      financial_total_demanded NUMERIC(12, 2) DEFAULT 0.00,
      financial_total_paid NUMERIC(12, 2) DEFAULT 0.00,
      financial_outstanding_balance NUMERIC(12, 2) DEFAULT 0.00,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_access_approved BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS portal_status TEXT DEFAULT 'PENDING_APPROVAL'`,

    // 8. Room Allocations history table
    `CREATE TABLE IF NOT EXISTS room_allocations (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      bed_id TEXT,
      hostel_id TEXT,
      organization_id TEXT,
      monthly_rent NUMERIC(12, 2) DEFAULT 8000.00,
      allocation_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      vacated_date TIMESTAMPTZ,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 9. Student Transfers history table
    `CREATE TABLE IF NOT EXISTS student_transfers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      student_name TEXT NOT NULL,
      from_branch_id TEXT NOT NULL,
      from_bed_code TEXT,
      to_branch_id TEXT NOT NULL,
      to_bed_code TEXT,
      to_bed_id TEXT,
      balance_carried_forward NUMERIC(12, 2) DEFAULT 0.00,
      reason TEXT,
      approved_by TEXT,
      transfer_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'COMPLETED',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 10. Fee Structures
    `CREATE TABLE IF NOT EXISTS fee_structures (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      fee_name TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      frequency TEXT DEFAULT 'MONTHLY',
      due_day INT DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 11. Fee Accounts (Per Student Master Ledger)
    `CREATE TABLE IF NOT EXISTS fee_accounts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      payment_plan TEXT DEFAULT 'MONTHLY',
      total_fee NUMERIC(12, 2) DEFAULT 0.00,
      total_paid NUMERIC(12, 2) DEFAULT 0.00,
      balance_amount NUMERIC(12, 2) DEFAULT 0.00,
      monthly_amount NUMERIC(12, 2) DEFAULT 0.00,
      number_of_installments INT DEFAULT 1,
      paid_installments INT DEFAULT 0,
      start_month TEXT,
      approved_adjustments NUMERIC(12, 2) DEFAULT 0.00,
      outstanding_balance NUMERIC(12, 2) DEFAULT 0.00,
      allow_advance_payment BOOLEAN DEFAULT TRUE,
      monthly_due_day INT DEFAULT 5,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_fee_accounts_org_stud ON fee_accounts(organization_id, student_id)`,

    // 12. Fee Demands / Records
    `CREATE TABLE IF NOT EXISTS fee_demands (
      id TEXT PRIMARY KEY,
      demand_number TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      fee_structure_id TEXT,
      academic_period TEXT DEFAULT '2026',
      term_name TEXT NOT NULL,
      hostel_rent NUMERIC(12, 2) DEFAULT 0.00,
      mess_fee NUMERIC(12, 2) DEFAULT 0.00,
      admission_fee NUMERIC(12, 2) DEFAULT 0.00,
      security_deposit NUMERIC(12, 2) DEFAULT 0.00,
      other_charges NUMERIC(12, 2) DEFAULT 0.00,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      due_date TIMESTAMPTZ,
      status TEXT DEFAULT 'UNPAID',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 13. Fee Installments
    `CREATE TABLE IF NOT EXISTS fee_installments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      fee_account_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      installment_number INT NOT NULL,
      month TEXT,
      month_name TEXT,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      remaining_amount NUMERIC(12, 2) DEFAULT 0.00,
      balance_amount NUMERIC(12, 2) DEFAULT 0.00,
      due_date TIMESTAMPTZ NOT NULL,
      payment_id TEXT,
      receipt_number TEXT,
      paid_at TIMESTAMPTZ,
      status TEXT DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 14. Payments table
    `CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      fee_demand_id TEXT,
      fee_account_id TEXT,
      installment_id TEXT,
      amount NUMERIC(12, 2) NOT NULL,
      currency TEXT DEFAULT 'INR',
      payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      payment_method TEXT DEFAULT 'CASH',
      transaction_ref TEXT,
      transaction_reference TEXT,
      gateway_name TEXT,
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      gateway_transaction_id TEXT,
      idempotency_key TEXT,
      expected_amount NUMERIC(12, 2),
      expires_at TIMESTAMPTZ,
      proof_url TEXT,
      verified_by TEXT,
      verified_at TIMESTAMPTZ,
      refunded_amount NUMERIC(12, 2) DEFAULT 0.00,
      receipt_number TEXT,
      receipt_no TEXT,
      received_by TEXT DEFAULT 'Authorized Staff',
      notes TEXT,
      fee_type TEXT DEFAULT 'Hostel Rent',
      room_number TEXT,
      bed_number TEXT,
      status TEXT DEFAULT 'SUCCESS',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 14.1 Payment Gateway Configs (Per Organization)
    `CREATE TABLE IF NOT EXISTS payment_gateway_configs (
      id TEXT PRIMARY KEY,
      organization_id TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'RAZORPAY',
      environment TEXT DEFAULT 'TEST',
      key_id TEXT,
      key_secret TEXT,
      webhook_secret TEXT,
      merchant_id TEXT,
      provider_account_id TEXT,
      onboarding_status TEXT DEFAULT 'CONNECTED',
      account_verification_status TEXT DEFAULT 'VERIFIED',
      payout_status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 14.2 Payment Webhook Events (Idempotency Ledger)
    `CREATE TABLE IF NOT EXISTS payment_webhook_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      gateway_event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      gateway_order_id TEXT,
      gateway_payment_id TEXT,
      payload TEXT,
      status TEXT DEFAULT 'PROCESSED',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 14.3 Fee Financial Ledgers (Immutable Ledger)
    `CREATE TABLE IF NOT EXISTS fee_ledgers (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT NOT NULL,
      invoice_id TEXT,
      payment_id TEXT,
      transaction_type TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      currency TEXT DEFAULT 'INR',
      reference_number TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 15. Receipts table
    `CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      receipt_number TEXT UNIQUE NOT NULL,
      payment_id TEXT,
      payment_number TEXT,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT,
      customer_code TEXT,
      student_name TEXT,
      room_number TEXT,
      bed_number TEXT,
      fee_type TEXT DEFAULT 'Hostel Fee Payment',
      installment_month TEXT,
      amount NUMERIC(12, 2) NOT NULL,
      payment_method TEXT DEFAULT 'CASH',
      remaining_balance NUMERIC(12, 2) DEFAULT 0.00,
      issued_by TEXT DEFAULT 'Authorized Staff',
      qr_payload TEXT,
      notes TEXT,
      issued_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 16. Receipt Sequences
    `CREATE TABLE IF NOT EXISTS receipt_sequences (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      year INT NOT NULL,
      last_sequence INT DEFAULT 0
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_seq_org_year ON receipt_sequences(organization_id, year)`,

    // 17. Announcements table
    `CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      branch_id TEXT,
      title TEXT NOT NULL,
      content TEXT,
      message TEXT,
      target_audience TEXT DEFAULT 'ALL',
      target_type TEXT DEFAULT 'ALL',
      target_id TEXT,
      target_label TEXT,
      target_branch_id TEXT,
      target_room_id TEXT,
      target_student_id TEXT,
      priority TEXT DEFAULT 'NORMAL',
      image_url TEXT,
      attachment_url TEXT,
      announcement_image TEXT,
      created_by TEXT,
      created_by_name TEXT,
      published_by TEXT,
      expires_at TIMESTAMPTZ,
      status TEXT DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 18. Announcement Reads
    `CREATE TABLE IF NOT EXISTS announcement_reads (
      id TEXT PRIMARY KEY,
      announcement_id TEXT NOT NULL,
      user_id TEXT,
      student_id TEXT,
      read_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_read_user ON announcement_reads(announcement_id, user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_read_student ON announcement_reads(announcement_id, student_id)`,

    // 19. Attendance
    `CREATE TABLE IF NOT EXISTS attendances (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      student_name TEXT,
      room_code TEXT,
      bed_code TEXT,
      date DATE NOT NULL,
      status TEXT DEFAULT 'PRESENT',
      type TEXT DEFAULT 'NIGHT_CHECK',
      marked_by TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_att_org_branch_stud_date ON attendances(organization_id, branch_id, student_id, date)`,

    // 20. Leave Requests
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id TEXT PRIMARY KEY,
      leave_number TEXT,
      organization_id TEXT NOT NULL,
      branch_id TEXT,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      student_name TEXT,
      room_code TEXT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT,
      destination_address TEXT,
      parent_contact TEXT,
      parent_approval TEXT DEFAULT 'APPROVED',
      warden_approval TEXT DEFAULT 'PENDING',
      status TEXT DEFAULT 'PENDING',
      gate_pass_code TEXT,
      gate_pass_qr TEXT,
      actual_out_time TIMESTAMPTZ,
      actual_in_time TIMESTAMPTZ,
      reviewed_by TEXT,
      remarks TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 21. Complaints
    `CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      complaint_number TEXT,
      organization_id TEXT NOT NULL,
      branch_id TEXT,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      student_name TEXT,
      room_code TEXT,
      category TEXT DEFAULT 'OTHER',
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'MEDIUM',
      status TEXT DEFAULT 'OPEN',
      assigned_staff_id TEXT,
      assigned_staff_name TEXT,
      resolution_notes TEXT,
      maintenance_cost NUMERIC(12, 2) DEFAULT 0.00,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 22. Visitors
    `CREATE TABLE IF NOT EXISTS visitors (
      id TEXT PRIMARY KEY,
      visitor_pass_number TEXT,
      organization_id TEXT NOT NULL,
      branch_id TEXT,
      hostel_id TEXT,
      student_id TEXT,
      customer_code TEXT,
      student_name TEXT,
      visitor_name TEXT NOT NULL,
      relation TEXT,
      phone TEXT,
      purpose TEXT,
      id_proof_number TEXT,
      security_guard_name TEXT,
      qr_payload TEXT,
      status TEXT DEFAULT 'INSIDE',
      check_in_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      check_out_time TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 23. Expenses
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      expense_number TEXT,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      branch_id TEXT,
      category TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
      payment_method TEXT DEFAULT 'CASH',
      paid_to TEXT,
      expense_date DATE DEFAULT CURRENT_DATE,
      description TEXT,
      invoice_or_bill_number TEXT,
      approved_by TEXT,
      recorded_by TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 24. Accounting Vouchers
    `CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      voucher_number TEXT NOT NULL,
      voucher_type TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      branch_id TEXT,
      account TEXT NOT NULL,
      debit NUMERIC(12, 2) DEFAULT 0.00,
      credit NUMERIC(12, 2) DEFAULT 0.00,
      narration TEXT,
      reference_id TEXT,
      voucher_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 25. Mess Menus
    `CREATE TABLE IF NOT EXISTS mess_menus (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT,
      branch_id TEXT,
      week_start_date DATE NOT NULL,
      week_end_date DATE NOT NULL,
      days TEXT,
      status TEXT DEFAULT 'DRAFT',
      created_by TEXT,
      updated_by TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 26. Meal Attendances
    `CREATE TABLE IF NOT EXISTS meal_attendances (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      hostel_id TEXT,
      student_id TEXT NOT NULL,
      customer_code TEXT,
      student_name TEXT,
      meal_type TEXT NOT NULL,
      date DATE NOT NULL,
      marked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 27. Assets
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      asset_code TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      branch_id TEXT,
      hostel_id TEXT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'FURNITURE',
      quantity INT DEFAULT 1,
      cost NUMERIC(12, 2) DEFAULT 0.00,
      condition TEXT DEFAULT 'GOOD',
      status TEXT DEFAULT 'IN_USE',
      room_location TEXT,
      purchase_date DATE,
      qr_payload TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 28. Notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      branch_id TEXT,
      user_id TEXT NOT NULL,
      role TEXT DEFAULT 'STUDENT',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO',
      read BOOLEAN DEFAULT FALSE,
      is_read BOOLEAN DEFAULT FALSE,
      link TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 29. Audit Logs
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 30. OTPs table (Hashed OTPs with purpose separation and brute-force tracking)
    `CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      identifier TEXT NOT NULL,
      organization_id TEXT,
      otp_purpose TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      attempt_count INT DEFAULT 0,
      max_attempts INT DEFAULT 5,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 31. Password Reset Tokens table (Short-lived session tokens issued after OTP verification)
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // 32. Support Tickets table (Contact Us / Help & Support)
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      organization_id TEXT,
      user_id TEXT,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      hostel_name TEXT,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      screenshot_url TEXT,
      status TEXT DEFAULT 'OPEN',
      resolution_notes TEXT,
      resolved_by TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON support_tickets(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_number ON support_tickets(ticket_number)`,
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`,
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_users_org_role ON users(organization_id, role)`,
    `CREATE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_users_customer_code ON users(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_students_cust_code ON students(customer_code)`,
    `CREATE INDEX IF NOT EXISTS idx_students_id_code ON students(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_org ON students(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_org_hostel ON students(organization_id, hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_org_status ON students(organization_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_students_org_created ON students(organization_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_students_hostel ON students(hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_students_email ON students(email)`,
    `CREATE INDEX IF NOT EXISTS idx_students_phone ON students(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rooms_org_hostel ON rooms(organization_id, hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rooms_hostel ON rooms(hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rooms_num ON rooms(room_number)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_org_status ON beds(organization_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_hostel_status ON beds(hostel_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_room ON beds(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_hostel ON beds(hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_code ON beds(bed_code)`,
    `CREATE INDEX IF NOT EXISTS idx_beds_student ON beds(current_student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_student ON room_allocations(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_room ON room_allocations(room_id)`,
    `CREATE INDEX IF NOT EXISTS idx_alloc_hostel ON room_allocations(hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_demands_stud ON fee_demands(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_demands_org ON fee_demands(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_demands_org_status ON fee_demands(organization_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_inst_account ON fee_installments(fee_account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_inst_stud ON fee_installments(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_stud ON payments(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_org_date ON payments(organization_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_hostel ON payments(hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_rec ON payments(receipt_number)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON expenses(organization_id, expense_date)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_org_hostel ON expenses(organization_id, hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_vouchers_org_date ON vouchers(organization_id, voucher_date)`,
    `CREATE INDEX IF NOT EXISTS idx_complaints_org_status ON complaints(organization_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_complaints_org_branch ON complaints(organization_id, branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_complaints_student ON complaints(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_org_branch_date ON attendances(organization_id, branch_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_org_branch_status ON leave_requests(organization_id, branch_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_visitors_org_branch ON visitors(organization_id, branch_id, check_in_time)`,
    `CREATE INDEX IF NOT EXISTS idx_announcements_org ON announcements(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_announcements_branch ON announcements(branch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_date ON audit_logs(organization_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_mess_menus_org_hostel ON mess_menus(organization_id, hostel_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_gw_order ON payments(gateway_order_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_org_idem ON payments(organization_id, idempotency_key)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_org_status_created ON payments(organization_id, status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_org_pmt_num ON payments(organization_id, payment_number)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_org_pmt ON receipts(organization_id, payment_number)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_org_rec ON receipts(organization_id, receipt_number)`,
    `CREATE INDEX IF NOT EXISTS idx_receipts_org_stud ON receipts(organization_id, student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_complaints_org_status_created ON complaints(organization_id, status, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_students_org_hostel_status ON students(organization_id, hostel_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledgers_org_stud ON fee_ledgers(organization_id, student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_ledgers_payment ON fee_ledgers(payment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_webhook_events_order ON payment_webhook_events(gateway_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_meal_att_org_branch_date ON meal_attendances(organization_id, branch_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_identifier_purpose ON otps(identifier, otp_purpose)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_user_purpose ON otps(user_id, otp_purpose)`,
    `CREATE INDEX IF NOT EXISTS idx_otps_purpose_created ON otps(otp_purpose, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_pw_reset_tokens_user ON password_reset_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pw_reset_tokens_hash ON password_reset_tokens(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_hostels_org ON hostels(organization_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hostels_owner ON hostels(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_hostels_status ON hostels(status)`,
    `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_accounts_stud ON fee_accounts(student_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fee_accounts_org ON fee_accounts(organization_id)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS activation_status TEXT DEFAULT 'ACCOUNT_CREATED'`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_set BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_name TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT`,
    `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url TEXT`,
    `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_url TEXT`,
    `ALTER TABLE announcements ADD COLUMN IF NOT EXISTS announcement_image TEXT`,
    `CREATE TABLE IF NOT EXISTS hostel_payment_configs (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      hostel_id TEXT NOT NULL,
      owner_id TEXT,
      upi_vpa TEXT,
      upi_display_name TEXT,
      upi_status TEXT DEFAULT 'NOT_CONFIGURED',
      bank_beneficiary_name TEXT,
      bank_account_number TEXT,
      bank_ifsc_code TEXT,
      bank_name TEXT,
      bank_status TEXT DEFAULT 'NOT_CONFIGURED',
      pending_upi_vpa TEXT,
      pending_upi_display_name TEXT,
      pending_bank_beneficiary_name TEXT,
      pending_bank_account_number TEXT,
      pending_bank_ifsc_code TEXT,
      pending_bank_name TEXT,
      verified_beneficiary_name TEXT,
      verification_rate_limit_count INT DEFAULT 0,
      verification_last_attempt_at TIMESTAMPTZ,
      audit_log TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_hostel_pmt_cfg_hostel ON hostel_payment_configs(organization_id, hostel_id)`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS upi_status TEXT DEFAULT 'NOT_CONFIGURED'`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS bank_status TEXT DEFAULT 'NOT_CONFIGURED'`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_upi_vpa TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_upi_display_name TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_bank_beneficiary_name TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_bank_account_number TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_bank_ifsc_code TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS pending_bank_name TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS verified_beneficiary_name TEXT`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS verification_rate_limit_count INT DEFAULT 0`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS verification_last_attempt_at TIMESTAMPTZ`,
    `ALTER TABLE hostel_payment_configs ADD COLUMN IF NOT EXISTS audit_log TEXT DEFAULT '[]'`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS proof_url TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by TEXT`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS expected_amount NUMERIC(12, 2)`,
    `ALTER TABLE payments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_org_utr ON payments(organization_id, transaction_ref)`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS ihms_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS ihms_id TEXT`,
    `ALTER TABLE owners ADD COLUMN IF NOT EXISTS ihms_id TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_ihms_id ON students(ihms_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ihms_id ON users(ihms_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_ihms_id ON owners(ihms_id)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ`,
    `CREATE TABLE IF NOT EXISTS terms_acceptances (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT DEFAULT 'ACCEPTED',
      accepted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user ON terms_acceptances(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_terms_acceptances_ver ON terms_acceptances(terms_version)`,
  ];

  for (const stmt of statements) {
    try {
      await query(stmt);
    } catch (e: any) {
      console.warn(`[Migrations] Note on executing statement: ${e.message}`);
    }
  }

  await backfillIhmsIds();

  console.log('[Migrations] ✅ All PostgreSQL tables, indexes, and IHMS IDs are ready.');
}

export async function backfillIhmsIds(): Promise<void> {
  const { query } = require('./database');
  const { generateIhmsId } = require('../common/utils/code-generator');

  try {
    // 1. Backfill Students
    const unmappedStudents = await query(`
      SELECT s.id, s.organization_id, s.hostel_id, s.branch_id, s.user_id,
             h.name as hostel_name
      FROM students s
      LEFT JOIN hostels h ON s.hostel_id = h.id
      WHERE s.ihms_id IS NULL OR s.ihms_id = '' OR s.ihms_id NOT LIKE 'IHM-%'
    `);

    for (const stu of unmappedStudents.rows) {
      try {
        const ihmsId = await generateIhmsId('S', stu.hostel_name, 'Main', stu.organization_id || 'GLOBAL');
        await query(`UPDATE students SET ihms_id = $1, student_id = $1, customer_code = $1 WHERE id = $2`, [ihmsId, stu.id]);
        if (stu.user_id) {
          await query(`UPDATE users SET ihms_id = $1, student_id = $1, customer_code = $1 WHERE id = $2`, [ihmsId, stu.user_id]);
        }
      } catch (err: any) {
        console.warn(`[Backfill] Error backfilling student ${stu.id}: ${err.message}`);
      }
    }

    // 2. Backfill Hostel Owners / Staff Users
    const unmappedOwners = await query(`
      SELECT u.id, u.organization_id, u.hostel_name, u.role,
             h.name as hostel_name_from_db
      FROM users u
      LEFT JOIN hostels h ON u.organization_id = h.organization_id
      WHERE (u.ihms_id IS NULL OR u.ihms_id = '' OR u.ihms_id NOT LIKE 'IHM-%')
        AND u.role IN ('ORGANIZATION_OWNER', 'BRANCH_MANAGER', 'PLATFORM_SUPER_ADMIN', 'ACCOUNTANT', 'SUPER_ADMIN', 'ADMIN', 'OWNER')
    `);

    for (const owner of unmappedOwners.rows) {
      try {
        const hostelName = owner.hostel_name || owner.hostel_name_from_db || 'AA';
        const ihmsId = await generateIhmsId('H', hostelName, 'Main', owner.organization_id || 'GLOBAL');
        await query(`UPDATE users SET ihms_id = $1, user_id = $1, staff_code = $1 WHERE id = $2`, [ihmsId, owner.id]);
        await query(`UPDATE owners SET ihms_id = $1 WHERE user_id = $2 OR id = $2`, [ihmsId, owner.id]);
      } catch (err: any) {
        console.warn(`[Backfill] Error backfilling owner ${owner.id}: ${err.message}`);
      }
    }

    // 3. Backfill Rooms
    const unmappedRooms = await query(`
      SELECT r.id, r.organization_id, r.hostel_id, h.name as hostel_name
      FROM rooms r
      LEFT JOIN hostels h ON r.hostel_id = h.id
      WHERE r.room_code IS NULL OR r.room_code = '' OR r.room_code NOT LIKE 'IHM-%'
    `);

    for (const rm of unmappedRooms.rows) {
      try {
        const roomCode = await generateIhmsId('R', rm.hostel_name, 'Main', rm.organization_id || 'GLOBAL');
        await query(`UPDATE rooms SET room_code = $1 WHERE id = $2`, [roomCode, rm.id]);
      } catch (err: any) {
        console.warn(`[Backfill] Error backfilling room ${rm.id}: ${err.message}`);
      }
    }

    // 4. Backfill Beds
    const unmappedBeds = await query(`
      SELECT b.id, b.organization_id, b.hostel_id, h.name as hostel_name
      FROM beds b
      LEFT JOIN hostels h ON b.hostel_id = h.id
      WHERE b.bed_code IS NULL OR b.bed_code = '' OR b.bed_code NOT LIKE 'IHM-%'
    `);

    for (const bd of unmappedBeds.rows) {
      try {
        const bedCode = await generateIhmsId('B', bd.hostel_name, 'Main', bd.organization_id || 'GLOBAL');
        await query(`UPDATE beds SET bed_code = $1 WHERE id = $2`, [bedCode, bd.id]);
      } catch (err: any) {
        console.warn(`[Backfill] Error backfilling bed ${bd.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.warn(`[Backfill] Backfill execution note: ${err.message}`);
  }
}
