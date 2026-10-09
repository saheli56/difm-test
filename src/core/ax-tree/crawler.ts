import { SemanticNode } from '../types';

export class SemanticCrawler {
  private static HIGHLIGHT_ID = 'difm-agent-highlight-overlay';

  public static extractInteractiveNodes(): SemanticNode[] {
    const nodes: SemanticNode[] = [];
    let counter = 1;

    const interactiveQuery = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="tab"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="menuitem"]',
      '[onclick]',
      '[tabindex]:not([tabindex="-1"])',
      '[data-action]',
      '[data-testid]',
      '[aria-label]'
    ].join(', ');

    const elements = document.querySelectorAll(interactiveQuery);

    elements.forEach((el) => {
      const element = el as HTMLElement;
      if (!this.isVisible(element)) return;

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role') || this.inferRole(element);
      const text = this.cleanText(element.innerText || element.textContent || '');
      const ariaLabel = element.getAttribute('aria-label') || '';
      const placeholder = (element as HTMLInputElement).placeholder || '';
      const name = ariaLabel || placeholder || (element as HTMLInputElement).name || text.slice(0, 50);

      const isInput = ['input', 'textarea', 'select'].includes(tag) || role === 'textbox' || role === 'combobox';
      const isClickable = !isInput || (element as HTMLInputElement).type === 'submit' || (element as HTMLInputElement).type === 'button';

      const attributes: Record<string, string> = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (['id', 'name', 'class', 'placeholder', 'type', 'data-testid', 'aria-label', 'href', 'value'].includes(attr.name)) {
          attributes[attr.name] = attr.value;
        }
      }

      const node: SemanticNode = {
        id: `@node-${counter++}`,
        tag,
        role,
        name: name.trim(),
        text: text.slice(0, 100),
        placeholder,
        selector: this.generateCssSelector(element),
        xpath: this.generateXPath(element),
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        isClickable,
        isInput,
        value: (element as HTMLInputElement).value || undefined,
        attributes
      };

      nodes.push(node);
    });

    return nodes;
  }

  public static findTargetElement(selector?: string, xpath?: string, semanticName?: string): HTMLElement | null {
    if (selector) {
      try {
        const el = document.querySelector(selector) as HTMLElement;
        if (el && this.isVisible(el)) return el;
      } catch {
        // Fall through to XPath or semantic match
      }
    }

    if (xpath) {
      try {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const el = result.singleNodeValue as HTMLElement;
        if (el && this.isVisible(el)) return el;
      } catch {
        // Fall through to semantic fuzzy search
      }
    }

    if (semanticName) {
      const cleanTarget = semanticName.toLowerCase().trim();
      const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
      for (const el of all) {
        if (!this.isVisible(el)) continue;
        const text = (el.innerText || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || '').toLowerCase().trim();
        if (text === cleanTarget || (cleanTarget.length > 3 && text.includes(cleanTarget))) {
          return el;
        }
      }
    }

    return null;
  }

  public static highlightElement(element: HTMLElement, label?: string) {
    this.clearHighlight();

    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.id = this.HIGHLIGHT_ID;
    overlay.style.position = 'fixed';
    overlay.style.top = `${rect.top - 3}px`;
    overlay.style.left = `${rect.left - 3}px`;
    overlay.style.width = `${rect.width + 6}px`;
    overlay.style.height = `${rect.height + 6}px`;
    overlay.style.border = '2px solid #3b82f6';
    overlay.style.borderRadius = '6px';
    overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.12)';
    overlay.style.zIndex = '2147483640';
    overlay.style.pointerEvents = 'none';
    overlay.style.boxShadow = '0 0 16px rgba(59, 130, 246, 0.4)';
    overlay.style.transition = 'all 0.2s ease-in-out';

    if (label) {
      const badge = document.createElement('div');
      badge.innerText = label;
      badge.style.position = 'absolute';
      badge.style.top = '-22px';
      badge.style.left = '0';
      badge.style.backgroundColor = '#2563eb';
      badge.style.color = '#ffffff';
      badge.style.fontFamily = 'monospace';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = '600';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      overlay.appendChild(badge);
    }

    document.body.appendChild(overlay);
  }

  public static clearHighlight() {
    const existing = document.getElementById(this.HIGHLIGHT_ID);
    if (existing) {
      existing.remove();
    }
  }

  private static isVisible(el: HTMLElement): boolean {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      style.pointerEvents === 'none'
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private static inferRole(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a':
        return 'link';
      case 'button':
        return 'button';
      case 'input': {
        const type = (el as HTMLInputElement).type;
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (['checkbox', 'radio'].includes(type)) return type;
        return 'textbox';
      }
      case 'select':
        return 'combobox';
      case 'textarea':
        return 'textbox';
      default:
        return 'generic';
    }
  }

  private static cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private static generateCssSelector(el: HTMLElement): string {
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }
    const testId = el.getAttribute('data-testid');
    if (testId) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }
    const name = el.getAttribute('name');
    if (name) {
      return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    }
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${CSS.escape(ariaLabel)}"]`;
    }

    const path: string[] = [];
    let current: HTMLElement | null = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter((c) => c && !c.includes(':') && !c.startsWith('difm-'));
        if (classes.length > 0) {
          selector += `.${CSS.escape(classes[0])}`;
        }
      }
      const parent: HTMLElement | null = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.tagName === current?.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = parent;
      if (path.length >= 3) break;
    }

    return path.join(' > ');
  }

  private static generateXPath(el: HTMLElement): string {
    if (el.id) {
      return `//*[@id="${el.id}"]`;
    }
    const parts: string[] = [];
    let current: HTMLElement | null = el;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let count = 0;
      let sibling: Node | null = current.previousSibling;
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && (sibling as HTMLElement).tagName === current.tagName) {
          count++;
        }
        sibling = sibling.previousSibling;
      }
      const tagName = current.tagName.toLowerCase();
      const indexStr = count > 0 ? `[${count + 1}]` : '[1]';
      parts.unshift(`${tagName}${indexStr}`);
      current = current.parentElement;
    }
    return `/${parts.join('/')}`;
  }
}
