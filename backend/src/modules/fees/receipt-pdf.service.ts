import PDFDocument from 'pdfkit';

export interface IReceipt {
  id?: string;
  receiptNumber: string;
  paymentId?: string;
  paymentNumber: string;
  organizationId?: string;
  branchId?: string;
  hostelName?: string;
  studentName: string;
  customerCode: string;
  studentId?: string;
  roomNumber?: string;
  bedNumber?: string;
  feeType?: string;
  installmentMonth?: string;
  paymentMethod?: string;
  issuedBy?: string;
  amount: number;
  remainingBalance?: number;
  notes?: string;
  qrPayload?: string;
  issuedAt?: string | Date;
  createdAt?: string | Date;
}

export class ReceiptPdfService {
  /**
   * Generates a PDF stream/buffer for an official payment receipt
   */
  static async generateReceiptPdf(receipt: IReceipt): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Header Bar (Deep Navy: #18233A)
      doc.rect(40, 40, doc.page.width - 80, 75).fill('#18233A');

      doc.fillColor('#FFFFFF')
        .fontSize(18)
        .font('Helvetica-Bold')
        .text('IHMS — Hostel Management System', 60, 52, { align: 'left' });

      doc.fillColor('#38BDF8')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(receipt.hostelName ? `${receipt.hostelName.toUpperCase()} · OFFICIAL RECEIPT` : 'OFFICIAL FEE PAYMENT RECEIPT', 60, 74);

      doc.fillColor('#94A3B8')
        .fontSize(8.5)
        .font('Helvetica')
        .text('Enterprise Housing & Hostel Management Portal', 60, 89);

      // Receipt No & Date
      doc.fillColor('#FFFFFF')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(`Receipt #: ${receipt.receiptNumber}`, doc.page.width - 240, 52, { align: 'right', width: 180 });

      doc.fillColor('#CBD5E1')
        .fontSize(8.5)
        .font('Helvetica')
        .text(`Date: ${new Date(receipt.issuedAt || receipt.createdAt || Date.now()).toLocaleString('en-IN')}`, doc.page.width - 240, 72, { align: 'right', width: 180 });

      let y = 130;

      // Status Badge (Paid / Partial)
      const isFull = (receipt.remainingBalance || 0) <= 0;
      doc.roundedRect(40, y, doc.page.width - 80, 32, 6).fill(isFull ? '#E8F5ED' : '#FEF3C7');
      doc.fillColor(isFull ? '#087A45' : '#C94F18')
        .fontSize(10.5)
        .font('Helvetica-Bold')
        .text(`STATUS: ${isFull ? 'FULLY PAID' : 'PARTIALLY PAID'} · CONFIRMED`, 55, y + 10);
      doc.fillColor(isFull ? '#087A45' : '#C94F18')
        .fontSize(9.5)
        .font('Helvetica')
        .text(`Ref: ${receipt.paymentNumber}`, doc.page.width - 240, y + 10, { align: 'right', width: 180 });

      y += 44;

      // Student & Accommodation Details Section
      doc.roundedRect(40, y, doc.page.width - 80, 110, 6).lineWidth(1).strokeColor('#E4E0D7').fillAndStroke('#FAFAF7', '#E4E0D7');

      doc.fillColor('#18233A').fontSize(10.5).font('Helvetica-Bold').text('STUDENT & ACCOMMODATION DETAILS', 55, y + 12);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Student Name:', 55, y + 34);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(receipt.studentName, 145, y + 34);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Student ID / Code:', 55, y + 54);
      doc.fillColor('#E87545').fontSize(9.5).font('Helvetica-Bold').text(receipt.customerCode || receipt.studentId, 145, y + 54);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Room / Bed:', 55, y + 74);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(`Room ${receipt.roomNumber || '—'} · Bed ${receipt.bedNumber || '—'}`, 145, y + 74);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Fee Category:', doc.page.width / 2 + 20, y + 34);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(receipt.feeType || receipt.installmentMonth || 'Hostel Rent', doc.page.width / 2 + 120, y + 34);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Payment Method:', doc.page.width / 2 + 20, y + 54);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(receipt.paymentMethod || 'CASH', doc.page.width / 2 + 120, y + 54);

      doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Received By:', doc.page.width / 2 + 20, y + 74);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(receipt.issuedBy || 'Authorized Staff', doc.page.width / 2 + 120, y + 74);

      y += 124;

      // Financial Breakdown Table Header
      doc.rect(40, y, doc.page.width - 80, 24).fill('#18233A');
      doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('DESCRIPTION / FEE ITEM', 55, y + 7);
      doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold').text('AMOUNT (INR)', doc.page.width - 150, y + 7, { align: 'right', width: 95 });

      y += 24;

      // Financial Item Row
      doc.rect(40, y, doc.page.width - 80, 30).fill('#FFFFFF').strokeColor('#E4E0D7').stroke();
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica').text(`${receipt.feeType || 'Hostel Fee'} Payment (${receipt.installmentMonth || 'Direct Collection'})`, 55, y + 9);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(`Rs. ${receipt.amount.toLocaleString('en-IN')}`, doc.page.width - 150, y + 9, { align: 'right', width: 95 });

      y += 30;

      // Total Paid Highlight Row (Coral Orange)
      doc.rect(40, y, doc.page.width - 80, 34).fill('#FFF3EB').strokeColor('#FDE6D6').stroke();
      doc.fillColor('#E87545').fontSize(10.5).font('Helvetica-Bold').text('TOTAL AMOUNT PAID', 55, y + 11);
      doc.fillColor('#E87545').fontSize(11).font('Helvetica-Bold').text(`Rs. ${receipt.amount.toLocaleString('en-IN')}`, doc.page.width - 160, y + 10, { align: 'right', width: 105 });

      y += 44;

      // Balance Row
      doc.roundedRect(40, y, doc.page.width - 80, 26, 4).fill('#F8FAFC').strokeColor('#E4E0D7').stroke();
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica-Bold').text('REMAINING OUTSTANDING BALANCE:', 55, y + 8);
      doc.fillColor('#000000').fontSize(9.5).font('Helvetica-Bold').text(`Rs. ${(receipt.remainingBalance || 0).toLocaleString('en-IN')}`, doc.page.width - 150, y + 7, { align: 'right', width: 95 });

      y += 38;

      // Notes section if present
      if (receipt.notes) {
        doc.roundedRect(40, y, doc.page.width - 80, 32, 4).fill('#FAFAF7').strokeColor('#E4E0D7').stroke();
        doc.fillColor('#475569').fontSize(8).font('Helvetica-Bold').text('NOTES / REMARKS:', 55, y + 6);
        doc.fillColor('#000000').fontSize(8.5).font('Helvetica').text(receipt.notes, 55, y + 17, { width: doc.page.width - 110 });
        y += 42;
      }

      // Verification & Authenticity Box
      doc.roundedRect(40, y, doc.page.width - 80, 52, 6).fill('#FAFAF7').strokeColor('#E4E0D7').stroke();
      doc.fillColor('#18233A').fontSize(8.5).font('Helvetica-Bold').text('AUTHENTICITY & VERIFICATION', 55, y + 8);
      doc.fillColor('#475569').fontSize(7.5).font('Helvetica').text(
        'This receipt is digitally generated by IHMS and represents an authenticated financial transaction. No physical signature is required. For inquiries, please contact hostel administration.',
        55, y + 22, { width: doc.page.width - 110, lineGap: 2.5 }
      );

      // Footer
      doc.fillColor('#64748B').fontSize(7.5).font('Helvetica').text(
        `Generated on ${new Date().toLocaleString('en-IN')} · IHMS Secure Hostel Management System`,
        40, doc.page.height - 35, { align: 'center', width: doc.page.width - 80 }
      );

      doc.end();
    });
  }
}
