import { SavedBillRecord, SavedPurchaseRecord } from '../records/types';
import { RecordStorage } from '../records/storage';
import { RecurrenceCalculator } from '../detectors/recurrence-calculator';

export interface AttentionItem {
  id: string;
  type: 'bill' | 'purchase';
  title: string;
  subtitle: string;
  dueDate: string; // ISO date
  daysRemaining: number;
  urgency: 'overdue' | 'urgent' | 'upcoming' | 'info';
  isEstimated: boolean;
  actionLabel: string;
  actionType: 'pay_bill' | 'start_return' | 'confirm_date' | 'open_portal';
  item: SavedBillRecord | SavedPurchaseRecord;
}

export class ReminderService {
  /**
   * Generates prioritized list of items needing user attention right now.
   */
  public static async getAttentionItems(): Promise<AttentionItem[]> {
    const bills = await RecordStorage.getBills();
    const purchases = await RecordStorage.getPurchases();
    const todayIso = RecurrenceCalculator.getTodayIso();

    const items: AttentionItem[] = [];

    // 1. Process Bills
    for (const bill of bills) {
      if (bill.status !== 'active') continue;

      const dueDate = bill.nextEstimatedDueDate;
      const daysRemaining = RecurrenceCalculator.getDaysDifference(dueDate, todayIso);

      let urgency: AttentionItem['urgency'] = 'upcoming';
      if (daysRemaining < 0) {
        urgency = 'overdue';
      } else if (daysRemaining <= 2) {
        urgency = 'urgent';
      } else if (daysRemaining <= 7) {
        urgency = 'upcoming';
      } else {
        continue; // Not requiring immediate attention if > 7 days away
      }

      items.push({
        id: `att-bill-${bill.id}`,
        type: 'bill',
        title: `${bill.provider} (${bill.currency}${bill.amount})`,
        subtitle:
          daysRemaining < 0
            ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`
            : daysRemaining === 0
            ? 'Due today!'
            : `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}${bill.isDueDateEstimated ? ' (estimated)' : ''}`,
        dueDate,
        daysRemaining,
        urgency,
        isEstimated: bill.isDueDateEstimated,
        actionLabel: 'Pay Now',
        actionType: 'pay_bill',
        item: bill
      });
    }

    // 2. Process Purchases
    for (const purchase of purchases) {
      if (purchase.returnStatus !== 'tracked' || !purchase.returnDeadline) continue;

      const daysRemaining = RecurrenceCalculator.getDaysDifference(purchase.returnDeadline, todayIso);

      let urgency: AttentionItem['urgency'] = 'upcoming';
      if (daysRemaining < 0) {
        // Return window already expired
        continue;
      } else if (daysRemaining <= 2) {
        urgency = 'urgent';
      } else if (daysRemaining <= 7) {
        urgency = 'upcoming';
      } else {
        continue;
      }

      items.push({
        id: `att-purch-${purchase.id}`,
        type: 'purchase',
        title: purchase.productName,
        subtitle:
          daysRemaining === 0
            ? 'Return deadline is TODAY!'
            : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to return${purchase.isReturnDeadlineEstimated ? ' (estimated)' : ''}`,
        dueDate: purchase.returnDeadline,
        daysRemaining,
        urgency,
        isEstimated: purchase.isReturnDeadlineEstimated,
        actionLabel: 'Start Return',
        actionType: 'start_return',
        item: purchase
      });
    }

    // Sort by most urgent first
    return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * Evaluates all records and dispatches background Chrome notifications idempotently.
   */
  public static async checkAndDispatchReminders(): Promise<{ dispatchedCount: number }> {
    const bills = await RecordStorage.getBills();
    const purchases = await RecordStorage.getPurchases();
    const todayIso = RecurrenceCalculator.getTodayIso();
    let dispatchedCount = 0;

    // Check Bills
    for (const bill of bills) {
      if (bill.status !== 'active' || !bill.reminderPreferences.enabled) continue;

      const daysDiff = RecurrenceCalculator.getDaysDifference(bill.nextEstimatedDueDate, todayIso);
      const leadDays = bill.reminderPreferences.leadDays || [3, 1, 0];

      if (leadDays.includes(daysDiff)) {
        const milestoneKey = `bill:${bill.id}:${bill.nextEstimatedDueDate}:lead-${daysDiff}`;
        const alreadyNotified = await RecordStorage.hasBeenNotified(milestoneKey);

        if (!alreadyNotified) {
          const message =
            daysDiff === 0
              ? `Your ${bill.provider} bill (${bill.currency}${bill.amount}) is due today!`
              : `Reminder: Your ${bill.provider} bill (${bill.currency}${bill.amount}) is due in ${daysDiff} days.`;

          this.sendSystemNotification(`DIFM Bill Reminder: ${bill.provider}`, message);
          await RecordStorage.recordNotification(milestoneKey);
          dispatchedCount++;
        }
      }
    }

    // Check Purchases
    for (const purchase of purchases) {
      if (purchase.returnStatus !== 'tracked' || !purchase.returnDeadline) continue;

      const daysDiff = RecurrenceCalculator.getDaysDifference(purchase.returnDeadline, todayIso);
      const leadDays = purchase.reminderSchedule?.leadDays || [5, 2, 0];

      if (leadDays.includes(daysDiff)) {
        const milestoneKey = `purchase:${purchase.id}:lead-${daysDiff}`;
        const alreadyNotified = await RecordStorage.hasBeenNotified(milestoneKey);

        if (!alreadyNotified) {
          const message =
            daysDiff === 0
              ? `Today is the final day to return ${purchase.productName} on ${purchase.store}!`
              : `Return Window Alert: ${daysDiff} day${daysDiff === 1 ? '' : 's'} remaining to return ${purchase.productName}.`;

          this.sendSystemNotification(`DIFM Return Window: ${purchase.store}`, message);
          await RecordStorage.recordNotification(milestoneKey);
          dispatchedCount++;
        }
      }
    }

    return { dispatchedCount };
  }

  private static sendSystemNotification(title: string, message: string) {
    if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.svg',
        title,
        message,
        priority: 2
      });
    }
  }
}
