import { describe, it, expect } from 'vitest';
import { PurchaseDetector } from '../src/core/detectors/purchase-detector';

describe('PurchaseDetector', () => {
  it('detects a delivered order with explicit return deadline on Amazon', () => {
    const candidate = PurchaseDetector.detectPurchaseOrder({
      url: 'https://www.amazon.in/gp/your-account/order-history/ref=ppx_yo_dt_b_asin_title_o01_s00',
      title: 'Your Orders - Amazon.in',
      text: `
        Order # 403-8829103-9182301
        Ordered on October 2, 2026
        Delivered October 6, 2026
        Package was delivered to resident
        Sony WH-1000XM5 Wireless Noise Cancelling Headphones
        Return or replace items: Eligible through October 16, 2026
        Buy it again | Track package | View receipt
      `,
      headings: ['Sony WH-1000XM5 Wireless Noise Cancelling Headphones', 'Order Details']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.eventType).toBe('purchase_delivery');
    expect(candidate.extractedData.store).toBe('Amazon');
    expect(candidate.extractedData.orderReference).toBe('403-8829103-9182301');
    expect(candidate.extractedData.deliveryStatus).toBe('delivered');
    expect(candidate.extractedData.deliveryDate).toBe('2026-10-06');
    expect(candidate.extractedData.returnDeadline).toBe('2026-10-16');
    expect(candidate.extractedData.isReturnDeadlineEstimated).toBe(false);
    expect(candidate.extractedData.returnEligibility).toBe('eligible');
  });

  it('calculates estimated return window when delivery date is known but return deadline is omitted', () => {
    const candidate = PurchaseDetector.detectPurchaseOrder({
      url: 'https://www.flipkart.com/account/orders',
      title: 'My Orders - Flipkart.com',
      text: `
        Order ID: OD991829102918291
        Delivered October 10, 2026
        Boat Rockerz 450 Bluetooth Headset
        Rate & Review Product
      `,
      headings: ['Boat Rockerz 450 Bluetooth Headset']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.extractedData.store).toBe('Flipkart');
    expect(candidate.extractedData.deliveryStatus).toBe('delivered');
    expect(candidate.extractedData.deliveryDate).toBe('2026-10-10');
    // Estimated 7 days for Flipkart
    expect(candidate.extractedData.returnDeadline).toBe('2026-10-17');
    expect(candidate.extractedData.isReturnDeadlineEstimated).toBe(true);
  });

  it('does NOT infer delivery simply because an order exists', () => {
    const candidate = PurchaseDetector.detectPurchaseOrder({
      url: 'https://www.amazon.in/order-details',
      title: 'Order Placed - Amazon.in',
      text: `
        Order # 403-1111111-2222222
        Order placed on October 12, 2026
        Arriving Monday, October 19
        Mechanical Gaming Keyboard
      `,
      headings: ['Mechanical Gaming Keyboard']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    // Delivery status should NOT be delivered!
    expect(candidate.extractedData.deliveryStatus).not.toBe('delivered');
    expect(candidate.extractedData.deliveryDate).toBeUndefined();
    expect(candidate.extractedData.returnEligibility).toBe('unknown');
  });

  it('marks non-returnable items as ineligible', () => {
    const candidate = PurchaseDetector.detectPurchaseOrder({
      url: 'https://www.amazon.in/order-details',
      title: 'Order Details',
      text: `
        Order # 403-9999999-0000000
        Delivered October 8, 2026
        Philips Air Purifier Replacement Filter
        This item is non-returnable
      `,
      headings: ['Philips Air Purifier Replacement Filter']
    });

    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(candidate.extractedData.returnEligibility).toBe('ineligible');
    expect(candidate.extractedData.returnDeadline).toBeUndefined();
  });
});
