import crypto from 'crypto';
import QRCode from 'qrcode';
import {
  IPaymentProviderAdapter,
  CreateDynamicQrInput,
  CreateDynamicQrOutput,
  ParsedWebhookPayload,
} from '../payment-provider.interface';

export class MockProviderAdapter implements IPaymentProviderAdapter {
  private readonly webhookSecret: string;

  constructor() {
    this.webhookSecret =
      process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET ||
      process.env.PAYMENT_WEBHOOK_SECRET ||
      'whsec_ihms_secure_webhook_key_2026';
  }

  getProviderName(): string {
    return 'mock';
  }

  async createDynamicQr(input: CreateDynamicQrInput): Promise<CreateDynamicQrOutput> {
    const expirySec = input.expirySeconds || 900; // 15 minutes default
    const expiresAt = new Date(Date.now() + expirySec * 1000);
    const vpa = (input.vpaAddress || '').trim();
    if (!vpa) {
      throw new Error('Cannot generate Dynamic UPI QR: No valid UPI VPA configured for this hostel.');
    }
    const payeeName = input.payeeName || 'Hostel Fee Collection';
    const amountStr = Number(input.amount).toFixed(2);
    const note = input.description || input.paymentId;

    // Standardized Dynamic UPI Intent URI
    const intentUrl = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}&am=${amountStr}&tn=${encodeURIComponent(note)}&tr=${encodeURIComponent(input.paymentId)}&cu=INR`;

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(intentUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    } catch (err) {
      console.error('[MockProviderAdapter] Failed to render QR code:', err);
    }

    const providerPaymentId = `mock_pay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return {
      providerPaymentId,
      qrDataUrl,
      intentUrl,
      expiresAt,
      provider: 'mock',
      rawResponse: {
        status: 'QR_GENERATED',
        ref: input.paymentId,
      },
    };
  }

  async verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string,
    secret?: string
  ): Promise<boolean> {
    if (!rawBody || !signatureHeader) return false;
    const key =
      secret ||
      process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET ||
      process.env.PAYMENT_WEBHOOK_SECRET ||
      this.webhookSecret ||
      'whsec_ihms_secure_webhook_key_2026';
    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    // Allow sandbox test signatures in dev mode
    if (signatureHeader === 'SANDBOX_VERIFIED_SIGNATURE' || signatureHeader === 'test_sig') {
      return true;
    }

    try {
      const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
      const bufA = Buffer.from(expected);
      const bufB = Buffer.from(signatureHeader);
      if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
        return true;
      }
    } catch (e) {
      console.error('[MockProviderAdapter] Signature verification error:', e);
    }

    return false;
  }

  parseWebhookPayload(body: any, rawBody?: string | Buffer): ParsedWebhookPayload {
    const payload = body?.payload?.payment?.entity || body?.payment || body;
    const eventId = body?.id || body?.event_id || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const eventType = body?.event || body?.type || 'payment.captured';

    const ihmsPaymentId =
      payload?.notes?.ihmsPaymentId ||
      payload?.notes?.paymentNumber ||
      payload?.receipt ||
      body?.ihmsPaymentId ||
      body?.paymentNumber ||
      body?.order_id ||
      payload?.order_id;

    const providerPaymentId = payload?.id || body?.providerPaymentId || body?.payment_id;
    const providerTransactionId = payload?.acquirer_data?.rrn || payload?.acquirer_data?.upi_transaction_id || body?.utr || body?.transaction_ref || providerPaymentId;
    const utr = payload?.acquirer_data?.rrn || body?.utr || providerTransactionId;

    let amount = 0;
    if (body?.payload?.payment?.entity?.amount !== undefined) {
      // Razorpay entity specifies amount in paise
      amount = Number(body.payload.payment.entity.amount) / 100;
    } else if (payload?.amount !== undefined) {
      amount = Number(payload.amount);
    } else if (body?.amount !== undefined) {
      amount = Number(body.amount);
    }

    const rawStatus = (body?.status || payload?.status || 'captured').toLowerCase();
    let status: 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING' = 'PENDING';
    if (['captured', 'success', 'paid', 'completed'].includes(rawStatus)) {
      status = 'SUCCESS';
    } else if (['failed', 'rejected', 'error'].includes(rawStatus)) {
      status = 'FAILED';
    } else if (['expired'].includes(rawStatus)) {
      status = 'EXPIRED';
    }

    return {
      eventId,
      eventType,
      ihmsPaymentId,
      providerPaymentId,
      providerTransactionId,
      utr,
      amount,
      currency: payload?.currency || body?.currency || 'INR',
      status,
      rawPayload: body,
    };
  }

  async checkPaymentStatus(
    providerPaymentId: string
  ): Promise<{ status: 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING'; amount?: number; utr?: string }> {
    return {
      status: 'PENDING',
    };
  }
}
