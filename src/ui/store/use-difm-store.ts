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

    const workflow = await TaskPlanner.planWorkflow(prompt, activeTabInfo.url, vault);
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

async function findActiveWebTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.query) return null;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url && tab.url.startsWith('http') && !tab.url.includes('extension://')) return tab;
  } catch {}

  try {
    const tabs = await chrome.tabs.query({ active: true });
    const webTab = tabs.find((t) => t.url && t.url.startsWith('http') && !t.url.includes('extension://'));
    if (webTab) return webTab;
  } catch {}

  try {
    const allTabs = await chrome.tabs.query({});
    return allTabs.find((t) => t.active && t.url && t.url.startsWith('http')) || allTabs.find((t) => t.url && t.url.startsWith('http')) || null;
  } catch {}

  return null;
}

async function executeStepInActiveTab(step: WorkflowStep): Promise<{
  success: boolean;
  error?: string;
  extracted?: string;
  requiresHitl?: boolean;
  hitlReason?: string;
}> {
  const activeTab = await findActiveWebTab();

  if (activeTab?.id) {
    if (step.action === 'navigate' && step.value) {
      await chrome.tabs.update(activeTab.id, { url: step.value });
      await new Promise((r) => setTimeout(r, 1500));
      return { success: true };
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

    if (chrome.scripting) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (s) => {
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
              '.cdx-text-input__input'
            ];

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

            if (s.action === 'type') {
              let inputEl: HTMLInputElement | null = null;
              for (const selector of searchInputs) {
                const el = document.querySelector(selector) as HTMLInputElement | null;
                if (el && el.offsetParent !== null) {
                  inputEl = el;
                  break;
                }
              }

              if (!inputEl) {
                inputEl = document.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
              }

              if (inputEl) {
                inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                inputEl.focus();
                
                const val = s.value || '';
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                if (nativeSetter) {
                  nativeSetter.call(inputEl, val);
                } else {
                  inputEl.value = val;
                }

                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true };
              }
              return { success: false, error: 'Could not locate input search box on page.' };
            }

            const addToCartButtons = [
              '#add-to-cart-button',
              'input#add-to-cart-button',
              'input[name="submit.add-to-cart"]',
              'button[name="submit.add-to-cart"]',
              '#buy-now-button',
              'input#buy-now-button',
              '[data-action="add-to-cart"]',
              '.a-button-input[value="Add to Cart"]',
              'button[aria-label*="Add to cart" i]',
              'button[title*="Add to cart" i]'
            ];

            if (s.action === 'click') {
              // 1. If opening top product from search results
              if (s.targetSemanticName === 'first_product' || s.description?.toLowerCase().includes('open top matching')) {
                const productLinks = Array.from(document.querySelectorAll(
                  '[data-component-type="s-search-result"] h2 a, .s-result-item h2 a, a.a-link-normal.s-no-outline, .s-product-image-container a'
                )) as HTMLElement[];

                for (const link of productLinks) {
                  if (link.offsetParent !== null) {
                    link.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    link.click();
                    return { success: true };
                  }
                }
              }

              // 2. If Open Cart / Checkout navigation action
              if (s.description?.toLowerCase().includes('open cart') || s.targetSemanticName?.toLowerCase() === 'cart') {
                const navCart = document.querySelector('#nav-cart, #nav-cart-count-container, a[href*="/cart"], a[href*="/gp/cart"]') as HTMLElement | null;
                if (navCart) {
                  navCart.click();
                  return { success: true };
                }
                if (window.location.hostname.includes('amazon')) {
                  window.location.href = 'https://www.amazon.in/gp/cart/view.html';
                  return { success: true };
                }
              }

              // 3. If Add to Cart action
              if (s.targetSemanticName?.toLowerCase().includes('cart') || s.description?.toLowerCase().includes('add to cart')) {
                // A. Check standard product page buttons (primary buybox)
                for (const selector of addToCartButtons) {
                  const el = document.querySelector(selector) as HTMLElement | null;
                  if (el && el.offsetParent !== null) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    el.click();
                    return { success: true };
                  }
                }

                // B. Check for inline search card yellow "Add to cart" buttons
                const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a, .a-button-text, .a-button-inner button'));
                for (const el of allButtons) {
                  const txt = (el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '').toLowerCase().trim();
                  if (txt === 'add to cart' || txt === 'add to basket') {
                    const btn = (el.closest('.a-button-inner')?.querySelector('button') || el) as HTMLElement;
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    btn.click();
                    return { success: true };
                  }
                }
              }

              // 4. Search submit buttons
              let btnEl: HTMLElement | null = null;
              for (const selector of searchButtons) {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (el && el.offsetParent !== null) {
                  btnEl = el;
                  break;
                }
              }

              if (btnEl) {
                btnEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                btnEl.click();
                return { success: true };
              }

              for (const selector of searchInputs) {
                const input = document.querySelector(selector) as HTMLInputElement | null;
                if (input && input.form) {
                  if (typeof input.form.requestSubmit === 'function') {
                    input.form.requestSubmit();
                  } else {
                    input.form.submit();
                  }
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
          return results[0].result as any;
        }
      } catch (e: any) {
        return { success: false, error: e.message || 'Scripting execution failed' };
      }
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
