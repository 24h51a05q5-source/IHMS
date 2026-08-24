import { Router, Request, Response, NextFunction } from 'express';
import { studentService } from './student.service';
import { feeService } from '../fees/fee.service';
import { queryOne } from '../../config/database';
import { authenticate } from '../../common/guards/auth.guard';
import { AppError } from '../../common/filters/http-exception.filter';

const router = Router();
router.use(authenticate);

async function getAuthenticatedStudent(req: Request) {
  const user = req.user!;
  const student = await queryOne<any>(
    `SELECT s.*, r.room_number, r.room_type, b.bed_code, b.monthly_rate as bed_monthly_rate,
            COALESCE(o.name, h.hostel_name, h.name, 'Hostel') as hostel_name, h.branch_code
     FROM students s
     LEFT JOIN rooms r ON r.id = s.room_id
     LEFT JOIN beds b ON b.id = s.bed_id
     LEFT JOIN hostels h ON h.id = s.hostel_id
     LEFT JOIN organizations o ON o.id = s.organization_id
     WHERE (s.id = $1 OR s.user_id = $2 OR UPPER(s.customer_code) = $3 OR LOWER(s.email) = $4)
       AND s.organization_id = $5`,
    [user.studentId || user.id, user.id, (user.customerCode || '').toUpperCase(), (user.email || '').toLowerCase(), user.organizationId]
  );

  if (!student) {
    throw new AppError('Student record not found for this user account.', 404);
  }
  return student;
}

const handleGetProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const totalDemanded = Number(student.financial_total_demanded || 0);
    const totalPaid = Number(student.financial_total_paid || 0);
    const outstandingBalance = Number(student.financial_outstanding_balance || 0);

    const mapped = {
      id: student.id,
      _id: student.id,
      studentId: student.student_id || student.customer_code,
      customerCode: student.customer_code,
      name: student.full_name,
      fullName: student.full_name,
      email: student.email,
      phone: student.phone,
      gender: student.gender,
      course: student.course || '',
      year: 1,
      guardianName: student.guardian_name || '',
      guardianRelation: student.guardian_relation || 'Parent',
      guardianPhone: student.guardian_phone || '',
      guardianAddress: student.guardian_address || '',
      address: student.guardian_address || '',
      currentAssignment: student.room_id ? {
        branchId: student.hostel_id,
        hostelCode: student.branch_code || 'HYD001',
        roomId: student.room_id,
        roomNumber: student.room_number,
        roomCode: student.room_number,
        bedId: student.bed_id,
        bedCode: student.bed_code,
        monthlyRent: Number(student.bed_monthly_rate || 0),
        allocatedAt: student.admission_date,
      } : undefined,
      hostelId: student.hostel_id,
      hostelName: student.hostel_name || 'Main Hostel',
      buildingName: 'Main Building',
      floorNumber: 1,
      roomId: student.room_id,
      roomNumber: student.room_number || '',
      bedId: student.bed_id,
      bedNumber: student.bed_code || '',
      monthlyRent: Number(student.bed_monthly_rate || 0),
      stayDurationMonths: 1,
      totalHostelFee: totalDemanded,
      financialSummary: {
        totalDemanded,
        totalPaid,
        outstandingBalance,
      },
      feeTotal: totalDemanded,
      feePaid: totalPaid,
      feeOutstanding: outstandingBalance,
      feeStatus: outstandingBalance <= 0 ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : 'OVERDUE',
      portalAccess: student.portal_access ? 'ENABLED' : 'DISABLED',
      status: student.status || 'ACTIVE',
      admissionDate: student.admission_date || student.created_at,
      createdAt: student.created_at,
    };

    res.json({ success: true, data: mapped });
  } catch (err) {
    next(err);
  }
};

router.get('/me', handleGetProfile);
router.get('/profile', handleGetProfile);

const handleUpdateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const updated = await studentService.updateStudentSelfProfile(
      student.organization_id,
      student.id,
      {
        phone: req.body.phone,
        email: req.body.email,
        address: req.body.address || req.body.guardianAddress,
      }
    );

    res.json({
      success: true,
      data: updated,
      message: 'Profile updated successfully.',
    });
  } catch (err) {
    next(err);
  }
};

router.put('/profile', handleUpdateProfile);
router.patch('/profile', handleUpdateProfile);

router.get('/room', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);

    const roomData = {
      studentId: student.student_id || student.customer_code,
      customerCode: student.customer_code,
      studentName: student.full_name,
      hostelName: student.hostel_name || 'Main Hostel',
      hostelId: student.hostel_id,
      buildingName: 'Main Building',
      floorNumber: 1,
      roomId: student.room_id,
      roomNumber: student.room_number || '101',
      bedId: student.bed_id,
      bedNumber: student.bed_code || 'B01',
      bedStatus: 'OCCUPIED',
      monthlyRent: Number(student.bed_monthly_rate || 0),
      stayDurationMonths: 1,
      totalHostelFee: Number(student.financial_total_demanded || 0),
      allocatedAt: student.admission_date || student.created_at,
    };

    res.json({ success: true, data: roomData });
  } catch (err) {
    next(err);
  }
});

router.get('/fees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const feeData = await feeService.getStudentFeeAccount(student.organization_id, student.id);
    res.json({ success: true, data: feeData });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/initiate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const { amount, installmentId, paymentMethod, idempotencyKey } = req.body;

    const order = await feeService.initiatePayment(student.organization_id, student.id, {
      amount: Number(amount),
      installmentId,
      paymentMethod,
      idempotencyKey,
    });

    res.status(201).json({
      success: true,
      data: order,
      message: 'Payment order created successfully.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const { paymentId, gatewayOrderId, gatewayPaymentId, gatewaySignature } = req.body;

    const result = await feeService.verifyAndConfirmPayment(student.organization_id, {
      paymentId,
      gatewayOrderId,
      gatewayPaymentId,
      gatewaySignature,
    });

    res.json({
      success: true,
      data: {
        payment: result.payment,
        receipt: result.receipt,
      },
      message: 'Payment verified and confirmed successfully.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const { amount, installmentId, paymentMethod, idempotencyKey } = req.body;

    const order = await feeService.initiatePayment(student.organization_id, student.id, {
      amount: Number(amount),
      installmentId,
      paymentMethod,
      idempotencyKey,
    });

    res.status(201).json({
      success: true,
      data: order,
      message: 'Payment order created successfully.',
    });
  } catch (err) {
    next(err);
  }
});

router.get('/payments/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const payment = await queryOne<any>(
      'SELECT id, payment_number, amount, currency, status, gateway_order_id, transaction_ref, created_at, updated_at FROM payments WHERE (id = $1 OR payment_number = $1 OR gateway_order_id = $1) AND organization_id = $2 AND student_id = $3',
      [req.params.id, student.organization_id, student.id]
    );
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

router.post('/payments/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const result = await feeService.cancelPayment(student.organization_id, req.params.id, req.body.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/payments/:id/receipt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const receipt = await feeService.getReceiptByPaymentId(student.organization_id, req.params.id);
    res.json({ success: true, data: receipt });
  } catch (err) {
    next(err);
  }
});

router.post('/pay-fee', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const student = await getAuthenticatedStudent(req);
    const { amount, paymentMethod, installmentId, idempotencyKey } = req.body;

    const order = await feeService.initiatePayment(student.organization_id, student.id, {
      amount: Number(amount),
      installmentId,
      paymentMethod,
      idempotencyKey,
    });

    res.status(201).json({
      success: true,
      data: order,
      message: 'Payment order created. Please complete gateway cryptographic verification.',
    });
  } catch (err) {
    next(err);
  }
});

export const studentPortalRouter = router;
