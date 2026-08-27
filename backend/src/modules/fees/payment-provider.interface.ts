export interface CreateDynamicQrInput {
  paymentId: string; // IHMS unique payment reference (e.g. IHMS-PAY-1724749200000-A1B2)
  amount: number; // Amount in Rupees
  vpaAddress?: string; // Hostel owner VPA / settlement account
  payeeName?: string; // Hostel owner display name / business name
  description?: string; // Transaction note / fee description
  expirySeconds?: number; // QR validity in seconds (default 900 = 15 mins)
  organizationId?: string;
  hostelId?: string;
  studentId?: string;
}

export interface CreateDynamicQrOutput {
  providerPaymentId: string;
  qrDataUrl: string; // Base64 image data URL
  intentUrl: string; // upi://pay?...
  expiresAt: Date;
  provider: string;
  rawResponse?: any;
}

export interface ParsedWebhookPayload {
  eventId: string;
  eventType: string; // 'payment.captured' | 'payment.success' | 'payment.failed'
  ihmsPaymentId?: string; // Mapped IHMS payment ID / payment_number / reference
  providerPaymentId?: string;
  providerTransactionId?: string; // Provider transaction ID / UTR
  utr?: string;
  amount: number; // Amount in Rupees
  currency?: string;
  status: 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING';
  rawPayload?: any;
}

export interface IPaymentProviderAdapter {
  getProviderName(): string;
  createDynamicQr(input: CreateDynamicQrInput): Promise<CreateDynamicQrOutput>;
  verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string, secret?: string): Promise<boolean>;
  parseWebhookPayload(body: any, rawBody?: string | Buffer): ParsedWebhookPayload;
  checkPaymentStatus?(providerPaymentId: string): Promise<{ status: 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'PENDING'; amount?: number; utr?: string }>;
}
