export type BillCategory =
  | 'electricity'
  | 'water'
  | 'internet'
  | 'mobile'
  | 'gas'
  | 'credit_card'
  | 'insurance'
  | 'rent'
  | 'subscription'
  | 'other';

export type RecurrenceFrequency =
  | 'monthly'
  | 'bi_monthly'
  | 'quarterly'
  | 'annual'
  | 'custom_days'
  | 'one_off';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  intervalDays?: number;
  isConfirmedByUser: boolean;
}

export interface ReminderPreferences {
  leadDays: number[]; // e.g. [3, 1, 0] days before due date
  notifyOnDueDay: boolean;
  enabled: boolean;
}

export interface SavedBillRecord {
  id: string;
  provider: string;
  category: BillCategory;
  amount: number;
  currency: string;
  lastPaymentDate: string; // ISO date YYYY-MM-DD
  dueDate?: string; // ISO date YYYY-MM-DD (if explicitly on bill)
  nextEstimatedDueDate: string; // ISO date YYYY-MM-DD
  isDueDateEstimated: boolean;
  recurrenceRule: RecurrenceRule;
  sourceUrl: string;
  providerDomain: string;
  accountReference?: string; // e.g. Consumer ID, account number
  evidence: string[];
  confidence: number; // 0.0 to 1.0
  reminderPreferences: ReminderPreferences;
  lastNotifiedTimestamp?: number;
  lastNotifiedCycle?: string; // e.g. "2026-11"
  status: 'active' | 'paid' | 'snoozed' | 'archived';
  userConfirmed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type DeliveryStatus = 'ordered' | 'shipped' | 'delivered' | 'unknown';
export type ReturnEligibility = 'eligible' | 'ineligible' | 'expired' | 'unknown';
export type ReturnStatus = 'tracked' | 'return_initiated' | 'returned' | 'kept' | 'dismissed';

export interface SavedPurchaseRecord {
  id: string;
  store: string;
  storeDomain: string;
  productName: string;
  orderReference?: string;
  orderDate?: string; // ISO date YYYY-MM-DD
  deliveryDate?: string; // ISO date YYYY-MM-DD
  deliveryStatus: DeliveryStatus;
  returnDeadline?: string; // ISO date YYYY-MM-DD
  isReturnDeadlineEstimated: boolean;
  returnEligibility: ReturnEligibility;
  returnPolicyEvidence?: string;
  productPrice?: number;
  currency?: string;
  sourceUrl: string;
  evidence: string[];
  confidence: number; // 0.0 to 1.0
  reminderSchedule: {
    leadDays: number[]; // e.g. [5, 2, 0]
  };
  lastNotifiedTimestamp?: number;
  lastNotifiedMilestone?: string; // e.g. "lead-2" or "deadline"
  returnStatus: ReturnStatus;
  userConfirmed: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CandidateEventType = 'bill_payment' | 'purchase_delivery';

export interface BillCandidateData {
  provider: string;
  category: BillCategory;
  amount: number;
  currency: string;
  paymentDate: string; // ISO date
  explicitDueDate?: string; // ISO date
  estimatedNextDueDate: string; // ISO date
  isDueDateEstimated: boolean;
  frequency: RecurrenceFrequency;
  isFrequencyConfirmed: boolean;
  accountReference?: string;
}

export interface PurchaseCandidateData {
  store: string;
  productName: string;
  orderReference?: string;
  orderDate?: string;
  deliveryDate?: string;
  deliveryStatus: DeliveryStatus;
  returnDeadline?: string;
  isReturnDeadlineEstimated: boolean;
  returnEligibility: ReturnEligibility;
  productPrice?: number;
  currency?: string;
}

export interface SaveCandidate<T = BillCandidateData | PurchaseCandidateData> {
  id: string; // unique candidate ID
  eventType: CandidateEventType;
  extractedData: T;
  sourcePage: {
    url: string;
    domain: string;
    title: string;
    timestamp: number;
  };
  evidence: string[];
  confidence: number;
  requiresUserConfirmation: boolean;
  deduplicationKey: string;
}

export interface SitePreferences {
  blacklistedDomains: string[]; // Domains where user clicked "Never for this site"
  dismissedCandidateKeys: Record<string, number>; // deduplicationKey -> timestamp (Not now)
  defaultReminderLeadDays: number;
}
