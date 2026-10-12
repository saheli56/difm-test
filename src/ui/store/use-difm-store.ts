import { create } from 'zustand';
import { Workflow, WorkflowStep, AutomationRule, VaultItem, DIFMState } from '../../core/types';
import { TaskPlanner } from '../../core/engine/planner';
import { ActionExecutor } from '../../core/engine/executor';
import { AutomationManager } from '../../core/scheduler/automation-manager';
import { ContextVault } from '../../core/vault/context-vault';

interface DIFMStore extends DIFMState {
  activeView: 'telemetry' | 'automations' | 'vault' | 'settings';
  activeTabInfo: { url: string; title: string; id?: number };
  isExecuting: boolean;
  setActiveView: (view: 'telemetry' | 'automations' | 'vault' | 'settings') => void;
  init: () => Promise<void>;
  startWorkflow: (prompt: string) => Promise<void>;
  abortWorkflow: () => void;
  resumeHitl: (decision: string, userInput?: string) => Promise<void>;
  retryStep: (stepIndex: number) => Promise<void>;
  saveAutomation: (rule: AutomationRule) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
  toggleAutomation: (id: string, enabled: boolean) => Promise<void>;
  saveVaultItem: (item: Omit<VaultItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<void>;
  deleteVaultItem: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<DIFMState['settings']>) => void;
}

export const useDIFMStore = create<DIFMStore>((set, get) => ({
  currentWorkflow: null,
  automations: [],
  vault: [],
  activeView: 'telemetry',
  isExecuting: false,
  activeTabInfo: {
    url: 'https://example.com',
    title: 'Active Web Tab'
  },
  settings: {
    localAiEnabled: true,
    byokProvider: 'chrome_builtin',
    autoApproveSafeSteps: true,
    highlightInteractions: true
  },

  setActiveView: (view) => set({ activeView: view }),

  init: async () => {
    const automations = await AutomationManager.getAutomations();
    const vault = await ContextVault.getItems();

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true }, (tabs) => {
        const webTab = tabs?.find((t) => t.url && t.url.startsWith('http')) || tabs?.[0];
        if (webTab) {
          set({
            activeTabInfo: {
              url: webTab.url || '',
              title: webTab.title || '',
              id: webTab.id
            }
          });
        }
      });
    }

    set({ automations, vault });
  },

  startWorkflow: async (prompt: string) => {
    const { activeTabInfo, vault } = get();
    set({ isExecuting: true, activeView: 'telemetry' });

    let currentUrl = activeTabInfo.url;
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url) currentUrl = tab.url;
      } catch {}
    }

    const workflow = await TaskPlanner.planWorkflow(prompt, currentUrl, vault);
    workflow.status = 'running';
    set({ currentWorkflow: { ...workflow } });

    await executeWorkflowGraph(workflow, set, get);
  },

  abortWorkflow: () => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const updated = {
      ...currentWorkflow,
      status: 'aborted' as const,
      executionLogs: [
        ...currentWorkflow.executionLogs,
        {
          id: `log-${Date.now()}`,
          timestamp: Date.now(),
          level: 'warn' as const,
          message: 'Workflow manually aborted by user'
        }
      ]
    };

    set({ currentWorkflow: updated, isExecuting: false });
  },

  resumeHitl: async (decision: string, userInput?: string) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const logs = [
      ...currentWorkflow.executionLogs,
      {
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        level: 'info' as const,
        message: `User resumed execution with decision: "${decision}" ${userInput ? `(${userInput})` : ''}`
      }
    ];

    const currentStepIndex = currentWorkflow.activeStepIndex;
    const steps = [...currentWorkflow.steps];

    if (steps[currentStepIndex]) {
      steps[currentStepIndex] = {
        ...steps[currentStepIndex],
        status: 'success'
      };
    }

    const nextIndex = currentStepIndex + 1;
    const updated: Workflow = {
      ...currentWorkflow,
      status: nextIndex < steps.length ? 'running' : 'completed',
      activeStepIndex: nextIndex,
      steps,
      hitlCheckpoint: undefined,
      executionLogs: logs
    };

    set({ currentWorkflow: updated, isExecuting: nextIndex < steps.length });

    if (nextIndex < steps.length) {
      await executeWorkflowGraph(updated, set, get);
    }
  },

  retryStep: async (stepIndex: number) => {
    const { currentWorkflow } = get();
    if (!currentWorkflow) return;

    const steps = [...currentWorkflow.steps];
    steps[stepIndex] = { ...steps[stepIndex], status: 'pending', errorMessage: undefined };

    const updated: Workflow = {
      ...currentWorkflow,
      status: 'running',
      activeStepIndex: stepIndex,
      steps,
      hitlCheckpoint: undefined
    };

    set({ currentWorkflow: updated, isExecuting: true });
    await executeWorkflowGraph(updated, set, get);
  },

  saveAutomation: async (rule: AutomationRule) => {
    const updated = await AutomationManager.saveAutomation(rule);
    set({ automations: updated });
  },

  deleteAutomation: async (id: string) => {
    const updated = await AutomationManager.deleteAutomation(id);
    set({ automations: updated });
  },

  toggleAutomation: async (id: string, enabled: boolean) => {
    const updated = await AutomationManager.toggleAutomation(id, enabled);
    set({ automations: updated });
  },

  saveVaultItem: async (item) => {
    const updated = await ContextVault.saveItem(item);
    set({ vault: updated });
  },

  deleteVaultItem: async (id: string) => {
    const updated = await ContextVault.deleteItem(id);
    set({ vault: updated });
  },

  updateSettings: (settings) => {
    set((state) => ({
      settings: { ...state.settings, ...settings }
    }));
  }
}));

async function getExecutionTab(forNavigation = false): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return null;

  // 1. Priority: Active tab in current window (standard for Side Panel & Popup)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      if (forNavigation) return tab;
      if (tab.url && tab.url.startsWith('http') && !tabUrlIsExtension(tab.url)) return tab;
    }
  } catch {}

  // 2. Fallback: Active tab in last focused window
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
      if (forNavigation) return tab;
      if (tab.url && tab.url.startsWith('http') && !tabUrlIsExtension(tab.url)) return tab;
    }
  } catch {}

  // 3. Fallback: Any active tab
  try {
    const tabs = await chrome.tabs.query({ active: true });
    for (const t of tabs) {
      if (forNavigation && t.id) return t;
      if (t.url && t.url.startsWith('http') && !tabUrlIsExtension(t.url)) return t;
    }
  } catch {}

  // 4. Fallback: Any open web tab
  try {
    const allTabs = await chrome.tabs.query({});
    const webTab = allTabs.find((t) => t.url && t.url.startsWith('http') && !tabUrlIsExtension(t.url));
    if (webTab) return webTab;
    if (forNavigation && allTabs.length > 0) return allTabs[0];
  } catch {}

  return null;
}

function tabUrlIsExtension(url?: string): boolean {
  if (!url) return true;
  return url.includes('extension://') || url.includes('moz-extension://');
}

async function executeStepInActiveTab(step: WorkflowStep): Promise<{
  success: boolean;
  error?: string;
  extracted?: string;
  requiresHitl?: boolean;
  hitlReason?: string;
}> {
  // Navigation step: works from any tab (including newtab / about:blank / chrome://newtab)
  if (step.action === 'navigate' && step.value) {
    let targetTab = await getExecutionTab(true);
    try {
      if (targetTab?.id) {
        await chrome.tabs.update(targetTab.id, { url: step.value, active: true });
      } else {
        targetTab = await chrome.tabs.create({ url: step.value, active: true });
      }

      // Wait for navigation and DOM mount
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 4000);
        if (!chrome.tabs.onUpdated || !targetTab?.id) return;
        const targetId = targetTab.id;
        const listener = (tabId: number, info: { status?: string }) => {
          if (tabId === targetId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener as any);
            clearTimeout(timeout);
            setTimeout(() => resolve(), 1200);
          }
        };
        chrome.tabs.onUpdated.addListener(listener as any);
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Navigation failed' };
    }
  }

  const activeTab = await getExecutionTab(false);
  if (!activeTab?.id) {
    return { success: false, error: 'No active web page found to execute action on.' };
  }

    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'DIFM_EXECUTE_ACTION_IN_TAB',
        payload: { step }
      });
      if (response && response.success) return response;
    } catch {
      // Fall through to scripting
    }

    if (step.action === 'wait_for') {
      await new Promise((r) => setTimeout(r, 2200));
      return { success: true };
    }

    if (chrome.scripting) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (s) => {
            // === UNIVERSAL INPUT / SEARCH FINDER ===
            if (s.action === 'type') {
              const allInputs = Array.from(document.querySelectorAll(
                'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea'
              )) as HTMLInputElement[];

              // 1. Semantic Match (searchbox role, search type, or keywords in name/placeholder/aria/title/class)
              let targetInput = allInputs.find((el) => {
                if (el.offsetParent === null) return false;
                const meta = `${el.placeholder || ''} ${el.getAttribute('aria-label') || ''} ${el.name || ''} ${el.title || ''} ${el.id || ''} ${el.className || ''}`.toLowerCase();
                return (
                  el.type === 'search' ||
                  el.getAttribute('role') === 'searchbox' ||
                  meta.includes('search') ||
                  meta.includes('find') ||
                  meta.includes('query') ||
                  el.name === 'q' ||
                  el.name === 'field-keywords'
                );
              });

              // 2. Fallback: First visible prominent text input
              if (!targetInput) {
                targetInput = allInputs.find((el) => el.offsetParent !== null && (el.type === 'text' || !el.type || el.tagName.toLowerCase() === 'textarea'));
              }

              if (targetInput) {
                targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetInput.focus();

                const val = s.value || '';
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                  nativeSetter.call(targetInput, val);
                } else {
                  targetInput.value = val;
                }

                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true };
              }
              return { success: false, error: 'Could not locate input field on page.' };
            }

            // === UNIVERSAL PRICE VERIFIER ===
            if (s.action === 'verify_condition') {
              const elements = Array.from(document.querySelectorAll('span, div, p, b, strong, h1, h2, h3, [class*="price" i], [class*="Price" i], [id*="price" i]'));
              let extractedPrice: number | null = null;

              for (const el of elements) {
                if (el.children.length > 3) continue; // Skip large parent containers
                const text = el.textContent?.trim() || '';
                const match = text.match(/(?:[₹$€£]|Rs\.?|INR|USD)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
                if (match) {
                  const parsed = parseFloat(match[1].replace(/,/g, ''));
                  if (!isNaN(parsed) && parsed > 10 && parsed < 10000000) {
                    extractedPrice = parsed;
                    break;
                  }
                }
              }

              if (s.condition?.expected && extractedPrice !== null) {
                const expectedNum = Number(s.condition.expected);
                if (extractedPrice <= expectedNum) {
                  return { success: true, extracted: `₹${extractedPrice.toLocaleString()}` };
                } else {
                  return {
                    success: false,
                    error: `Current price ₹${extractedPrice.toLocaleString()} exceeds limit of ₹${expectedNum.toLocaleString()}`
                  };
                }
              }
              return { success: true };
            }

            // === UNIVERSAL CLICK ROUTER ===
            if (s.action === 'click') {
              // 1. First / Top Product Link in Search Results (Universal for Amazon, Flipkart, eBay, Walmart, etc.)
              if (s.targetSemanticName === 'first_product' || s.description?.toLowerCase().includes('open top matching')) {
                const searchArea = document.querySelector('[data-component-type="s-search-results"], .s-result-list, [role="main"], main, ._1YokD2') || document.body;
                const allAnchors = Array.from(searchArea.querySelectorAll('a[href]')) as HTMLAnchorElement[];

                for (const a of allAnchors) {
                  if (a.offsetParent === null) continue;
                  if (a.closest('header, nav, #navbar, #nav-main, #nav-subnav, #leftNav, #s-refinements, [role="navigation"], ._1dqAae')) continue;

                  const href = a.href.toLowerCase();
                  if (
                    href.includes('cart') ||
                    href.includes('account') ||
                    href.includes('help') ||
                    href.includes('login') ||
                    href.includes('signin') ||
                    href.includes('/b/') ||
                    href.includes('/b?') ||
                    href.includes('browse') ||
                    href.includes('customer-preferences') ||
                    href.endsWith('#')
                  ) {
                    continue;
                  }

                  const isProductPattern =
                    href.includes('/dp/') ||
                    href.includes('/gp/product/') ||
                    href.includes('/sspa/click') ||
                    href.includes('/p/') ||
                    href.includes('/product/') ||
                    href.includes('/item/') ||
                    href.includes('/itm/');

                  const isInsideProductCard = !!a.closest(
                    '[data-component-type="s-search-result"], [data-asin]:not([data-asin=""]), [data-id], ._1AtVbE, ._13oc-S, ._2kHMtA, ._1xHGtK, .product-card, .search-result'
                  );

                  const hasHeading = !!a.querySelector('h1, h2, h3, h4, [class*="title" i]') || !!a.closest('h1, h2, h3, h4');

                  if ((isProductPattern && (isInsideProductCard || hasHeading)) || (isInsideProductCard && (hasHeading || a.querySelector('img')))) {
                    a.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.location.href = a.href;
                    return { success: true, navigated: true };
                  }
                }
              }

              // 2. Open Cart / View Basket Navigation
              if (s.description?.toLowerCase().includes('open cart') || s.targetSemanticName?.toLowerCase() === 'cart') {
                const allElements = Array.from(document.querySelectorAll('a, button, [role="button"], span, div')) as HTMLElement[];
                for (const el of allElements) {
                  if (el.offsetParent === null) continue;
                  const href = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
                  const txt = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase().trim();
                  
                  if (href.includes('/viewcart') || href.includes('/cart') || href.includes('/bag') || href.includes('/basket') || href.includes('/gp/cart') || href.includes('/checkout')) {
                    const link = el.closest('a') as HTMLAnchorElement || el;
                    if (link.href && (link.href.startsWith('http') || link.href.startsWith('/'))) {
                      window.location.href = link.href;
                      return { success: true, navigated: true };
                    }
                    link.click();
                    return { success: true };
                  }
                  
                  if (txt === 'cart' || txt === 'bag' || txt === 'basket' || txt === 'view cart' || txt === 'go to cart') {
                    const link = el.closest('a') as HTMLAnchorElement;
                    if (link && link.href && link.href.startsWith('http')) {
                      window.location.href = link.href;
                      return { success: true, navigated: true };
                    }
                    const clickable = el.closest('button, [role="button"]') as HTMLElement || el;
                    clickable.click();
                    return { success: true };
                  }
                }

                if (window.location.hostname.includes('flipkart')) {
                  window.location.href = 'https://www.flipkart.com/viewcart';
                  return { success: true, navigated: true };
                }
                if (window.location.hostname.includes('amazon')) {
                  window.location.href = 'https://www.amazon.in/gp/cart/view.html';
                  return { success: true, navigated: true };
                }
              }

              // 3. Add to Cart / Buy Now Action
              if (s.targetSemanticName?.toLowerCase().includes('cart') || s.description?.toLowerCase().includes('add to cart')) {
                const isElVisible = (el: HTMLElement) => {
                  if (!el) return false;
                  const rect = el.getBoundingClientRect();
                  if (rect.width <= 0 || rect.height <= 0) return false;
                  const style = window.getComputedStyle(el);
                  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                };

                const allElements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"], div, span')) as HTMLElement[];
                let cartBtn: HTMLElement | null = null;

                // Priority 0: Standard Buybox button IDs & platform classes (Amazon, Flipkart, Shopify)
                const primaryBuyboxSelectors = [
                  '#add-to-cart-button',
                  'input#add-to-cart-button',
                  'input[name="submit.add-to-cart"]',
                  'button[name="submit.add-to-cart"]',
                  'button._2KpZ6l._2U9uOA._3v1-ww', // Flipkart classic add to cart
                  'button._2KpZ6l._2U9uOA',
                  'button[aria-label*="add to cart" i]',
                  'button[aria-label*="add to bag" i]',
                  'button[aria-label*="add to basket" i]',
                  'button[title*="add to cart" i]',
                  'button[title*="add to bag" i]',
                  '[data-action="add-to-cart"]',
                  '.a-button-input[value="Add to Cart"]',
                  '[data-testid*="add-to-cart" i]',
                  '[data-testid*="addToCart" i]'
                ];

                for (const sel of primaryBuyboxSelectors) {
                  const el = document.querySelector(sel) as HTMLElement | null;
                  if (el && isElVisible(el)) {
                    cartBtn = el;
                    break;
                  }
                }

                // Priority A: Exact "Add to cart" / "Add to bag" / "Add to basket"
                if (!cartBtn) {
                  for (const el of allElements) {
                    if (!isElVisible(el)) continue;
                    if (el.children.length > 3) continue; // Skip large parent container banners
                    const txt = (el.innerText || el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').trim();
                    if (/^add\s*to\s*(?:cart|bag|basket)$/i.test(txt)) {
                      let cur: HTMLElement | null = el;
                      while (cur && cur !== document.body) {
                        if (cur.tagName === 'BUTTON' || cur.tagName === 'A' || cur.getAttribute('role') === 'button' || cur.className.includes('css-175oi2r') || cur.className.includes('_2KpZ6l')) {
                          cartBtn = cur;
                          break;
                        }
                        cur = cur.parentElement;
                      }
                      if (!cartBtn) cartBtn = el;
                      break;
                    }
                  }
                }

                // Priority B: Icon-Only Cart Button (Flipkart bottom sticky action bar, mobile-responsive layouts)
                if (!cartBtn) {
                  for (const el of allElements) {
                    if (!isElVisible(el)) continue;
                    const tag = el.tagName.toLowerCase();
                    const isClickable = tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' || (typeof el.className === 'string' && el.className.includes('button'));
                    if (!isClickable) continue;

                    const hasCartSvg = !!el.querySelector('svg[class*="cart" i], svg[class*="basket" i], svg[class*="bag" i], svg[id*="cart" i], svg path[d*="cart" i], svg._1KOMV2');
                    const hasCartAria = (el.getAttribute('aria-label') || '').toLowerCase().includes('cart') || (el.getAttribute('title') || '').toLowerCase().includes('cart');
                    const hasCartClass = typeof el.className === 'string' && el.className.toLowerCase().includes('cart');

                    if (hasCartSvg || hasCartAria || hasCartClass) {
                      cartBtn = el;
                      break;
                    }

                    const svg = el.querySelector('svg');
                    if (svg) {
                      const parentBar = el.closest('[class*="bottom" i], [class*="bar" i], [class*="row" i], [class*="action" i], [class*="buy" i], footer, nav');
                      if (parentBar) {
                        const parentText = parentBar.textContent?.toLowerCase() || '';
                        if (parentText.includes('buy now') || parentText.includes('buy with emi') || parentText.includes('emi')) {
                          cartBtn = el;
                          break;
                        }
                      }
                    }
                  }
                }

                // Priority C: Sibling / Adjacent to "Buy Now" or "Buy with EMI" button
                if (!cartBtn) {
                  for (const el of allElements) {
                    if (!isElVisible(el)) continue;
                    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                    if (txt.includes('buy now') || txt.includes('buy with emi')) {
                      const container = el.parentElement;
                      if (container) {
                        const siblingBtn = Array.from(container.querySelectorAll('button, [role="button"], a')).find(
                          (sib) => sib !== el && isElVisible(sib as HTMLElement) && !!sib.querySelector('svg, img')
                        ) as HTMLElement | undefined;
                        if (siblingBtn) {
                          cartBtn = siblingBtn;
                          break;
                        }
                      }
                    }
                  }
                }

                // Priority D: Loose regex fallback
                if (!cartBtn) {
                  for (const el of allElements) {
                    if (!isElVisible(el)) continue;
                    if (el.children.length > 2) continue;
                    const txt = (el.innerText || el.textContent || (el as HTMLInputElement).value || '').trim();
                    if (/^(?:buy\s*now|place\s*order|add\s*item)$/i.test(txt)) {
                      cartBtn = el.closest('button, a, [role="button"]') || el;
                      break;
                    }
                  }
                }

                if (cartBtn) {
                  // If wrapper selected, prefer the interactive inner button or submit input
                  const innerBtn = cartBtn.querySelector('input[type="submit"], input#add-to-cart-button, button') as HTMLElement | null;
                  const finalTarget = innerBtn || cartBtn;

                  finalTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  const opts = { bubbles: true, cancelable: true, view: window };
                  finalTarget.dispatchEvent(new PointerEvent('pointerdown', opts));
                  finalTarget.dispatchEvent(new MouseEvent('mousedown', opts));
                  finalTarget.focus();
                  finalTarget.dispatchEvent(new PointerEvent('pointerup', opts));
                  finalTarget.dispatchEvent(new MouseEvent('mouseup', opts));
                  if (typeof finalTarget.click === 'function') {
                    finalTarget.click();
                  } else {
                    finalTarget.dispatchEvent(new MouseEvent('click', opts));
                  }
                  return { success: true, clickedCart: true };
                }

                return {
                  success: false,
                  error: 'Could not find "Add to Cart" button on product page.'
                };
              }

              // 4. Search Submit (Dispatches Enter key event on active/search input + clicks search button)
              const activeInput = (document.activeElement as HTMLInputElement) || document.querySelector('input[type="search"], input[name="q"], input:focus');
              if (activeInput) {
                activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                activeInput.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                activeInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
                if (activeInput.form && typeof activeInput.form.requestSubmit === 'function') {
                  try {
                    activeInput.form.requestSubmit();
                    return { success: true };
                  } catch {}
                }
              }

              // Also check for explicit submit/magnifying glass buttons
              const submitButtons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button[aria-label*="search" i], button[title*="search" i], .search-btn, #nav-search-submit-button')) as HTMLElement[];
              for (const btn of submitButtons) {
                if (btn.offsetParent !== null) {
                  btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  btn.click();
                  return { success: true };
                }
              }

              return { success: true };
            }

            return { success: true };
          },
          args: [step]
        });

        if (results?.[0]?.result) {
          const res = results[0].result as any;
          if (res.navigated) {
            await new Promise((r) => setTimeout(r, 2200));
          } else if (res.clickedCart) {
            await new Promise((r) => setTimeout(r, 1800));
          }
          return res;
        }
      } catch (e: any) {
        return { success: false, error: e.message || 'Scripting execution failed' };
      }
    }

  return await ActionExecutor.executeStep(step);
}

async function executeWorkflowGraph(
  wf: Workflow,
  set: (partial: Partial<DIFMStore> | ((state: DIFMStore) => Partial<DIFMStore>)) => void,
  get: () => DIFMStore
) {
  let activeWf = { ...wf };

  while (activeWf.activeStepIndex < activeWf.steps.length) {
    const currentState = get();
    if (currentState.currentWorkflow?.status === 'aborted') {
      return;
    }

    const currentIndex = activeWf.activeStepIndex;
    const currentStep = activeWf.steps[currentIndex];

    activeWf.steps[currentIndex] = {
      ...currentStep,
      status: 'executing',
      timestamp: Date.now()
    };
    activeWf.executionLogs.push({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      level: 'info',
      message: `Executing step ${currentIndex + 1}: ${currentStep.description}`,
      stepId: currentStep.id
    });
    set({ currentWorkflow: { ...activeWf } });

    if (currentStep.requiresApproval || currentStep.action === 'checkpoint_approval') {
      activeWf.status = 'paused_hitl';
      activeWf.hitlCheckpoint = {
        reason: 'payment_approval',
        message: currentStep.description,
        options: ['Approve & Continue', 'Modify Values', 'Cancel'],
        suggestedAction: 'User authorization required'
      };
      activeWf.executionLogs.push({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        level: 'hitl',
        message: `Paused for User Authorization: "${currentStep.description}"`
      });
      set({ currentWorkflow: { ...activeWf }, isExecuting: false });
      return;
    }

    const result = await executeStepInActiveTab(currentStep);

    if (result.requiresHitl) {
      activeWf.status = 'paused_hitl';
      activeWf.hitlCheckpoint = {
        reason: 'error_recovery',
        message: result.hitlReason || 'Intervention needed to proceed',
        options: ['Resolved - Continue', 'Retry Step', 'Abort']
      };
      activeWf.executionLogs.push({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        level: 'hitl',
        message: `Barrier paused execution: ${result.hitlReason}`
      });
      set({ currentWorkflow: { ...activeWf }, isExecuting: false });
      return;
    }

    if (!result.success) {
      activeWf.steps[currentIndex] = {
        ...currentStep,
        status: 'failed',
        errorMessage: result.error
      };
      activeWf.status = 'paused_hitl';
      activeWf.hitlCheckpoint = {
        reason: 'error_recovery',
        message: result.error || 'Step execution encountered an error.',
        options: ['Retry Step', 'Perform Manually & Continue', 'Skip', 'Abort']
      };
      activeWf.executionLogs.push({
        id: `log-${Date.now()}`,
        timestamp: Date.now(),
        level: 'error',
        message: `Step ${currentIndex + 1} failed: ${result.error}`
      });
      set({ currentWorkflow: { ...activeWf }, isExecuting: false });
      return;
    }

    activeWf.steps[currentIndex] = {
      ...currentStep,
      status: 'success'
    };
    activeWf.executionLogs.push({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      level: 'success',
      message: `Completed step ${currentIndex + 1} successfully`
    });

    activeWf.activeStepIndex = currentIndex + 1;
    set({ currentWorkflow: { ...activeWf } });
  }

  activeWf.status = 'completed';
  activeWf.executionLogs.push({
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    level: 'success',
    message: 'Workflow completed successfully with zero unhandled errors'
  });
  set({ currentWorkflow: { ...activeWf }, isExecuting: false });
}
