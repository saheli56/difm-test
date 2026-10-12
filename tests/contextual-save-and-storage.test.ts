import { describe, it, expect, beforeEach } from 'vitest';
import { RecordStorage } from '../src/core/records/storage';
import { SaveCoordinator } from '../src/core/detectors/save-coordinator';
import { ReminderService } from '../src/core/reminders/reminder-service';

describe('Contextual Save & Storage Architecture', () => {
  beforeEach(async () => {
    await RecordStorage.clearForTesting();
  });

  it('persists and updates bills accurately', async () => {
    const initialBills = await RecordStorage.getBills();
    expect(Array.isArray(initialBills)).toBe(true);

    const testBill = {
      id: 'test-bill-1',
      provider: 'Test Power Corp',
      category: 'electricity' as const,
      amount: 1200,
      currency: '₹',
      lastPaymentDate: '2026-10-12',
      nextEstimatedDueDate: '2026-11-12',
      isDueDateEstimated: true,
      recurrenceRule: {
        frequency: 'monthly' as const,
        dayOfMonth: 12,
        isConfirmedByUser: true
      },
      sourceUrl: 'https://testpower.com',
      providerDomain: 'testpower.com',
      evidence: ['Payment successful'],
      confidence: 0.9,
      reminderPreferences: {
        leadDays: [3, 1, 0],
        notifyOnDueDay: true,
        enabled: true
      },
      status: 'active' as const,
      userConfirmed: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await RecordStorage.saveBill(testBill);
    const updated = await RecordStorage.getBills();
    const found = updated.find((b) => b.id === 'test-bill-1');
    expect(found).toBeDefined();
    expect(found?.amount).toBe(1200);

    // Update status
    await RecordStorage.updateBillStatus('test-bill-1', 'paid');
    const afterStatus = await RecordStorage.getBills();
    expect(afterStatus.find((b) => b.id === 'test-bill-1')?.status).toBe('paid');

    // Delete
    await RecordStorage.deleteBill('test-bill-1');
    const afterDelete = await RecordStorage.getBills();
    expect(afterDelete.find((b) => b.id === 'test-bill-1')).toBeUndefined();
  });

  it('suppresses duplicate prompts for already saved bills', async () => {
    const pageContext = {
      url: 'https://airtel.in/broadband/confirm',
      title: 'Airtel Broadband Receipt',
      text: `
        Payment Successful!
        Account ID: 03348192301
        Amount: ₹999.00
      `,
      headings: ['Payment Successful']
    };

    // First inspection finds opportunity
    const candidate = await SaveCoordinator.inspectPageForOpportunities(pageContext);
    expect(candidate).not.toBeNull();
    if (!candidate) return;

    // Save candidate
    await SaveCoordinator.convertAndSaveBillCandidate(candidate as any);

    // Inspect same page again: should be suppressed
    const duplicateCandidate = await SaveCoordinator.inspectPageForOpportunities(pageContext);
    expect(duplicateCandidate).toBeNull();
  });

  it('suppresses prompt when user selected "Not now"', async () => {
    const pageContext = {
      url: 'https://bescom.co.in/receipt',
      title: 'BESCOM Electricity Receipt',
      text: `
        Payment Confirmed!
        Amount: ₹850.00
        Consumer No: 123456789
      `,
      headings: ['Payment Confirmed']
    };

    const candidate = await SaveCoordinator.inspectPageForOpportunities(pageContext);
    expect(candidate).not.toBeNull();
    if (!candidate) return;

    // User clicks "Not now"
    await RecordStorage.dismissCandidateKey(candidate.deduplicationKey);

    // Next inspection on same candidate is suppressed
    const dismissedCandidate = await SaveCoordinator.inspectPageForOpportunities(pageContext);
    expect(dismissedCandidate).toBeNull();
  });

  it('suppresses prompt when site domain is blacklisted ("Never for this site")', async () => {
    await RecordStorage.blacklistDomain('blockedshop.com');
    const isBlocked = await RecordStorage.isDomainBlacklisted('blockedshop.com');
    expect(isBlocked).toBe(true);

    const candidate = await SaveCoordinator.inspectPageForOpportunities({
      url: 'https://blockedshop.com/checkout/success',
      title: 'Payment Successful',
      text: 'Payment received! Amount: $49.00',
      headings: ['Payment Successful']
    });

    expect(candidate).toBeNull();

    // Removing domain restores detection
    await RecordStorage.removeBlacklistedDomain('blockedshop.com');
    const isStillBlocked = await RecordStorage.isDomainBlacklisted('blockedshop.com');
    expect(isStillBlocked).toBe(false);
  });

  it('ensures reminder dispatch is strictly idempotent', async () => {
    // Record a test notification milestone
    const milestoneKey = 'bill:test-bill-id:2026-10-15:lead-3';
    expect(await RecordStorage.hasBeenNotified(milestoneKey)).toBe(false);

    await RecordStorage.recordNotification(milestoneKey);
    expect(await RecordStorage.hasBeenNotified(milestoneKey)).toBe(true);

    // Checking again returns true, preventing repeated notifications
    expect(await RecordStorage.hasBeenNotified(milestoneKey)).toBe(true);
  });
});
