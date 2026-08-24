import { Router, Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { authenticate } from '../../common/guards/auth.guard';

const router = Router();

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.registerOwner(req.body);
    res.status(201).json({
      success: true,
      data: result,
      ownerId: result.ownerId,
      organizationId: result.organizationId,
      hostelBranchId: result.hostelBranchId,
      hostelCode: result.hostelCode,
      hostelName: result.hostelName,
      ownerName: result.ownerName,
      email: result.email,
      accessToken: result.accessToken,
      user: result.user,
      message: 'Registration successful. Your IHMS hostel account has been created.',
    });
  } catch (err) { next(err); }
});

router.get('/check-existing-hostel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const result = await authService.checkExistingHostelAccount(email);
    res.json({
      success: true,
      data: result,
      exists: !!result,
    });
  } catch (err) { next(err); }
});

router.get('/setup-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await authService.getSystemSetupStatus();
    res.json({
      success: true,
      data: status,
      ...status,
    });
  } catch (err) { next(err); }
});

router.get('/system-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await authService.getSystemSetupStatus();
    res.json({
      success: true,
      data: status,
      ...status,
    });
  } catch (err) { next(err); }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, identifier, password, loginType } = req.body;
    const loginId = identifier || email;
    if (!loginId || !password) {
      return res.status(400).json({ success: false, message: 'Email or ID and password are required' });
    }
    const result = await authService.login(loginId, password, loginType);
    res.json({
      success: true,
      data: result,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      message: 'Login successful',
    });
  } catch (err) { next(err); }
});

router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getMe(req.user!.id);
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err) { next(err); }
});

router.post('/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, message: 'Session refreshed' });
  } catch (err) { next(err); }
});

router.post('/change-password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, newPassword } = req.body;
    const target = identifier || email;

    if (newPassword) {
      const result = await authService.forgotPassword(target, newPassword);
      return res.json({ success: true, data: result, message: result.message });
    }

    const result = await authService.requestPasswordResetOtp(target);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password/request-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email } = req.body;
    const target = identifier || email;
    const result = await authService.requestPasswordResetOtp(target);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email } = req.body;
    const target = identifier || email;
    const result = await authService.resendPasswordResetOtp(target);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, otp, code } = req.body;
    const target = identifier || email;
    const otpValue = otp || code;
    const result = await authService.verifyPasswordResetOtp(target, otpValue);
    res.json({
      success: true,
      data: result,
      resetToken: result.resetToken,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resetToken, token, newPassword, password, confirmPassword } = req.body;
    const targetToken = resetToken || token;
    const targetPassword = newPassword || password;
    const result = await authService.resetPasswordWithToken(targetToken, targetPassword, confirmPassword);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------
// 6-DIGIT OTP STUDENT ACCOUNT ACTIVATION ENDPOINTS
// ----------------------------------------------------

router.post('/student/send-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, studentId } = req.body;
    const target = identifier || email || studentId;
    const result = await authService.sendStudentActivationOtp(target, email, studentId);
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/send-activation-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, studentId } = req.body;
    const target = identifier || email || studentId;
    const result = await authService.sendStudentActivationOtp(target, email, studentId);
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/student-status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, studentId } = req.body;
    const target = identifier || email || studentId;
    const result = await authService.getStudentLoginStatus(target);
    res.json({
      success: true,
      data: result,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-activation-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, studentId, otp, code } = req.body;
    const target = identifier || email || studentId;
    const otpValue = otp || code;
    const result = await authService.verifyStudentActivationOtp(target, otpValue);
    res.json({
      success: true,
      data: result,
      activationToken: result.activationToken,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-activation-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier, email, studentId } = req.body;
    const target = identifier || email || studentId;
    const result = await authService.resendStudentActivationOtp(target);
    res.json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/activate-student-account', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { activationToken, token, newPassword, password, confirmPassword } = req.body;
    const targetToken = activationToken || token;
    const targetPassword = newPassword || password;
    const result = await authService.activateStudentAccount(targetToken, targetPassword, confirmPassword);
    res.json({
      success: true,
      data: result,
      token: result.token,
      refreshToken: result.refreshToken,
      user: result.user,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
});

export const authRouter = router;
