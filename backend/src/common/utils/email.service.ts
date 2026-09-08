import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import { AppError } from '../filters/http-exception.filter';

export interface SendOtpEmailOptions {
  to: string;
  otpCode: string;
  studentName?: string;
  purpose?: 'ACTIVATION' | 'PASSWORD_RESET';
}

export interface SendSupportEmailOptions {
  ticketNumber: string;
  userName: string;
  userRole: string;
  hostelName?: string;
  userEmail: string;
  category: string;
  priority?: string;
  subject: string;
  description: string;
  screenshotUrl?: string;
  submittedAt?: Date;
}

class EmailService {
  private getResendClient(): { resend: Resend | null; apiKey: string; from: string } {
    const apiKey = (
      process.env.RESEND_API_KEY ||
      process.env.RESEND_KEY ||
      ''
    ).trim();

    const defaultFrom = 'IHMS Hostel Portal <onboarding@resend.dev>';
    let from = (
      process.env.EMAIL_FROM ||
      process.env.SENDER_EMAIL ||
      process.env.RESEND_FROM ||
      ''
    ).trim();

    if (!from || !from.includes('@')) {
      from = defaultFrom;
    }

    const resend = apiKey ? new Resend(apiKey) : null;
    return { resend, apiKey, from };
  }

  private getSmtpConfig() {
    const host = (
      process.env.SMTP_HOST ||
      process.env.EMAIL_HOST ||
      process.env.MAIL_HOST ||
      ''
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

    const isGmail = host.includes('gmail') || user.endsWith('@gmail.com');
    const pass = isGmail ? rawPass.replace(/\s+/g, '') : rawPass;

    const from = (
      process.env.EMAIL_FROM ||
      process.env.SENDER_EMAIL ||
      process.env.SMTP_FROM ||
      (user ? `"IHMS Hostel Portal" <${user}>` : 'IHMS Hostel Portal <onboarding@resend.dev>')
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

    // Log 1: OTP generated (omit raw OTP code in production logs)
    if (isProduction) {
      console.log(`[EMAIL-SERVICE] 🔑 OTP generated for recipient: ${recipientEmail}`);
    } else {
      console.log(`[EMAIL-SERVICE] 🔑 OTP generated for recipient: ${recipientEmail} [Dev Code: ${otpCode}]`);
    }

    const { resend, apiKey, from: resendFrom } = this.getResendClient();

    const subject = purpose === 'PASSWORD_RESET'
      ? `IHMS Hostel Portal — Password Reset Verification Code (${otpCode})`
      : `IHMS Hostel Portal — Student Account Activation Code (${otpCode})`;

    const nameDisplay = studentName || 'Student';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
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
        <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; text-align: center;">
          <p style="margin: 0;">IHMS ERP System &copy; 2026. All rights reserved.</p>
        </div>
      </div>
    `;

    const textContent = `Hello ${nameDisplay},\n\nYour 6-digit verification code for IHMS Student Portal is: ${otpCode}\n\nThis code is valid for 10 minutes. Please do not share it with anyone.\n\nIHMS Hostel Management System`;

    // -------------------------------------------------------------
    // PATH 1: RESEND API (Primary Email Transport)
    // -------------------------------------------------------------
    if (resend) {
      console.log(`[EMAIL-SERVICE] 📧 Attempting to send ${purpose} OTP email to "${recipientEmail}" using Resend API (Sender: ${resendFrom})...`);

      try {
        const { data, error } = await resend.emails.send({
          from: resendFrom,
          to: [recipientEmail],
          subject,
          text: textContent,
          html: htmlContent,
        });

        if (error) {
          console.error(`[EMAIL-SERVICE] ❌ Resend API delivery error for ${recipientEmail}:`, error);
          throw new AppError(`Resend email delivery failed: ${error.message}`, 500);
        }

        const messageId = data?.id || `resend-${Date.now()}`;
        console.log(`[EMAIL-SERVICE] ✅ Email sent successfully via Resend to ${recipientEmail}! Message ID: ${messageId}`);

        return {
          success: true,
          messageId,
        };
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        console.error(`[EMAIL-SERVICE] ❌ Unexpected Resend SDK error sending to ${recipientEmail}:`, err);
        throw new AppError(`Failed to send verification email via Resend: ${err?.message || 'Network error'}`, 500);
      }
    }

    // -------------------------------------------------------------
    // PATH 2: NODEMAILER SMTP FALLBACK
    // -------------------------------------------------------------
    const smtp = this.getSmtpConfig();
    if (smtp.user && smtp.pass && smtp.host) {
      console.log(`[EMAIL-SERVICE] 📧 RESEND_API_KEY not found. Falling back to SMTP transport (${smtp.host}:${smtp.port}, User: ${smtp.user})...`);

      const secure = process.env.SMTP_SECURE === 'true' || smtp.port === 465;
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: {
          rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true,
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      try {
        const info = await transporter.sendMail({
          from: smtp.from,
          to: recipientEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });

        console.log(`[EMAIL-SERVICE] ✅ Email sent successfully via SMTP to ${recipientEmail}! Message ID: ${info.messageId}`);
        return {
          success: true,
          messageId: info.messageId,
        };
      } catch (err: any) {
        console.error(`[EMAIL-SERVICE] ❌ Failed to send email via SMTP to ${recipientEmail}:`, err);
        throw new AppError(`Failed to send verification email via SMTP: ${err?.message || 'SMTP delivery failed'}`, 500);
      }
    }

    // -------------------------------------------------------------
    // PATH 3: NO EMAIL PROVIDER CONFIGURED
    // -------------------------------------------------------------
    const missingMsg = 'Email service is not configured. Please set RESEND_API_KEY (or EMAIL_FROM & RESEND_API_KEY) in Render environment variables.';
    console.error(`[EMAIL-SERVICE] ❌ ${missingMsg}`);

    // Safe mock fallback when RESEND_API_KEY is missing or unconfigured
    if (!process.env.RESEND_API_KEY) {
      console.warn(`[EMAIL-SERVICE] ⚠️ RESEND_API_KEY not set. Mocking email delivery for ${recipientEmail}.`);
      return { success: true, messageId: `mock-msg-${Date.now()}` };
    }

    throw new AppError(missingMsg, 500);
  }

  async sendSupportEmail(options: SendSupportEmailOptions): Promise<{ success: boolean; messageId: string }> {
    const supportRecipient = (process.env.SUPPORT_EMAIL || 'ihmserp00@gmail.com').trim();
    const userEmail = (options.userEmail || '').trim().toLowerCase();

    if (!userEmail) {
      throw new AppError('User email address is required to process support request.', 400);
    }

    // Explicit test failure simulation flag
    if (process.env.EMAIL_SIMULATE_FAILURE === 'true') {
      console.warn('[EMAIL-SERVICE] ⚠️ EMAIL_SIMULATE_FAILURE is active. Simulating support email dispatch failure.');
      throw new AppError('Your support request could not be sent. Please try again.', 500);
    }

    const subject = `[IHMS Support] ${options.subject.trim()} - Ticket #${options.ticketNumber}`;
    const submittedDate = options.submittedAt || new Date();
    const formattedDate = submittedDate.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const textContent = [
      `Subject:`,
      `${subject}`,
      ``,
      `Email body:`,
      ``,
      `Ticket ID:`,
      `${options.ticketNumber}`,
      ``,
      `User:`,
      `${options.userName}`,
      ``,
      `Role:`,
      `${options.userRole}`,
      ``,
      `Organization/Hostel:`,
      `${options.hostelName || 'Not Specified'}`,
      ``,
      `User Email:`,
      `${options.userEmail}`,
      ``,
      `Category:`,
      `${options.category}`,
      ``,
      `Priority:`,
      `${options.priority || 'Medium'}`,
      ``,
      `Problem:`,
      `${options.description}`,
      ``,
      `Submitted:`,
      `${formattedDate}`,
    ].join('\n');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <div style="background-color: #111827; padding: 18px 24px; border-radius: 8px 8px 0 0; text-align: left; border-bottom: 4px solid #e87545;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">IHMS ERP — Help & Support Desk</h2>
          <p style="color: #cbd5e1; margin: 4px 0 0 0; font-size: 13px;">New User Support Request Received</p>
        </div>
        
        <div style="padding: 24px 20px;">
          <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 8px 8px 0;">
            <span style="font-size: 12px; font-weight: bold; color: #9a3412; text-transform: uppercase; letter-spacing: 0.5px;">Ticket ID</span>
            <div style="font-size: 22px; font-weight: 900; font-family: monospace; color: #c2410c; margin-top: 2px;">${options.ticketNumber}</div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tbody>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b; width: 35%;">User:</td>
                <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${options.userName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">Role:</td>
                <td style="padding: 10px 0; color: #0f172a;">${options.userRole}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">Organization / Hostel:</td>
                <td style="padding: 10px 0; color: #0f172a;">${options.hostelName || 'Not Specified'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">User Email:</td>
                <td style="padding: 10px 0; color: #0f172a;"><a href="mailto:${options.userEmail}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${options.userEmail}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">Category:</td>
                <td style="padding: 10px 0; color: #0f172a; font-weight: 600;">${options.category}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">Priority:</td>
                <td style="padding: 10px 0; color: #0f172a;"><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; background: #e0f2fe; color: #0369a1;">${options.priority || 'Medium'}</span></td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 10px 0; font-weight: bold; color: #64748b;">Submitted At:</td>
                <td style="padding: 10px 0; color: #0f172a;">${formattedDate}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-bottom: 24px;">
            <h4 style="margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">Problem Description</h4>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${options.description}</div>
          </div>

          ${
            options.screenshotUrl
              ? `<div style="margin-bottom: 20px; padding: 12px; background: #f1f5f9; border-radius: 8px;">
                  <strong style="font-size: 13px; color: #334155;">📎 Attachment:</strong>
                  <span style="font-size: 13px; color: #64748b; margin-left: 6px;">Screenshot attached with this support request.</span>
                 </div>`
              : ''
          }

          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #166534;">
            <strong>✉️ Direct Reply:</strong> You can click "Reply" in your email client to respond directly to <strong>${options.userName}</strong> (<a href="mailto:${options.userEmail}" style="color: #15803d; font-weight: bold;">${options.userEmail}</a>).
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding: 14px 20px; font-size: 12px; color: #94a3b8; text-align: center; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
          Integrated Hostel Management System (IHMS) ERP • Automated Support Delivery
        </div>
      </div>
    `;

    // Process attachments
    const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
    if (options.screenshotUrl && options.screenshotUrl.startsWith('data:image/')) {
      const match = options.screenshotUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        attachments.push({
          filename: `screenshot-${options.ticketNumber}.${ext}`,
          content: Buffer.from(match[2], 'base64'),
          contentType: `image/${match[1]}`,
        });
      }
    }

    // PATH 1: RESEND API
    const { resend, from: resendFrom } = this.getResendClient();
    if (resend) {
      console.log(`[EMAIL-SERVICE] 📧 Dispatching support ticket email #${options.ticketNumber} to "${supportRecipient}" via Resend (Reply-To: ${userEmail})...`);
      try {
        const { data, error } = await resend.emails.send({
          from: resendFrom,
          to: [supportRecipient],
          replyTo: userEmail,
          subject,
          text: textContent,
          html: htmlContent,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
          })),
        });

        if (error) {
          console.error(`[EMAIL-SERVICE] ❌ Resend support email error:`, error);
          throw new AppError('Your support request could not be sent. Please try again.', 500);
        }

        const messageId = data?.id || `resend-support-${Date.now()}`;
        console.log(`[EMAIL-SERVICE] ✅ Support ticket email dispatched successfully via Resend to ${supportRecipient}! Message ID: ${messageId}`);
        return { success: true, messageId };
      } catch (err: any) {
        if (err instanceof AppError) throw err;
        console.error(`[EMAIL-SERVICE] ❌ Unexpected Resend error sending support email:`, err);
        throw new AppError('Your support request could not be sent. Please try again.', 500);
      }
    }

    // PATH 2: SMTP
    const smtp = this.getSmtpConfig();
    if (smtp.user && smtp.pass && smtp.host) {
      console.log(`[EMAIL-SERVICE] 📧 Dispatching support ticket email #${options.ticketNumber} to "${supportRecipient}" via SMTP (${smtp.host}:${smtp.port})...`);
      const secure = process.env.SMTP_SECURE === 'true' || smtp.port === 465;
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: {
          rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'false' ? false : true,
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });

      try {
        const info = await transporter.sendMail({
          from: smtp.from,
          to: supportRecipient,
          replyTo: userEmail,
          subject,
          text: textContent,
          html: htmlContent,
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            contentType: a.contentType,
          })),
        });

        console.log(`[EMAIL-SERVICE] ✅ Support ticket email dispatched successfully via SMTP to ${supportRecipient}! Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        console.error(`[EMAIL-SERVICE] ❌ Failed to dispatch support email via SMTP:`, err);
        throw new AppError('Your support request could not be sent. Please try again.', 500);
      }
    }

    // PATH 3: DEV SIMULATION (When external mail provider keys are not yet configured in dev)
    console.log(`[EMAIL-SERVICE] 📧 [DEV-SIMULATION] Support ticket email dispatched to: ${supportRecipient}`);
    console.log(`[EMAIL-SERVICE] ↳ Ticket ID: ${options.ticketNumber} | Submitter: ${options.userName} <${options.userEmail}> | Reply-To: ${userEmail}`);
    console.log(`[EMAIL-SERVICE] ↳ Subject: ${subject}`);
    return {
      success: true,
      messageId: `dev-support-msg-${options.ticketNumber}`,
    };
  }
}

export const emailService = new EmailService();
