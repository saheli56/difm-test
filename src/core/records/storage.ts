import { SavedBillRecord, SavedPurchaseRecord, SitePreferences } from './types';

export class RecordStorage {
  private static BILLS_KEY = 'difm_bills_v1';
  private static PURCHASES_KEY = 'difm_purchases_v1';
  private static PREFERENCES_KEY = 'difm_preferences_v1';
  private static NOTIFICATION_LOGS_KEY = 'difm_notification_logs_v1';

  // --- BILLS ---
  public static async getBills(): Promise<SavedBillRecord[]> {
    const raw = await this.getItem<SavedBillRecord[]>(this.BILLS_KEY);
    if (!raw || !Array.isArray(raw)) {
      return this.getDefaultBills();
    }
    return raw.filter((b) => b && typeof b.id === 'string' && typeof b.provider === 'string');
  }

  public static async saveBill(bill: SavedBillRecord): Promise<SavedBillRecord[]> {
    const current = await this.getBills();
    const existingIndex = current.findIndex((b) => b.id === bill.id);

    let updated: SavedBillRecord[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...bill, updatedAt: Date.now() };
    } else {
      updated = [{ ...bill, createdAt: bill.createdAt || Date.now(), updatedAt: Date.now() }, ...current];
    }

    await this.setItem(this.BILLS_KEY, updated);
    return updated;
  }

  public static async deleteBill(id: string): Promise<SavedBillRecord[]> {
    const current = await this.getBills();
    const updated = current.filter((b) => b.id !== id);
    await this.setItem(this.BILLS_KEY, updated);
    return updated;
  }

  public static async updateBillStatus(
    id: string,
    status: SavedBillRecord['status'],
    additionalUpdates?: Partial<SavedBillRecord>
  ): Promise<SavedBillRecord[]> {
    const current = await this.getBills();
    const updated = current.map((b) =>
      b.id === id ? { ...b, status, ...(additionalUpdates || {}), updatedAt: Date.now() } : b
    );
    await this.setItem(this.BILLS_KEY, updated);
    return updated;
  }

  // --- PURCHASES ---
  public static async getPurchases(): Promise<SavedPurchaseRecord[]> {
    const raw = await this.getItem<SavedPurchaseRecord[]>(this.PURCHASES_KEY);
    if (!raw || !Array.isArray(raw)) {
      return this.getDefaultPurchases();
    }
    return raw.filter((p) => p && typeof p.id === 'string' && typeof p.productName === 'string');
  }

  public static async savePurchase(purchase: SavedPurchaseRecord): Promise<SavedPurchaseRecord[]> {
    const current = await this.getPurchases();
    const existingIndex = current.findIndex((p) => p.id === purchase.id);

    let updated: SavedPurchaseRecord[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...purchase, updatedAt: Date.now() };
    } else {
      updated = [{ ...purchase, createdAt: purchase.createdAt || Date.now(), updatedAt: Date.now() }, ...current];
    }

    await this.setItem(this.PURCHASES_KEY, updated);
    return updated;
  }

  public static async deletePurchase(id: string): Promise<SavedPurchaseRecord[]> {
    const current = await this.getPurchases();
    const updated = current.filter((p) => p.id !== id);
    await this.setItem(this.PURCHASES_KEY, updated);
    return updated;
  }

  public static async updatePurchaseStatus(
    id: string,
    returnStatus: SavedPurchaseRecord['returnStatus'],
    additionalUpdates?: Partial<SavedPurchaseRecord>
  ): Promise<SavedPurchaseRecord[]> {
    const current = await this.getPurchases();
    const updated = current.map((p) =>
      p.id === id ? { ...p, returnStatus, ...(additionalUpdates || {}), updatedAt: Date.now() } : p
    );
    await this.setItem(this.PURCHASES_KEY, updated);
    return updated;
  }

  // --- PREFERENCES & SUPPRESSION ---
  public static async getPreferences(): Promise<SitePreferences> {
    const raw = await this.getItem<SitePreferences>(this.PREFERENCES_KEY);
    return (
      raw || {
        blacklistedDomains: [],
        dismissedCandidateKeys: {},
        defaultReminderLeadDays: 3
      }
    );
  }

  public static async blacklistDomain(domain: string): Promise<SitePreferences> {
    const prefs = await this.getPreferences();
    const clean = domain.toLowerCase().trim();
    if (!prefs.blacklistedDomains.includes(clean)) {
      prefs.blacklistedDomains.push(clean);
      await this.setItem(this.PREFERENCES_KEY, prefs);
    }
    return prefs;
  }

  public static async removeBlacklistedDomain(domain: string): Promise<SitePreferences> {
    const prefs = await this.getPreferences();
    const clean = domain.toLowerCase().trim();
    prefs.blacklistedDomains = prefs.blacklistedDomains.filter((d) => d !== clean);
    await this.setItem(this.PREFERENCES_KEY, prefs);
    return prefs;
  }

  public static async isDomainBlacklisted(domain: string): Promise<boolean> {
    const prefs = await this.getPreferences();
    const clean = domain.toLowerCase().trim();
    return prefs.blacklistedDomains.some((d) => clean.includes(d) || d.includes(clean));
  }

  public static async dismissCandidateKey(deduplicationKey: string): Promise<void> {
    const prefs = await this.getPreferences();
    prefs.dismissedCandidateKeys[deduplicationKey] = Date.now();
    await this.setItem(this.PREFERENCES_KEY, prefs);
  }

  public static async isCandidateDismissed(deduplicationKey: string): Promise<boolean> {
    const prefs = await this.getPreferences();
    const timestamp = prefs.dismissedCandidateKeys[deduplicationKey];
    if (!timestamp) return false;
    // Dismissal lasts 24 hours
    const ageMs = Date.now() - timestamp;
    return ageMs < 24 * 60 * 60 * 1000;
  }

  // --- IDEMPOTENT NOTIFICATION LOGS ---
  public static async hasBeenNotified(milestoneKey: string): Promise<boolean> {
    const logs = (await this.getItem<Record<string, number>>(this.NOTIFICATION_LOGS_KEY)) || {};
    return Boolean(logs[milestoneKey]);
  }

  public static async recordNotification(milestoneKey: string): Promise<void> {
    const logs = (await this.getItem<Record<string, number>>(this.NOTIFICATION_LOGS_KEY)) || {};
    logs[milestoneKey] = Date.now();
    await this.setItem(this.NOTIFICATION_LOGS_KEY, logs);
  }

  // --- STORAGE PRIMITIVES & TESTING SUPPORT ---
  private static memoryFallback: Map<string, string> = new Map();

  public static async clearForTesting(): Promise<void> {
    this.memoryFallback.clear();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.clear();
    }
  }

  private static async getItem<T>(key: string): Promise<T | null> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const res = await chrome.storage.local.get([key]);
      return (res[key] as T) || null;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    }
    const mem = this.memoryFallback.get(key);
    return mem ? (JSON.parse(mem) as T) : null;
  }

  private static async setItem<T>(key: string, value: T): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return;
      } catch {}
    }
    this.memoryFallback.set(key, JSON.stringify(value));
  }

  // --- DEFAULT SEED DATA ---
  private static getDefaultBills(): SavedBillRecord[] {
    return [
      {
        id: 'bill-cesc-sample',
        provider: 'CESC Limited',
        category: 'electricity',
        amount: 1450,
        currency: '₹',
        lastPaymentDate: '2026-09-10',
        nextEstimatedDueDate: '2026-10-10',
        isDueDateEstimated: false,
        recurrenceRule: {
          frequency: 'monthly',
          dayOfMonth: 10,
          isConfirmedByUser: true
        },
        sourceUrl: 'https://cesc.co.in/quickbill',
        providerDomain: 'cesc.co.in',
        accountReference: '01029384912',
        evidence: ['Transaction reference: CESC-TX-88392', 'Receipt verified on 2026-09-10'],
        confidence: 0.95,
        reminderPreferences: {
          leadDays: [3, 1, 0],
          notifyOnDueDay: true,
          enabled: true
        },
        status: 'active',
        userConfirmed: true,
        createdAt: Date.now() - 86400000 * 30,
        updatedAt: Date.now() - 86400000 * 30
      },
      {
        id: 'bill-airtel-sample',
        provider: 'Airtel Broadband',
        category: 'internet',
        amount: 999,
        currency: '₹',
        lastPaymentDate: '2026-09-22',
        nextEstimatedDueDate: '2026-10-22',
        isDueDateEstimated: true,
        recurrenceRule: {
          frequency: 'monthly',
          dayOfMonth: 22,
          isConfirmedByUser: true
        },
        sourceUrl: 'https://airtel.in/broadband',
        providerDomain: 'airtel.in',
        accountReference: '03348192301',
        evidence: ['Payment successful confirmation', 'Amount: ₹999'],
        confidence: 0.9,
        reminderPreferences: {
          leadDays: [3, 0],
          notifyOnDueDay: true,
          enabled: true
        },
        status: 'active',
        userConfirmed: true,
        createdAt: Date.now() - 86400000 * 18,
        updatedAt: Date.now() - 86400000 * 18
      }
    ];
  }

  private static getDefaultPurchases(): SavedPurchaseRecord[] {
    return [
      {
        id: 'purchase-sony-sample',
        store: 'Amazon',
        storeDomain: 'amazon.in',
        productName: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
        orderReference: '403-8829103-9182301',
        orderDate: '2026-10-02',
        deliveryDate: '2026-10-06',
        deliveryStatus: 'delivered',
        returnDeadline: '2026-10-16',
        isReturnDeadlineEstimated: false,
        returnEligibility: 'eligible',
        returnPolicyEvidence: 'Return window eligible through Oct 16, 2026',
        productPrice: 24990,
        currency: '₹',
        sourceUrl: 'https://www.amazon.in/gp/your-account/order-history',
        evidence: ['Delivered Oct 6', 'Order #403-8829103-9182301', 'Return window eligible through Oct 16'],
        confidence: 0.95,
        reminderSchedule: {
          leadDays: [5, 2, 0]
        },
        returnStatus: 'tracked',
        userConfirmed: true,
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now() - 86400000 * 4
      }
    ];
  }
}
