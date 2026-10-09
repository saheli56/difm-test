import { SemanticNode } from '../types';

export interface NeighborContext {
  leftText?: string;
  aboveText?: string;
  labelText?: string;
}

export class DeepSemanticCrawler {
  private static HIGHLIGHT_ID = 'difm-agent-highlight-overlay';
  private static INSPECTOR_HOVER_ID = 'difm-inspector-hover-overlay';

  /**
   * Recursively traverses light DOM and all nested open Shadow DOM roots
   */
  public static extractDeepInteractiveNodes(root: Document | ShadowRoot | Element = document): SemanticNode[] {
    const nodes: SemanticNode[] = [];
    let counter = 1;

    const traverse = (container: Document | ShadowRoot | Element) => {
      const elements = container.querySelectorAll('*');
      
      elements.forEach((el) => {
        const element = el as HTMLElement;

        // Traverse shadow root if present
        if (element.shadowRoot) {
          traverse(element.shadowRoot);
        }

        if (!this.isActionable(element)) return;
        if (!this.isVisible(element)) return;

        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role') || this.inferRole(element);
        const text = this.cleanText(element.innerText || element.textContent || '');
        const ariaLabel = element.getAttribute('aria-label') || '';
        const placeholder = (element as HTMLInputElement).placeholder || '';
        const associatedLabel = this.findAssociatedLabelText(element);
        const name = ariaLabel || associatedLabel || placeholder || (element as HTMLInputElement).name || text.slice(0, 60);

        const isInput = ['input', 'textarea', 'select'].includes(tag) || role === 'textbox' || role === 'combobox';
        const isClickable = !isInput || ['button', 'submit', 'reset', 'checkbox', 'radio'].includes((element as HTMLInputElement).type);

        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          if (['id', 'name', 'class', 'placeholder', 'type', 'data-testid', 'data-action', 'aria-label', 'href', 'value'].includes(attr.name)) {
            attributes[attr.name] = attr.value;
          }
        }

        nodes.push({
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
        });
      });
    };

    traverse(root);
    return nodes;
  }

  /**
   * Self-Healing element search using multi-tier geometric and semantic neighbor scoring
   */
  public static findSelfHealingElement(
    selector?: string,
    xpath?: string,
    semanticName?: string,
    targetRole?: string
  ): HTMLElement | null {
    // Tier 0: Specialized Search Field Heuristics
    if (semanticName && (semanticName.toLowerCase().includes('search') || targetRole === 'textbox')) {
      const searchInputs = [
        '#twotabsearchtextbox',
        'input[name="field-keywords"]',
        'input#nav-search-keywords',
        '#searchInput',
        'input[name="q"]',
        'input[type="search"]',
        'input[name="search"]',
        'input[name="search_query"]',
        'input[aria-label*="search" i]',
        'input[placeholder*="search" i]',
        'input[placeholder*="Search" i]',
        'form[role="search"] input',
        '.cdx-text-input__input',
        'input[title*="Search" i]'
      ];
      if (targetRole === 'textbox' || !targetRole) {
        for (const s of searchInputs) {
          const el = document.querySelector(s) as HTMLElement;
          if (el && this.isVisible(el)) return el;
        }
      }

      if (targetRole === 'button' || semanticName.toLowerCase().includes('search button') || semanticName.toLowerCase().includes('submit')) {
        const searchButtons = [
          '#nav-search-submit-button',
          'input#nav-search-submit-button',
          'input.nav-input[type="submit"]',
          'button[type="submit"]',
          'input[type="submit"]',
          'button.searchButton',
          'button.pure-button',
          'button[aria-label*="search" i]',
          'button[aria-label*="Search" i]',
          '.cdx-search-input__end-button',
          '#search-icon-legacy'
        ];
        for (const s of searchButtons) {
          const el = document.querySelector(s) as HTMLElement;
          if (el && this.isVisible(el)) return el;
        }
      }
    }

    // Tier 1: Direct Selector Match
    if (selector) {
      try {
        const el = document.querySelector(selector) as HTMLElement;
        if (el && this.isVisible(el)) return el;
      } catch {
        // Fallback
      }
    }

    // Tier 2: Direct XPath Match
    if (xpath) {
      try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const el = result.singleNodeValue as HTMLElement;
        if (el && this.isVisible(el)) return el;
      } catch {
        // Fallback
      }
    }

    // Tier 3: Semantic & Contextual Neighbor Scoring
    if (semanticName) {
      const targetClean = semanticName.toLowerCase().trim();
      const allNodes = this.extractDeepInteractiveNodes();
      
      let bestMatch: HTMLElement | null = null;
      let highestScore = -1;

      for (const node of allNodes) {
        let score = 0;
        const nodeName = node.name.toLowerCase();
        const nodeText = node.text.toLowerCase();
        const placeholder = (node.placeholder || '').toLowerCase();

        // Exact name match
        if (nodeName === targetClean) score += 100;
        else if (nodeName.includes(targetClean)) score += 50;

        // Text content match
        if (nodeText === targetClean) score += 80;
        else if (nodeText.includes(targetClean)) score += 40;

        // Placeholder match
        if (placeholder === targetClean) score += 90;
        else if (placeholder.includes(targetClean)) score += 45;

        // Role compatibility
        if (targetRole && node.role === targetRole) score += 20;

        // Test ID match bonus
        if (node.attributes['data-testid']?.toLowerCase().includes(targetClean)) score += 70;

        if (score > highestScore && score >= 40) {
          highestScore = score;
          try {
            const found = document.querySelector(node.selector) as HTMLElement;
            if (found && this.isVisible(found)) {
              bestMatch = found;
            }
          } catch {
            // Keep looking
          }
        }
      }

      if (bestMatch) return bestMatch;
    }

    return null;
  }

  public static highlightElement(element: HTMLElement, label?: string) {
    this.clearHighlight();

    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.id = this.HIGHLIGHT_ID;
    overlay.style.position = 'fixed';
    overlay.style.top = `${rect.top - 2}px`;
    overlay.style.left = `${rect.left - 2}px`;
    overlay.style.width = `${rect.width + 4}px`;
    overlay.style.height = `${rect.height + 4}px`;
    overlay.style.border = '2px solid #3b82f6';
    overlay.style.borderRadius = '6px';
    overlay.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    overlay.style.zIndex = '2147483640';
    overlay.style.pointerEvents = 'none';
    overlay.style.boxShadow = '0 0 18px rgba(59, 130, 246, 0.5)';
    overlay.style.transition = 'all 0.15s ease-out';

    if (label) {
      const badge = document.createElement('div');
      badge.innerText = label;
      badge.style.position = 'absolute';
      badge.style.top = '-20px';
      badge.style.left = '0';
      badge.style.backgroundColor = '#2563eb';
      badge.style.color = '#ffffff';
      badge.style.fontFamily = 'inherit';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '700';
      badge.style.padding = '2px 5px';
      badge.style.borderRadius = '4px';
      overlay.appendChild(badge);
    }

    document.body.appendChild(overlay);
  }

  public static clearHighlight() {
    const existing = document.getElementById(this.HIGHLIGHT_ID);
    if (existing) existing.remove();
  }

  private static isActionable(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    const type = (el as HTMLInputElement).type;

    if (['a', 'button', 'select', 'textarea', 'details', 'summary'].includes(tag)) return true;
    if (tag === 'input' && type !== 'hidden') return true;
    if (['button', 'link', 'checkbox', 'radio', 'tab', 'textbox', 'combobox', 'menuitem', 'switch'].includes(role || '')) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('data-action') || el.hasAttribute('data-testid')) return true;

    const style = window.getComputedStyle(el);
    if (style.cursor === 'pointer' && el.innerText.trim().length > 0 && el.children.length === 0) return true;

    return false;
  }

  private static isVisible(el: HTMLElement): boolean {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none') {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private static findAssociatedLabelText(el: HTMLElement): string {
    // 1. Associated <label for="id">
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return this.cleanText(label.textContent || '');
    }
    // 2. Parent <label>
    const parentLabel = el.closest('label');
    if (parentLabel) return this.cleanText(parentLabel.textContent || '');

    // 3. Adjacent predecessor label / text node
    const prev = el.previousElementSibling;
    if (prev && ['label', 'span', 'p', 'div'].includes(prev.tagName.toLowerCase())) {
      const text = this.cleanText(prev.textContent || '');
      if (text.length > 0 && text.length < 50) return text;
    }

    return '';
  }

  private static inferRole(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return 'link';
      case 'button': return 'button';
      case 'input': {
        const type = (el as HTMLInputElement).type;
        if (['button', 'submit', 'reset'].includes(type)) return 'button';
        if (['checkbox', 'radio'].includes(type)) return type;
        return 'textbox';
      }
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      default: return 'generic';
    }
  }

  private static cleanText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private static generateCssSelector(el: HTMLElement): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const name = el.getAttribute('name');
    if (name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;

    const path: string[] = [];
    let current: HTMLElement | null = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter((c) => c && !c.includes(':') && !c.startsWith('difm-'));
        if (classes.length > 0) selector += `.${CSS.escape(classes[0])}`;
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
    if (el.id) return `//*[@id="${el.id}"]`;
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
