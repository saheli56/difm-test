import { BillCandidateData, PurchaseCandidateData, SaveCandidate, SavedBillRecord, SavedPurchaseRecord } from '../records/types';
import { RecordStorage } from '../records/storage';
import { BillDetector, PageInspectionContext } from './bill-detector';
import { PurchaseDetector } from './purchase-detector';

export class SaveCoordinator {
  /**
   * Inspects the page and returns a candidate if eligible and not suppressed.
   */
  public static async inspectPageForOpportunities(
    context: PageInspectionContext
  ): Promise<SaveCandidate | null> {
    const domain = BillDetector.extractDomain(context.url);
    if (!domain) return null;

    // 1. Check if domain is blacklisted by user ("Never for this site")
    const isBlacklisted = await RecordStorage.isDomainBlacklisted(domain);
    if (isBlacklisted) {
      return null;
    }

    // 2. Try Bill Payment Detection
    const billCandidate = BillDetector.detectBillPayment(context);
    if (billCandidate) {
      const shouldPrompt = await this.validateCandidateAgainstExisting(billCandidate);
      if (shouldPrompt) {
        return billCandidate;
      }
    }

    // 3. Try Purchase / Order Delivery Detection
    const purchaseCandidate = PurchaseDetector.detectPurchaseOrder(context);
    if (purchaseCandidate) {
      const shouldPrompt = await this.validateCandidateAgainstExisting(purchaseCandidate);
      if (shouldPrompt) {
        return purchaseCandidate;
      }
    }

    return null;
  }

  /**
   * Validates whether candidate should be presented to user (checking duplicate records & dismissals).
   */
  private static async validateCandidateAgainstExisting(candidate: SaveCandidate): Promise<boolean> {
    // Check if dismissed recently ("Not now")
    const isDismissed = await RecordStorage.isCandidateDismissed(candidate.deduplicationKey);
    if (isDismissed) {
      return false;
    }

    if (candidate.eventType === 'bill_payment') {
      const bills = await RecordStorage.getBills();
      const data = candidate.extractedData as BillCandidateData;
      // Check if bill with same provider / accountReference already exists
      const alreadySaved = bills.some(
        (b) =>
          b.provider.toLowerCase() === data.provider.toLowerCase() &&
          (data.accountReference ? b.accountReference === data.accountReference : true) &&
          b.lastPaymentDate === data.paymentDate
      );
      if (alreadySaved) return false;
    } else if (candidate.eventType === 'purchase_delivery') {
      const purchases = await RecordStorage.getPurchases();
      const data = candidate.extractedData as PurchaseCandidateData;
      const alreadySaved = purchases.some(
        (p) =>
          (data.orderReference ? p.orderReference === data.orderReference : false) ||
          p.productName.toLowerCase() === data.productName.toLowerCase()
      );
      if (alreadySaved) return false;
    }

    return true;
  }

  /**
   * Converts a user-confirmed bill candidate into a persistent SavedBillRecord.
   */
  public static async convertAndSaveBillCandidate(
    candidate: SaveCandidate<BillCandidateData>,
    userOverrides?: Partial<BillCandidateData>
  ): Promise<SavedBillRecord> {
    const data = { ...candidate.extractedData, ...(userOverrides || {}) };

    const record: SavedBillRecord = {
      id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      provider: data.provider,
      category: data.category,
      amount: data.amount,
      currency: data.currency,
      lastPaymentDate: data.paymentDate,
      dueDate: data.explicitDueDate,
      nextEstimatedDueDate: data.estimatedNextDueDate,
      isDueDateEstimated: data.isDueDateEstimated,
      recurrenceRule: {
        frequency: data.frequency,
        dayOfMonth: new Date(data.paymentDate).getDate() || 1,
        isConfirmedByUser: true
      },
      sourceUrl: candidate.sourcePage.url,
      providerDomain: candidate.sourcePage.domain,
      accountReference: data.accountReference,
      evidence: candidate.evidence,
      confidence: candidate.confidence,
      reminderPreferences: {
        leadDays: [3, 1, 0],
        notifyOnDueDay: true,
        enabled: true
      },
      status: 'active',
      userConfirmed: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await RecordStorage.saveBill(record);
    return record;
  }

  /**
   * Converts a user-confirmed purchase candidate into a persistent SavedPurchaseRecord.
   */
  public static async convertAndSavePurchaseCandidate(
    candidate: SaveCandidate<PurchaseCandidateData>,
    userOverrides?: Partial<PurchaseCandidateData>
  ): Promise<SavedPurchaseRecord> {
    const data = { ...candidate.extractedData, ...(userOverrides || {}) };

    const record: SavedPurchaseRecord = {
      id: `purchase-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      store: data.store,
      storeDomain: candidate.sourcePage.domain,
      productName: data.productName,
      orderReference: data.orderReference,
      orderDate: data.orderDate,
      deliveryDate: data.deliveryDate,
      deliveryStatus: data.deliveryStatus,
      returnDeadline: data.returnDeadline,
      isReturnDeadlineEstimated: data.isReturnDeadlineEstimated,
      returnEligibility: data.returnEligibility,
      productPrice: data.productPrice,
      currency: data.currency,
      sourceUrl: candidate.sourcePage.url,
      evidence: candidate.evidence,
      confidence: candidate.confidence,
      reminderSchedule: {
        leadDays: [5, 2, 0]
      },
      returnStatus: 'tracked',
      userConfirmed: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await RecordStorage.savePurchase(record);
    return record;
  }
}
