import { Workflow, WorkflowStep, VaultItem } from '../types';
import { ReactiveGuard } from './reactive-guard';
import { DomainResolver } from './domain-resolver';

export class TaskPlanner {
  public static async planWorkflow(
    prompt: string,
    currentUrl: string,
    vault: VaultItem[] = []
  ): Promise<Workflow> {
    const interpolatedPrompt = this.interpolateVaultVariables(prompt, vault);
    const domainResolution = DomainResolver.resolveTargetUrl(interpolatedPrompt, currentUrl);

    const steps = await this.decomposePromptToSteps(
      interpolatedPrompt,
      domainResolution.targetUrl,
      domainResolution.needsNavigation
    );

    const workflow: Workflow = {
      id: `wf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: this.generateWorkflowTitle(prompt),
      rawPrompt: prompt,
      targetUrl: domainResolution.targetUrl,
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
          message: domainResolution.needsNavigation
            ? `Target portal identified: ${domainResolution.targetUrl}. Adding navigation step.`
            : `Operating in-place on current active tab: ${currentUrl}`
        }
      ]
    };

    return workflow;
  }

  private static interpolateVaultVariables(prompt: string, vault: VaultItem[]): string {
    let result = prompt;
    for (const item of vault) {
      const token = `{{${item.key}}}`;
      if (result.includes(token)) {
        result = result.replaceAll(token, item.value);
      }
    }
    return result;
  }

  private static generateWorkflowTitle(prompt: string): string {
    const trimmed = prompt.trim();
    if (trimmed.length <= 40) return trimmed;
    return `${trimmed.substring(0, 37)}...`;
  }

  private static async decomposePromptToSteps(prompt: string, targetUrl: string, needsNavigation: boolean): Promise<WorkflowStep[]> {
    const lower = prompt.toLowerCase();
    const steps: WorkflowStep[] = [];

    if (needsNavigation) {
      steps.push({
        id: 'step-nav-0',
        action: 'navigate',
        description: `Navigate to target portal (${targetUrl})`,
        value: targetUrl,
        status: 'pending'
      });
    }

    // Case 0: Search / Lookup (e.g. "search about superman", "search for iphone", "find articles on quantum")
    if (
      lower.startsWith('search') ||
      lower.startsWith('find') ||
      lower.startsWith('lookup') ||
      lower.startsWith('look up') ||
      lower.includes('search for') ||
      lower.includes('search about')
    ) {
      const searchTerms = prompt
        .replace(/^(?:please\s+)?(?:search\s+(?:for|about|on)?|find\s+(?:articles?\s+about|for|about|on)?|look\s*up\s*(?:for|about|on)?|query\s+)/i, '')
        .trim();
      const query = searchTerms || prompt;

      steps.push({
        id: 'step-search-1',
        action: 'wait_for',
        description: 'Locate search box on page',
        targetSemanticName: 'search',
        targetSemanticRole: 'textbox',
        status: 'pending'
      });

      steps.push({
        id: 'step-search-2',
        action: 'type',
        description: `Type "${query}" into search box`,
        targetSemanticName: 'search',
        targetSemanticRole: 'textbox',
        value: query,
        status: 'pending'
      });

      steps.push({
        id: 'step-search-3',
        action: 'click',
        description: 'Submit search query',
        targetSemanticName: 'search',
        targetSemanticRole: 'button',
        status: 'pending'
      });

      steps.push({
        id: 'step-search-4',
        action: 'wait_for',
        description: `Wait for search results for "${query}"`,
        status: 'pending'
      });

      return steps;
    }

    // Case 1: Utility / Bill Payment (e.g. CESC, Electric, Mobile Recharge, Water)
    if (lower.includes('bill') || lower.includes('cesc') || lower.includes('recharge') || lower.includes('electricity')) {
      const consumerIdMatch = prompt.match(/(?:consumer\s*(?:id|no|number)?|id|no)[\s:]*([A-Za-z0-9]+)/i);
      const consumerId = consumerIdMatch ? consumerIdMatch[1] : '';

      steps.push({
        id: 'step-1',
        action: 'wait_for',
        description: 'Verify page loaded & check for consumer input field',
        targetSemanticRole: 'textbox',
        status: 'pending'
      });

      if (consumerId) {
        steps.push({
          id: 'step-2',
          action: 'type',
          description: `Enter Consumer ID (${consumerId})`,
          targetSemanticName: 'consumer',
          targetSemanticRole: 'textbox',
          value: consumerId,
          status: 'pending'
        });
      }

      steps.push({
        id: 'step-3',
        action: 'click',
        description: 'Submit Consumer ID to fetch bill amount',
        targetSemanticName: 'submit',
        targetSemanticRole: 'button',
        status: 'pending'
      });

      steps.push({
        id: 'step-4',
        action: 'wait_for',
        description: 'Wait for bill statement & payment breakdown',
        status: 'pending'
      });

      steps.push({
        id: 'step-5',
        action: 'checkpoint_approval',
        description: 'Review bill details and authorize payment processing',
        requiresApproval: true,
        status: 'pending'
      });

      return steps;
    }

    // Case 2: Price drop conditional add to cart / purchase
    if (lower.includes('add') && (lower.includes('cart') || lower.includes('buy'))) {
      const priceMatch = prompt.match(/(?:below|under|less than|<)\s*[$₹€£]?\s*([0-9,]+)/i);
      const targetPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

      steps.push({
        id: 'step-1',
        action: 'wait_for',
        description: 'Scan product details and live pricing element',
        status: 'pending'
      });

      if (targetPrice !== null) {
        steps.push({
          id: 'step-2',
          action: 'verify_condition',
          description: `Check if current price is under ${targetPrice}`,
          condition: {
            type: 'price_below',
            expected: targetPrice
          },
          status: 'pending'
        });
      }

      steps.push({
        id: 'step-3',
        action: 'click',
        description: 'Click "Add to Cart" or "Buy Now"',
        targetSemanticName: 'add to cart',
        targetSemanticRole: 'button',
        status: 'pending'
      });

      steps.push({
        id: 'step-4',
        action: 'checkpoint_approval',
        description: 'Proceed to checkout verification (User approval before payment)',
        requiresApproval: true,
        status: 'pending'
      });

      return steps;
    }

    // Case 3: Return / Order Tracking
    if (lower.includes('return') || lower.includes('refund') || lower.includes('track')) {
      const orderMatch = prompt.match(/(?:order\s*(?:id|no|#)?|#)[\s:]*([A-Za-z0-9-]+)/i);
      const orderId = orderMatch ? orderMatch[1] : '';

      steps.push({
        id: 'step-1',
        action: 'wait_for',
        description: 'Locate orders list and history container',
        status: 'pending'
      });

      if (orderId) {
        steps.push({
          id: 'step-2',
          action: 'click',
          description: `Select order item matching #${orderId}`,
          targetSemanticName: orderId,
          status: 'pending'
        });
      }

      steps.push({
        id: 'step-3',
        action: 'click',
        description: 'Click Return / Replace item button',
        targetSemanticName: 'return',
        targetSemanticRole: 'button',
        status: 'pending'
      });

      steps.push({
        id: 'step-4',
        action: 'checkpoint_approval',
        description: 'Confirm return reason and pickup address verification',
        requiresApproval: true,
        status: 'pending'
      });

      return steps;
    }

    // Default: Generic Intelligent Step Synthesizer
    steps.push({
      id: 'step-1',
      action: 'wait_for',
      description: 'Analyze page accessibility tree and active interactive targets',
      status: 'pending'
    });

    const isHighRisk = ReactiveGuard.isHighRiskAction(prompt);

    steps.push({
      id: 'step-2',
      action: 'click',
      description: `Execute primary target interaction: "${prompt.slice(0, 45)}"`,
      targetSemanticName: prompt.slice(0, 30),
      requiresApproval: isHighRisk,
      status: 'pending'
    });

    if (isHighRisk) {
      steps.push({
        id: 'step-3',
        action: 'checkpoint_approval',
        description: 'Confirm final submission',
        requiresApproval: true,
        status: 'pending'
      });
    }

    return steps;
  }
}
