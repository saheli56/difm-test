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
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          set({
            activeTabInfo: {
              url: tabs[0].url || '',
              title: tabs[0].title || '',
              id: tabs[0].id
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

    // Execute steps sequentially
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

async function executeStepInActiveTab(step: WorkflowStep): Promise<{
  success: boolean;
  error?: string;
  extracted?: string;
  requiresHitl?: boolean;
  hitlReason?: string;
}> {
  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
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
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              files: ['content.js']
            });
            await new Promise((r) => setTimeout(r, 200));
            const response = await chrome.tabs.sendMessage(activeTab.id, {
              type: 'DIFM_EXECUTE_ACTION_IN_TAB',
              payload: { step }
            });
            if (response) return response;
          } catch {
            // Fall through to ActionExecutor
          }
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
    // Check if aborted in meantime
    const currentState = get();
    if (currentState.currentWorkflow?.status === 'aborted') {
      return;
    }

    const currentIndex = activeWf.activeStepIndex;
    const currentStep = activeWf.steps[currentIndex];

    // Mark step executing
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

    // Handle manual approval checkpoint requirement
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

    // Execute action in active browser tab
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

    // Step succeeded
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

  // All steps completed
  activeWf.status = 'completed';
  activeWf.executionLogs.push({
    id: `log-${Date.now()}`,
    timestamp: Date.now(),
    level: 'success',
    message: 'Workflow completed successfully with zero unhandled errors'
  });
  set({ currentWorkflow: { ...activeWf }, isExecuting: false });
}
