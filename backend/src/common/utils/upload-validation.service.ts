import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../filters/http-exception.filter';

const ALLOWED_IMAGE_TYPES: { [key: string]: number[][] } = {
  // JPEG / JPG (FF D8 FF)
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  // PNG (89 50 4E 47 0D 0A 1A 0A)
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // WEBP (52 49 46 46 ... 57 41 56 45 or 57 45 42 50)
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header check
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB limit

export class UploadValidationService {
  private static receiptsUploadDir = path.join(process.cwd(), 'uploads', 'receipts');

  public static ensureUploadDirectoriesExist() {
    if (!fs.existsSync(this.receiptsUploadDir)) {
      fs.mkdirSync(this.receiptsUploadDir, { recursive: true });
    }
  }

  /**
   * Inspects binary buffer magic numbers to ensure genuine image payload.
   */
  public static validateImageMagicNumbers(buffer: Buffer): { valid: boolean; detectedType?: string } {
    if (!buffer || buffer.length === 0) {
      return { valid: false };
    }

    for (const [mimeType, signatures] of Object.entries(ALLOWED_IMAGE_TYPES)) {
      for (const sig of signatures) {
        if (buffer.length >= sig.length) {
          const matches = sig.every((byte, index) => buffer[index] === byte);
          if (matches) {
            return { valid: true, detectedType: mimeType };
          }
        }
      }
    }

    return { valid: false };
  }

  /**
   * Accepts a base64 encoded string or Buffer, validates format/size/magic numbers, and saves to uploads/receipts/.
   * Returns relative URL path for static file serving.
   */
  public static saveAndValidatePaymentProof(
    fileBufferOrBase64: Buffer | string,
    originalFilename?: string
  ): string {
    this.ensureUploadDirectoriesExist();

    let buffer: Buffer;
    if (typeof fileBufferOrBase64 === 'string') {
      // Strip data URI header if present
      const base64Data = fileBufferOrBase64.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else {
      buffer = fileBufferOrBase64;
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new AppError('Payment proof screenshot exceeds the maximum allowed file size of 5 MB.', 400);
    }

    const verification = this.validateImageMagicNumbers(buffer);
    if (!verification.valid) {
      throw new AppError(
        'Invalid file payload. Payment proof screenshot must be a valid image file (JPEG, PNG, or WEBP).',
        400
      );
    }

    const ext = verification.detectedType === 'image/png' ? '.png' : verification.detectedType === 'image/webp' ? '.webp' : '.jpg';
    const safeFilename = `proof-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const targetPath = path.join(this.receiptsUploadDir, safeFilename);

    fs.writeFileSync(targetPath, buffer);

    return `/uploads/receipts/${safeFilename}`;
  }
}
