import { WorkflowStep } from '../types';
import { DeepSemanticCrawler } from '../ax-tree/deep-crawler';
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
      const nodes = DeepSemanticCrawler.extractDeepInteractiveNodes();
      const barrier = ReactiveGuard.inspectPageBarriers(nodes);
      if (barrier) {
        return {
          success: false,
          requiresHitl: true,
          hitlReason: barrier.message
        };
      }

      switch (step.action) {
        case 'navigate':
          if (step.value) {
            window.location.href = step.value;
            await this.sleep(1500);
            return { success: true };
          }
          return { success: true };

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
    const el = DeepSemanticCrawler.findSelfHealingElement(
      step.targetNodeSelector,
      step.targetNodeXPath,
      step.targetSemanticName,
      step.targetSemanticRole || 'button'
    );

    if (!el) {
      // If click target not found but action was search submit, check if active element can be submitted
      const activeEl = document.activeElement as HTMLInputElement;
      if (activeEl && activeEl.form) {
        activeEl.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        if (typeof activeEl.form.requestSubmit === 'function') {
          activeEl.form.requestSubmit();
        }
        return { success: true };
      }

      return {
        success: false,
        error: `Could not locate clickable element "${step.targetSemanticName || step.targetNodeSelector}" on page.`
      };
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    DeepSemanticCrawler.highlightElement(el, 'CLICK');
    await this.sleep(250);

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

    // If button is inside form, trigger form submit event
    if (el instanceof HTMLButtonElement && el.form) {
      if (typeof el.form.requestSubmit === 'function') {
        try {
          el.form.requestSubmit(el);
        } catch {
          // Ignore if already submitted
        }
      }
    }

    await this.sleep(500);
    DeepSemanticCrawler.clearHighlight();

    return { success: true };
  }

  private static async performType(step: WorkflowStep): Promise<{ success: boolean; error?: string }> {
    const el = DeepSemanticCrawler.findSelfHealingElement(
      step.targetNodeSelector,
      step.targetNodeXPath,
      step.targetSemanticName,
      step.targetSemanticRole || 'textbox'
    ) as HTMLInputElement | HTMLTextAreaElement | null;

    if (!el) {
      return {
        success: false,
        error: `Could not locate input field "${step.targetSemanticName || step.targetNodeSelector}".`
      };
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    DeepSemanticCrawler.highlightElement(el, 'INPUT');
    el.focus();

    const valueToType = step.value || '';

    // React synthetic input bypass
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

    // Dispatch keyboard events for real-time auto-suggest / enter key handlers
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

    await this.sleep(400);
    DeepSemanticCrawler.clearHighlight();

    return { success: true };
  }

  private static async performWaitFor(step: WorkflowStep): Promise<{ success: boolean; error?: string }> {
    const maxAttempts = 15;
    for (let i = 0; i < maxAttempts; i++) {
      if (document.readyState === 'complete') {
        if (!step.targetSemanticName && !step.targetNodeSelector) {
          await this.sleep(400);
          return { success: true };
        }

        const el = DeepSemanticCrawler.findSelfHealingElement(
          step.targetNodeSelector,
          step.targetNodeXPath,
          step.targetSemanticName,
          step.targetSemanticRole
        );
        if (el) {
          return { success: true };
        }
      }
      await this.sleep(300);
    }

    return { success: true };
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
