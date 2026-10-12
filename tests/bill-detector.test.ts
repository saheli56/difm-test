import { describe, it, expect } from 'vitest';
import { BillDetector } from '../src/core/detectors/bill-detector';

describe('BillDetector', () => {
  it('detects a confirmed electricity bill payment on CESC portal', () => {
    const candidate = BillDetector.detectBillPayment({
      url: 'https://cesc.co.in/quickbill/receipt',
      title: 'CESC Limited - Online Payment Receipt',
      text: `
        Receipt of Payment
        Payment Successful!
        Consumer No: 01029384912
        Amount Paid: ₹1,450.00
        Txn ID: CESC-20261012-9981
        Thank you for your payment. Next bill will be generated next month.
      `,
      headings: ['Receipt of Payment', 'Payment Successful']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.eventType).toBe('bill_payment');
    expect(candidate.extractedData.provider).toBe('CESC Limited');
    expect(candidate.extractedData.category).toBe('electricity');
    expect(candidate.extractedData.amount).toBe(1450);
    expect(candidate.extractedData.currency).toBe('₹');
    expect(candidate.extractedData.accountReference).toBe('01029384912');
    expect(candidate.confidence).toBeGreaterThanOrEqual(0.8);
    expect(candidate.deduplicationKey).toContain('cesc.co.in:electricity:01029384912');
  });

  it('detects internet broadband payment with explicit frequency', () => {
    const candidate = BillDetector.detectBillPayment({
      url: 'https://www.airtel.in/broadband/confirm',
      title: 'Airtel Broadband Payment Confirmation',
      text: `
        Payment Received!
        Transaction successful.
        Account ID: 03348192301
        Monthly plan paid: ₹999.00
        Billing cycle: 1 month
        Reference Number: AT-88192
      `,
      headings: ['Transaction Successful']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.extractedData.category).toBe('internet');
    expect(candidate.extractedData.amount).toBe(999);
    expect(candidate.extractedData.frequency).toBe('monthly');
    expect(candidate.extractedData.isFrequencyConfirmed).toBe(true);
  });

  it('rejects ambiguous payment checkout forms without confirmation evidence', () => {
    // A page where user is still filling card or clicking pay
    const candidate = BillDetector.detectBillPayment({
      url: 'https://cesc.co.in/quickbill',
      title: 'CESC Quick Bill - Enter Payment Details',
      text: `
        Consumer Number: 01029384912
        Amount: ₹1,450.00
        Select Payment Method: Credit Card / UPI / Netbanking
        Click "Pay Now" to proceed to bank gateway.
      `,
      headings: ['Enter Payment Details']
    });

    // Should NOT trigger save prompt because payment has not been confirmed!
    expect(candidate).toBeNull();
  });

  it('rejects pages without valid amounts', () => {
    const candidate = BillDetector.detectBillPayment({
      url: 'https://example.com/status',
      title: 'Payment Status',
      text: 'Payment successful, but no price or currency information here.',
      headings: ['Payment Status']
    });

    expect(candidate).toBeNull();
  });

  it('marks next due date as estimated when not explicitly stated on receipt', () => {
    const candidate = BillDetector.detectBillPayment({
      url: 'https://waterboard.gov.in/receipt',
      title: 'Municipal Water Board Receipt',
      text: `
        Payment Successful!
        Water supply bill paid: ₹420
        Consumer ID: W-991283
      `,
      headings: ['Payment Successful']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.extractedData.category).toBe('water');
    expect(candidate.extractedData.isDueDateEstimated).toBe(true);
  });
});
