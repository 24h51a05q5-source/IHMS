import nodemailer from 'nodemailer';
import { AppError } from '../filters/http-exception.filter';

export interface SendOtpEmailOptions {
  to: string;
  otpCode: string;
  studentName?: string;
  purpose?: 'ACTIVATION' | 'PASSWORD_RESET';
}

class EmailService {
  private getSmtpConfig() {
    const host = (
      process.env.SMTP_HOST ||
      process.env.EMAIL_HOST ||
      process.env.MAIL_HOST ||
      'smtp.gmail.com'
    ).trim();

    const port = Number(
      process.env.SMTP_PORT ||
      process.env.EMAIL_PORT ||
      process.env.MAIL_PORT ||
      587
    );

    const user = (
      process.env.SMTP_USER ||
      process.env.EMAIL_USER ||
      process.env.EMAIL_USERNAME ||
      process.env.MAIL_USER ||
      ''
    ).trim();

    const rawPass = (
      process.env.SMTP_PASS ||
      process.env.SMTP_PASSWORD ||
      process.env.EMAIL_PASS ||
      process.env.EMAIL_PASSWORD ||
      process.env.MAIL_PASS ||
      ''
    ).trim();

    // Normalize Gmail App Passwords (remove spaces if user copied "abcd efgh ijkl mnop")
    const isGmail = host.includes('gmail') || user.endsWith('@gmail.com');
    const pass = isGmail ? rawPass.replace(/\s+/g, '') : rawPass;

    const from = (
      process.env.EMAIL_FROM ||
      process.env.SENDER_EMAIL ||
      process.env.SMTP_FROM ||
      (user ? `"IHMS Hostel Portal" <${user}>` : '"IHMS Hostel Management" <noreply@ihms.com>')
    ).trim();

    return { host, port, user, pass, from, isGmail };
  }

  async sendOtpEmail(options: SendOtpEmailOptions): Promise<{ success: boolean; messageId: string }> {
    const { to, otpCode, studentName, purpose = 'ACTIVATION' } = options;
    const recipientEmail = (to || '').trim().toLowerCase();

    if (!recipientEmail) {
      throw new AppError('Recipient email address is required to send verification code.', 400);
    }

    const isProduction = process.env.NODE_ENV === 'production';

    // Log 1: OTP generated
    if (isProduction) {
      console.log(`[EMAIL-SERVICE] 🔑 OTP generated for recipient: ${recipientEmail}`);
    } else {
      console.log(`[EMAIL-SERVICE] 🔑 OTP generated for recipient: ${recipientEmail} [Dev Code: ${otpCode}]`);
    }

    const { host, port, user, pass, from, isGmail } = this.getSmtpConfig();

    // Check if SMTP credentials are provided
    if (!user || !pass) {
      const errorMsg = 'SMTP credentials not configured. Please set SMTP_USER and SMTP_PASS (or EMAIL_USER and EMAIL_PASS) environment variables.';
      console.error(`[EMAIL-SERVICE] ❌ ${errorMsg}`);
      
      // In development mode, if explicit mock flag is enabled, fall back gracefully
      if (!isProduction && process.env.ALLOW_MOCK_EMAIL === 'true') {
        console.warn(`[EMAIL-SERVICE] ⚠️ ALLOW_MOCK_EMAIL is active. Mocking successful email send for ${recipientEmail}.`);
        return { success: true, messageId: `mock-msg-${Date.now()}` };
      }

      throw new AppError('Email service is currently unavailable. Please check backend SMTP configuration.', 500);
    }

    // Log 2: Attempting to send email & Recipient email address
    console.log(`[EMAIL-SERVICE] 📧 Attempting to send ${purpose} OTP email to recipient: "${recipientEmail}" via ${host}:${port} (Sender: ${from})...`);

    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    const subject = purpose === 'PASSWORD_RESET'
      ? `IHMS Hostel Portal — Password Reset Verification Code (${otpCode})`
      : `IHMS Hostel Portal — Student Account Activation Code (${otpCode})`;

    const nameDisplay = studentName || 'Student';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; rounded-radius: 10px; background-color: #ffffff;">
        <div style="background-color: #111827; padding: 16px 20px; border-radius: 8px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">IHMS Hostel Portal</h2>
          <p style="color: #e87545; margin: 4px 0 0 0; font-size: 13px; font-weight: bold;">Integrated Hostel Management System</p>
        </div>
        <div style="padding: 24px 10px; color: #1f2937;">
          <h3 style="color: #111827; margin-top: 0;">Hello, ${nameDisplay}</h3>
          <p style="font-size: 14px; line-height: 1.5; color: #4b5563;">
            You requested a 6-digit verification code to ${purpose === 'PASSWORD_RESET' ? 'reset your student portal password' : 'activate your IHMS Student Portal account'}.
          </p>
          <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold; display: block; margin-bottom: 8px;">Your 6-Digit Verification Code</span>
            <span style="font-size: 32px; font-weight: 900; font-family: monospace; letter-spacing: 6px; color: #e87545;">${otpCode}</span>
          </div>
          <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">
            🔒 This verification code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
          </p>
          <p style="font-size: 13px; color: #6b7280;">
            If you did not request this verification code, please ignore this email or notify your hostel administration.
          </p>
        </div>
        <div style="border-t: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; text-align: center;">
          <p style="margin: 0;">IHMS ERP System &copy; 2026. All rights reserved.</p>
        </div>
      </div>
    `;

    const textContent = `Hello ${nameDisplay},\n\nYour 6-digit verification code for IHMS Student Portal is: ${otpCode}\n\nThis code is valid for 10 minutes. Please do not share it with anyone.\n\nIHMS Hostel Management System`;

    try {
      const info = await transporter.sendMail({
        from,
        to: recipientEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });

      // Log 3: Email sent successfully with message ID
      console.log(`[EMAIL-SERVICE] ✅ Email sent successfully to ${recipientEmail}! Message ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      // Log 4: Full error if sending fails
      console.error(`[EMAIL-SERVICE] ❌ Failed to send email to ${recipientEmail}:`, err);

      let detailMsg = err?.message || 'SMTP connection failed';
      if (isGmail && (detailMsg.includes('Invalid login') || detailMsg.includes('535-5.7.8'))) {
        detailMsg = 'Gmail SMTP authentication failed. Please ensure you are using a 16-character Gmail App Password (generated from Google Account Security), not your personal Gmail password.';
      }

      throw new AppError(`Failed to send verification email to ${recipientEmail}: ${detailMsg}`, 500);
    }
  }
}

export const emailService = new EmailService();
