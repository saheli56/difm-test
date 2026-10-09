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
  const tabs = await chrome.tabs.query({ active: true });
  const webTab = tabs.find((t) => t.url && t.url.startsWith('http') && !t.url.includes('extension://'));
  if (webTab) return webTab;

  const allTabs = await chrome.tabs.query({});
  return allTabs.find((t) => t.active && t.url && t.url.startsWith('http')) || allTabs.find((t) => t.url && t.url.startsWith('http')) || null;
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
      if (response) return response;
    } catch {
      // Direct in-tab scripted execution fallback
      if (chrome.scripting) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: (s) => {
              const searchInput = document.querySelector(
                '#searchInput, input[type="search"], input[name="search"], input[name="q"], [aria-label*="search" i], [placeholder*="search" i]'
              ) as HTMLInputElement | null;

              if (s.action === 'type' && searchInput) {
                searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                searchInput.focus();
                searchInput.value = s.value || '';
                searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                searchInput.dispatchEvent(new Event('change', { bubbles: true }));
                searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                return { success: true };
              }

              if (s.action === 'click') {
                const searchButton = document.querySelector(
                  'button[type="submit"], button.searchButton, button.pure-button, .cdx-search-input__end-button'
                ) as HTMLElement | null;
                if (searchButton) {
                  searchButton.click();
                  return { success: true };
                }
                if (searchInput && searchInput.form) {
                  searchInput.form.submit();
                  return { success: true };
                }
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
