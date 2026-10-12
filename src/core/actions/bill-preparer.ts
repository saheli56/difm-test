import { SavedBillRecord } from '../records/types';
import { Workflow, WorkflowStep } from '../types';

export class BillPreparer {
  /**
   * Constructs a safe, non-consequential payment preparation workflow.
   * Navigates to provider, pre-fills identifier, and halts with human-in-the-loop approval before payment submission.
   */
  public static buildBillPaymentWorkflow(bill: SavedBillRecord): Workflow {
    const targetUrl = bill.sourceUrl || `https://${bill.providerDomain}`;

    const steps: WorkflowStep[] = [
      {
        id: `bill-step-1`,
        action: 'navigate',
        description: `Navigate to ${bill.provider} portal (${targetUrl})`,
        value: targetUrl,
        status: 'pending'
      },
      {
        id: `bill-step-2`,
        action: 'wait_for',
        description: 'Wait for portal form to load',
        value: '1500',
        status: 'pending'
      }
    ];

    if (bill.accountReference) {
      steps.push({
        id: `bill-step-3`,
        action: 'type',
        description: `Enter Account/Consumer identifier (${bill.accountReference})`,
        targetSemanticName: 'Consumer No',
        value: bill.accountReference,
        status: 'pending'
      });
      steps.push({
        id: `bill-step-4`,
        action: 'click',
        description: 'Query billing statement',
        targetSemanticName: 'Submit',
        status: 'pending'
      });
    }

    // Crucial safety checkpoint: halt for explicit user payment authorization
    steps.push({
      id: `bill-step-hitl`,
      action: 'checkpoint_approval',
      description: `Review bill amount (${bill.currency}${bill.amount}) on ${bill.provider}. Explicit user authorization required to complete payment.`,
      requiresApproval: true,
      status: 'pending'
    });

    return {
      id: `wf-bill-${bill.id}-${Date.now()}`,
      title: `Prepare Payment: ${bill.provider}`,
      rawPrompt: `Pay ${bill.provider} bill for account ${bill.accountReference || ''}`,
      targetUrl,
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
          message: `Created payment preparation workflow for ${bill.provider}. Payment secrets are never stored and final payment requires user confirmation.`
        }
      ]
    };
  }
}
