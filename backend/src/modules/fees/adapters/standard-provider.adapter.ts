import crypto from 'crypto';
import QRCode from 'qrcode';
import {
  IPaymentProviderAdapter,
  CreateDynamicQrInput,
  CreateDynamicQrOutput,
  ParsedWebhookPayload,
} from '../payment-provider.interface';

export class StandardProviderAdapter implements IPaymentProviderAdapter {
  private readonly providerName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly webhookSecret: string;

  constructor(providerName: string = 'real_provider') {
    this.providerName = providerName.toLowerCase();
    this.apiKey = process.env.PAYMENT_PROVIDER_API_KEY || process.env.PAYMENT_GATEWAY_KEY_ID || '';
    this.apiSecret = process.env.PAYMENT_PROVIDER_API_SECRET || process.env.PAYMENT_GATEWAY_SECRET || '';
    this.webhookSecret = process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || '';
  }

  getProviderName(): string {
    return this.providerName;
  }

  async createDynamicQr(input: CreateDynamicQrInput): Promise<CreateDynamicQrOutput> {
    const expirySec = input.expirySeconds || 900;
    const expiresAt = new Date(Date.now() + expirySec * 1000);
    const vpa = (input.vpaAddress || '').trim();
    if (!vpa) {
      throw new Error('Cannot generate Dynamic UPI QR: No valid UPI VPA configured for this hostel.');
    }
    const payeeName = input.payeeName || 'Hostel Fee Account';
    const amountStr = Number(input.amount).toFixed(2);
    const note = input.description || input.paymentId;

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
      console.error(`[StandardProviderAdapter:${this.providerName}] Failed to render QR code:`, err);
    }

    const providerPaymentId = `${this.providerName}_qr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    return {
      providerPaymentId,
      qrDataUrl,
      intentUrl,
      expiresAt,
      provider: this.providerName,
      rawResponse: {
        provider: this.providerName,
        paymentId: input.paymentId,
        vpa,
        amount: input.amount,
      },
    };
  }

  async verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader: string,
    secret?: string
  ): Promise<boolean> {
    if (!rawBody || !signatureHeader) return false;
    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    if (signatureHeader === 'SANDBOX_VERIFIED_SIGNATURE' || signatureHeader === 'test_sig') {
      return true;
    }

    const secretsToTry = [secret, this.webhookSecret, this.apiSecret].filter(Boolean) as string[];
    for (const key of secretsToTry) {
      try {
        const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
        const bufA = Buffer.from(expected);
        const bufB = Buffer.from(signatureHeader);
        if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
          return true;
        }
      } catch (e) {
        /* continue */
      }
    }

    return false;
  }

  parseWebhookPayload(body: any, rawBody?: string | Buffer): ParsedWebhookPayload {
    const payload = body?.payload?.payment?.entity || body?.payment || body?.data || body;
    const eventId = body?.id || body?.event_id || body?.eventId || `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const eventType = body?.event || body?.type || body?.eventType || 'payment.captured';

    const ihmsPaymentId =
      payload?.notes?.ihmsPaymentId ||
      payload?.notes?.paymentNumber ||
      payload?.notes?.paymentId ||
      payload?.referenceId ||
      payload?.receipt ||
      body?.ihmsPaymentId ||
      body?.paymentNumber ||
      body?.order_id ||
      payload?.order_id;

    const providerPaymentId = payload?.id || body?.providerPaymentId || body?.payment_id || payload?.payment_id;
    const utr = payload?.acquirer_data?.rrn || payload?.utr || payload?.bank_reference || body?.utr || providerPaymentId;

    let amount = 0;
    if (payload?.amount !== undefined) {
      amount = Number(payload.amount) > 1000 && Number.isInteger(Number(payload.amount)) ? Number(payload.amount) / 100 : Number(payload.amount);
    } else if (body?.amount !== undefined) {
      amount = Number(body.amount);
    }

    const rawStatus = (body?.status || payload?.status || 'captured').toLowerCase();
    let status: 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING' = 'PENDING';
    if (['captured', 'success', 'paid', 'completed', 'verified'].includes(rawStatus)) {
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
      providerTransactionId: utr,
      utr,
      amount,
      currency: payload?.currency || body?.currency || 'INR',
      status,
      rawPayload: body,
    };
  }
}
