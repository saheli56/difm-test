import { DeliveryStatus, PurchaseCandidateData, ReturnEligibility, SaveCandidate } from '../records/types';
import { PageInspectionContext } from './bill-detector';
import { RecurrenceCalculator } from './recurrence-calculator';

export class PurchaseDetector {
  private static ORDER_PAGE_URL_PATTERNS = [
    '/order',
    '/orders',
    '/your-orders',
    '/order-details',
    '/gp/your-account/order-history',
    '/account/orders',
    '/checkout/success',
    '/thank-you',
    '/order-confirmed',
    '/tracking',
    '/track-order'
  ];

  private static DELIVERED_PHRASES = [
    'delivered today',
    'delivered on',
    'delivered yesterday',
    'your package was delivered',
    'package was delivered',
    'item delivered',
    'shipment delivered',
    'has been delivered'
  ];

  private static SHIPPED_PHRASES = [
    'out for delivery',
    'shipped',
    'on the way',
    'arriving today',
    'arriving tomorrow',
    'expected delivery',
    'dispatched'
  ];

  private static RETURN_DEADLINE_PATTERNS = [
    /(?:return\s*(?:window\s*)?(?:eligible|valid)?\s*through|return\s*or\s*replace\s*items?:\s*eligible\s*through|return\s*window\s*closed\s*on|return\s*deadline:\s*|eligible\s*for\s*return\s*until)[\s:]*([a-zA-Z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i,
    /(?:return\s*(?:window)?\s*ends\s*(?:on)?|returnable\s*until|returns\s*accepted\s*until)[\s:]*([a-zA-Z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i
  ];

  private static NON_RETURNABLE_PHRASES = [
    'this item is non-returnable',
    'non-returnable',
    'not eligible for return',
    'return window closed',
    'final sale',
    'no returns accepted'
  ];

  public static detectPurchaseOrder(context: PageInspectionContext): SaveCandidate<PurchaseCandidateData> | null {
    const lowerUrl = context.url.toLowerCase();
    const lowerText = context.text.toLowerCase();
    const lowerTitle = context.title.toLowerCase();

    // 1. Check if page is an order or delivery page
    const isOrderUrl = this.ORDER_PAGE_URL_PATTERNS.some((p) => lowerUrl.includes(p));
    const hasOrderKeywords =
      lowerText.includes('order #') ||
      lowerText.includes('order details') ||
      lowerText.includes('ordered on') ||
      lowerText.includes('order id') ||
      lowerText.includes('order placed') ||
      lowerTitle.includes('order') ||
      lowerTitle.includes('delivery');

    if (!isOrderUrl && !hasOrderKeywords) {
      return null;
    }

    // 2. Identify Store
    const store = this.detectStore(context);
    const domain = this.extractDomain(context.url);

    // 3. Extract Order Reference / ID
    const orderReference = this.extractOrderReference(context.text);

    // 4. Extract Product Name
    const productName = this.extractProductName(context);
    if (!productName || productName.length < 3) {
      return null;
    }

    // 5. Determine Delivery Status (ordered, shipped, delivered)
    const deliveryInfo = this.extractDeliveryInfo(context.text);
    const deliveryStatus = deliveryInfo.status;
    const deliveryDate = deliveryInfo.date;

    // 6. Return Eligibility and Return Deadline
    const returnInfo = this.extractReturnInfo(context.text, deliveryDate, store);

    // 7. Compile Evidence
    const evidence: string[] = [
      `Store: ${store}`,
      `Product: ${productName}`,
      `Delivery Status: ${deliveryStatus}`
    ];
    if (orderReference) evidence.push(`Order ID: ${orderReference}`);
    if (deliveryDate) evidence.push(`Delivery Date: ${deliveryDate}`);
    if (returnInfo.evidence) evidence.push(`Policy/Deadline: ${returnInfo.evidence}`);

    // Confidence
    let confidence = 0.6;
    if (orderReference) confidence += 0.15;
    if (deliveryStatus === 'delivered') confidence += 0.1;
    if (returnInfo.returnDeadline && !returnInfo.isEstimated) confidence += 0.15;
    confidence = Math.min(confidence, 1.0);

    // Deduplication Key
    const productSlug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const deduplicationKey = `purchase:${domain}:${orderReference || productSlug}`;

    return {
      id: `candidate-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      eventType: 'purchase_delivery',
      extractedData: {
        store,
        productName,
        orderReference,
        orderDate: this.extractOrderDate(context.text),
        deliveryDate,
        deliveryStatus,
        returnDeadline: returnInfo.returnDeadline,
        isReturnDeadlineEstimated: returnInfo.isEstimated,
        returnEligibility: returnInfo.eligibility
      },
      sourcePage: {
        url: context.url,
        domain,
        title: context.title,
        timestamp: Date.now()
      },
      evidence,
      confidence,
      requiresUserConfirmation: true,
      deduplicationKey
    };
  }

  private static detectStore(context: PageInspectionContext): string {
    const domain = this.extractDomain(context.url);
    if (domain.includes('amazon')) return 'Amazon';
    if (domain.includes('flipkart')) return 'Flipkart';
    if (domain.includes('myntra')) return 'Myntra';
    if (domain.includes('meesho')) return 'Meesho';
    if (domain.includes('bestbuy')) return 'Best Buy';
    if (domain.includes('walmart')) return 'Walmart';
    if (domain.includes('target')) return 'Target';
    if (domain.includes('apple')) return 'Apple';
    if (domain.includes('ebay')) return 'eBay';

    const parts = context.title.split(/[-–|:•]/).map((s) => s.trim());
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (last.length > 2 && last.length < 25) return last;
    }

    const host = domain.replace(/^www\./, '').split('.')[0];
    return host ? host.charAt(0).toUpperCase() + host.slice(1) : 'Online Store';
  }

  private static extractOrderReference(text: string): string | undefined {
    // Patterns for Amazon: 403-1234567-8901234, Flipkart: OD12345678901234, generic
    const patterns = [
      /(?:order\s*#|order\s*id|order\s*number)[\s:]*([0-9]{3}-[0-9]{7}-[0-9]{7})/i,
      /(?:order\s*#|order\s*id|order\s*number)[\s:]*([A-Z0-9-]{8,25})/i,
      /(?:OD|ORD)[0-9]{12,20}/i
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        return match[1].trim();
      } else if (match && match[0]) {
        return match[0].trim();
      }
    }
    return undefined;
  }

  private static extractProductName(context: PageInspectionContext): string | undefined {
    // 1. Look for explicit product headings or titles
    if (context.headings && context.headings.length > 0) {
      for (const h of context.headings) {
        const clean = h.trim();
        if (
          clean.length >= 8 &&
          clean.length <= 120 &&
          !clean.toLowerCase().includes('order details') &&
          !clean.toLowerCase().includes('recommended') &&
          !clean.toLowerCase().includes('frequently bought') &&
          !clean.toLowerCase().includes('buy again')
        ) {
          return clean;
        }
      }
    }

    // 2. Look for product link text or lines in text
    const lines = context.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    for (const line of lines) {
      if (
        line.length >= 10 &&
        line.length <= 100 &&
        !line.toLowerCase().startsWith('delivered') &&
        !line.toLowerCase().startsWith('ordered') &&
        !line.toLowerCase().startsWith('order #') &&
        !line.toLowerCase().startsWith('ship to') &&
        !line.toLowerCase().startsWith('total') &&
        !line.toLowerCase().startsWith('return')
      ) {
        return line;
      }
    }

    return undefined;
  }

  private static extractDeliveryInfo(text: string): { status: DeliveryStatus; date?: string } {
    const lower = text.toLowerCase();

    // 1. Direct delivery date match: e.g. "Delivered October 10, 2026" or "Delivered on Oct 6"
    const deliveredDateMatch = text.match(/(?:delivered\s*(?:on|by)?)\s*([a-zA-Z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);
    if (deliveredDateMatch && deliveredDateMatch[1]) {
      const dateIso = RecurrenceCalculator.parseAnyDateToIso(deliveredDateMatch[1]);
      return { status: 'delivered', date: dateIso };
    }

    // 2. Relative delivered phrases
    if (lower.includes('delivered today')) {
      return { status: 'delivered', date: RecurrenceCalculator.getTodayIso() };
    }

    for (const phrase of this.DELIVERED_PHRASES) {
      if (lower.includes(phrase)) {
        return { status: 'delivered' };
      }
    }

    // Check shipped
    for (const phrase of this.SHIPPED_PHRASES) {
      if (lower.includes(phrase)) {
        return { status: 'shipped' };
      }
    }

    if (lower.includes('order placed') || lower.includes('ordered on')) {
      return { status: 'ordered' };
    }

    return { status: 'unknown' };
  }

  private static extractReturnInfo(
    text: string,
    deliveryDate: string | undefined,
    store: string
  ): { returnDeadline?: string; isEstimated: boolean; eligibility: ReturnEligibility; evidence?: string } {
    const lower = text.toLowerCase();

    // 1. Check non-returnable phrases
    for (const phrase of this.NON_RETURNABLE_PHRASES) {
      if (lower.includes(phrase)) {
        return {
          isEstimated: false,
          eligibility: 'ineligible',
          evidence: `Item marked as non-returnable: "${phrase}"`
        };
      }
    }

    // 2. Check explicit return deadline on page
    for (const pat of this.RETURN_DEADLINE_PATTERNS) {
      const match = text.match(pat);
      if (match && match[1]) {
        const deadlineIso = RecurrenceCalculator.parseAnyDateToIso(match[1]);
        const diff = RecurrenceCalculator.getDaysDifference(deadlineIso);
        const eligibility: ReturnEligibility = diff >= 0 ? 'eligible' : 'expired';
        return {
          returnDeadline: deadlineIso,
          isEstimated: false,
          eligibility,
          evidence: `Explicit deadline found: ${match[0]}`
        };
      }
    }

    // 3. If delivered, calculate standard estimated policy window (e.g. 10 days for Amazon/electronics, 7 days for Flipkart, 14 days standard)
    if (deliveryDate) {
      const deliveryParsed = RecurrenceCalculator.parseIsoDate(deliveryDate);
      let windowDays = 10; // Default reasonable return window
      if (store.toLowerCase().includes('amazon')) windowDays = 10;
      else if (store.toLowerCase().includes('flipkart')) windowDays = 7;
      else if (store.toLowerCase().includes('myntra')) windowDays = 14;

      const deadline = new Date(deliveryParsed.getTime());
      deadline.setDate(deadline.getDate() + windowDays);
      const deadlineIso = RecurrenceCalculator.formatIsoDate(deadline);
      const diff = RecurrenceCalculator.getDaysDifference(deadlineIso);

      return {
        returnDeadline: deadlineIso,
        isEstimated: true,
        eligibility: diff >= 0 ? 'eligible' : 'expired',
        evidence: `Estimated ${windowDays}-day return policy window based on delivery date (${deliveryDate})`
      };
    }

    return {
      isEstimated: true,
      eligibility: 'unknown',
      evidence: 'Delivery status pending or return policy unverified'
    };
  }

  private static extractOrderDate(text: string): string | undefined {
    const match = text.match(/(?:ordered\s*on|order\s*date)[\s:]*([a-zA-Z]{3,9}\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i);
    if (match && match[1]) {
      return RecurrenceCalculator.parseAnyDateToIso(match[1]);
    }
    return undefined;
  }

  private static extractDomain(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  }
}
