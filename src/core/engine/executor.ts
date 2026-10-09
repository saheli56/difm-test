import { WorkflowStep, StepCondition } from '../types';
import { SemanticCrawler } from '../ax-tree/crawler';
import { ReactiveGuard } from './reactive-guard';

export class ActionExecutor {
  public static async executeStep(step: WorkflowStep): Promise<{
    success: boolean;
    error?: string;
    extracted?: string;
    requiresHitl?: boolean;
    hitlReason?: string;
  }> {
    try {
      // 1. Pre-execution barrier inspection
      const nodes = SemanticCrawler.extractInteractiveNodes();
      const barrier = ReactiveGuard.inspectPageBarriers(nodes);
      if (barrier) {
        return {
          success: false,
          requiresHitl: true,
          hitlReason: barrier.message
        };
      }

      switch (step.action) {
        case 'click':
          return await this.performClick(step);

        case 'type':
          return await this.performType(step);

        case 'wait_for':
          return await this.performWaitFor(step);

        case 'verify_condition':
          return await this.performVerifyCondition(step);

        case 'checkpoint_approval':
          return {
            success: true,
            requiresHitl: true,
            hitlReason: step.description || 'User approval requested'
          };

        case 'scroll':
          window.scrollBy({ top: 400, behavior: 'smooth' });
          await this.sleep(400);
          return { success: true };

        default:
          return { success: true };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private static async performClick(step: WorkflowStep): Promise<{ success: boolean; error?: string }> {
    const el = SemanticCrawler.findTargetElement(
      step.targetNodeSelector,
      step.targetNodeXPath,
      step.targetSemanticName
    );

    if (!el) {
      return {
        success: false,
        error: `Could not locate clickable element "${step.targetSemanticName || step.targetNodeSelector}" on page.`
      };
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    SemanticCrawler.highlightElement(el, 'CLICKING');
    await this.sleep(300);

    // Humanized mouse dispatch
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY
    };

    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.focus();
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();

    await this.sleep(600);
    SemanticCrawler.clearHighlight();

    return { success: true };
  }

  private static async performType(step: WorkflowStep): Promise<{ success: boolean; error?: string }> {
    const el = SemanticCrawler.findTargetElement(
      step.targetNodeSelector,
      step.targetNodeXPath,
      step.targetSemanticName
    ) as HTMLInputElement | HTMLTextAreaElement | null;

    if (!el) {
      return {
        success: false,
        error: `Could not locate input field "${step.targetSemanticName || step.targetNodeSelector}".`
      };
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    SemanticCrawler.highlightElement(el, 'TYPING');
    el.focus();

    const valueToType = step.value || '';

    // React synthetic input setter hook bypass
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (el instanceof HTMLInputElement && nativeInputValueSetter) {
      nativeInputValueSetter.call(el, valueToType);
    } else if (el instanceof HTMLTextAreaElement && nativeTextAreaValueSetter) {
      nativeTextAreaValueSetter.call(el, valueToType);
    } else {
      el.value = valueToType;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    await this.sleep(400);
    SemanticCrawler.clearHighlight();

    return { success: true };
  }

  private static async performWaitFor(step: WorkflowStep): Promise<{ success: boolean; error?: string }> {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      if (document.readyState === 'complete') {
        if (!step.targetSemanticName && !step.targetNodeSelector) {
          await this.sleep(500);
          return { success: true };
        }

        const el = SemanticCrawler.findTargetElement(
          step.targetNodeSelector,
          step.targetNodeXPath,
          step.targetSemanticName
        );
        if (el) {
          return { success: true };
        }
      }
      await this.sleep(400);
    }

    return { success: true }; // Proceed even if soft wait times out
  }

  private static async performVerifyCondition(step: WorkflowStep): Promise<{
    success: boolean;
    error?: string;
    extracted?: string;
  }> {
    if (!step.condition) return { success: true };

    const bodyText = document.body.innerText;

    if (step.condition.type === 'price_below' || step.condition.type === 'price_above') {
      const priceRegex = /(?:[$₹€£]\s*|rs\.?\s*)([0-9,]+(?:\.[0-9]{2})?)/gi;
      const matches = Array.from(bodyText.matchAll(priceRegex));

      if (matches.length > 0) {
        const rawAmount = matches[0][1].replace(/,/g, '');
        const currentPrice = parseFloat(rawAmount);
        const expectedPrice = typeof step.condition.expected === 'number'
          ? step.condition.expected
          : parseFloat(String(step.condition.expected));

        if (step.condition.type === 'price_below') {
          if (currentPrice <= expectedPrice) {
            return {
              success: true,
              extracted: `Matched: Current price ${currentPrice} is <= target ${expectedPrice}`
            };
          } else {
            return {
              success: false,
              error: `Condition unmet: Current price is ${currentPrice}, which exceeds target ${expectedPrice}`
            };
          }
        }
      }
    }

    return { success: true };
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
