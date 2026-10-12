import { SavedPurchaseRecord } from '../records/types';
import { Workflow, WorkflowStep } from '../types';

export class ReturnInitiator {
  /**
   * Constructs a safe, multi-step return workflow for a tracked purchase.
   * Includes preconditions, verification checkpoints, product matching, and mandatory HITL approval.
   */
  public static buildReturnWorkflow(purchase: SavedPurchaseRecord): Workflow {
    const returnUrl = purchase.sourceUrl || `https://${purchase.storeDomain}/gp/your-account/order-history`;

    const steps: WorkflowStep[] = [
      {
        id: `ret-step-1`,
        action: 'navigate',
        description: `Navigate to ${purchase.store} orders page (${returnUrl})`,
        value: returnUrl,
        status: 'pending'
      },
      {
        id: `ret-step-2`,
        action: 'wait_for',
        description: 'Wait for orders list to load',
        value: '2000',
        status: 'pending'
      },
      {
        id: `ret-step-3`,
        action: 'verify_condition',
        description: `Verify order or product "${purchase.productName.slice(0, 30)}" is present on page`,
        condition: {
          type: 'text_contains',
          expected: purchase.orderReference || purchase.productName.slice(0, 25)
        },
        status: 'pending'
      },
      {
        id: `ret-step-4`,
        action: 'click',
        description: `Locate and click "Return or replace items" for ${purchase.productName.slice(0, 30)}`,
        targetSemanticName: 'Return or replace items',
        targetSemanticRole: 'button',
        status: 'pending'
      },
      {
        id: `ret-step-5`,
        action: 'checkpoint_approval',
        description: `Review return reason & refund destination for ${purchase.productName}. User authorization required before final submission.`,
        requiresApproval: true,
        status: 'pending'
      }
    ];

    return {
      id: `wf-return-${purchase.id}-${Date.now()}`,
      title: `Initiate Return: ${purchase.productName.slice(0, 35)}`,
      rawPrompt: `Initiate return for ${purchase.productName} on ${purchase.store}`,
      targetUrl: returnUrl,
      steps,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      activeStepIndex: 0,
      executionLogs: [
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          level: 'info',
          message: `Created return workflow for ${purchase.productName} (${purchase.store}). Consequential submit requires user approval.`
        }
      ]
    };
  }

  /**
   * Verifies whether an element or text on the page matches the saved purchase product name or order reference.
   * Returns a match confidence score between 0.0 and 1.0.
   */
  public static verifyProductMatch(
    candidateText: string,
    purchase: SavedPurchaseRecord
  ): { matches: boolean; confidence: number; reason: string } {
    const cleanCand = candidateText.toLowerCase().trim();

    // 1. Exact or partial Order Reference match
    if (purchase.orderReference && cleanCand.includes(purchase.orderReference.toLowerCase())) {
      return {
        matches: true,
        confidence: 0.99,
        reason: `Matched order reference: ${purchase.orderReference}`
      };
    }

    // 2. Token overlap similarity for product title
    const targetWords = purchase.productName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (targetWords.length === 0) {
      return { matches: false, confidence: 0, reason: 'Saved product name has no descriptive tokens' };
    }

    let matchedWordCount = 0;
    for (const word of targetWords) {
      if (cleanCand.includes(word)) {
        matchedWordCount++;
      }
    }

    const confidence = matchedWordCount / targetWords.length;
    // Require at least 40% token overlap for match
    const matches = confidence >= 0.4;

    return {
      matches,
      confidence,
      reason: matches
        ? `Found ${matchedWordCount} of ${targetWords.length} keyword tokens in candidate text (${Math.round(confidence * 100)}% match)`
        : `Insufficient match (${Math.round(confidence * 100)}% overlap with product name)`
    };
  }
}
