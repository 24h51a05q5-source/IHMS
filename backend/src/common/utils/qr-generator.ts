import QRCode from 'qrcode';

export async function generateQrDataUrl(payload: string | object): Promise<string> {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err: any) {
    console.error('[QRCode] Failed to generate QR code data URL:', err);
    return '';
  }
}
