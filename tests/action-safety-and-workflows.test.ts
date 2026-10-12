import { describe, it, expect } from 'vitest';
import { ReturnInitiator } from '../src/core/actions/return-initiator';
import { BillPreparer } from '../src/core/actions/bill-preparer';
import { ReactiveGuard } from '../src/core/engine/reactive-guard';
import { SavedBillRecord, SavedPurchaseRecord } from '../src/core/records/types';

describe('Action Safety & Workflows Engine', () => {
  const samplePurchase: SavedPurchaseRecord = {
    id: 'pur-123',
    store: 'Amazon',
    storeDomain: 'amazon.in',
    productName: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    orderReference: '403-8829103-9182301',
    deliveryStatus: 'delivered',
    isReturnDeadlineEstimated: false,
    returnEligibility: 'eligible',
    sourceUrl: 'https://www.amazon.in/gp/your-account/order-history',
    evidence: [],
    confidence: 1.0,
    reminderSchedule: { leadDays: [5, 2, 0] },
    returnStatus: 'tracked',
    userConfirmed: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const sampleBill: SavedBillRecord = {
    id: 'bill-123',
    provider: 'CESC Limited',
    category: 'electricity',
    amount: 1450,
    currency: '₹',
    lastPaymentDate: '2026-09-10',
    nextEstimatedDueDate: '2026-10-10',
    isDueDateEstimated: false,
    recurrenceRule: { frequency: 'monthly', isConfirmedByUser: true },
    sourceUrl: 'https://cesc.co.in/quickbill',
    providerDomain: 'cesc.co.in',
    accountReference: '01029384912',
    evidence: [],
    confidence: 1.0,
    reminderPreferences: { leadDays: [3, 1, 0], notifyOnDueDay: true, enabled: true },
    status: 'active',
    userConfirmed: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  it('accurately verifies product match via order reference', () => {
    const candidateText = 'Order # 403-8829103-9182301 placed on Oct 2';
    const result = ReturnInitiator.verifyProductMatch(candidateText, samplePurchase);
    expect(result.matches).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('accurately verifies product match via token overlap', () => {
    const candidateText = 'Sony WH-1000XM5 Noise Cancelling Headphones (Silver)';
    const result = ReturnInitiator.verifyProductMatch(candidateText, samplePurchase);
    expect(result.matches).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('safely rejects completely mismatched products', () => {
    const candidateText = 'Apple MacBook Air 15-inch M3 Chip 512GB';
    const result = ReturnInitiator.verifyProductMatch(candidateText, samplePurchase);
    expect(result.matches).toBe(false);
    expect(result.confidence).toBeLessThan(0.4);
  });

  it('requires mandatory user approval before consequential return submission', () => {
    const workflow = ReturnInitiator.buildReturnWorkflow(samplePurchase);
    expect(workflow.steps.length).toBeGreaterThan(0);

    // The final step MUST be a checkpoint approval requiring explicit user authorization
    const lastStep = workflow.steps[workflow.steps.length - 1];
    expect(lastStep.action).toBe('checkpoint_approval');
    expect(lastStep.requiresApproval).toBe(true);
    expect(lastStep.description.toLowerCase()).toContain('authorization required');
  });

  it('requires mandatory user approval before financial payment submission', () => {
    const workflow = BillPreparer.buildBillPaymentWorkflow(sampleBill);
    expect(workflow.steps.length).toBeGreaterThan(0);

    // Ensure payment submission is protected by checkpoint approval
    const approvalStep = workflow.steps.find((s) => s.action === 'checkpoint_approval');
    expect(approvalStep).toBeDefined();
    expect(approvalStep?.requiresApproval).toBe(true);
    expect(approvalStep?.description.toLowerCase()).toContain('authorization required');
  });

  it('detects high-risk payment actions via ReactiveGuard', () => {
    expect(ReactiveGuard.isHighRiskAction('Click Pay Now button')).toBe(true);
    expect(ReactiveGuard.isHighRiskAction('Authorize Payment for order')).toBe(true);
    expect(ReactiveGuard.isHighRiskAction('Place Order')).toBe(true);
    expect(ReactiveGuard.isHighRiskAction('Navigate to products catalog')).toBe(false);
  });
});
