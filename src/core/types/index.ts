export type TaskStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'paused_hitl'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'aborted';

export type ActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'scroll'
  | 'wait_for'
  | 'extract_text'
  | 'verify_condition'
  | 'checkpoint_approval';

export interface SemanticNode {
  id: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  placeholder?: string;
  selector: string;
  xpath: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isClickable: boolean;
  isInput: boolean;
  value?: string;
  attributes: Record<string, string>;
}

export interface StepCondition {
  type: 'price_below' | 'price_above' | 'text_contains' | 'element_present';
  expected: string | number;
  extractedValue?: string | number;
}

export interface WorkflowStep {
  id: string;
  action: ActionType;
  description: string;
  targetNodeSelector?: string;
  targetNodeXPath?: string;
  targetSemanticRole?: string;
  targetSemanticName?: string;
  value?: string;
  condition?: StepCondition;
  status: 'pending' | 'executing' | 'success' | 'failed' | 'skipped';
  requiresApproval?: boolean;
  errorMessage?: string;
  timestamp?: number;
}

export interface HitlCheckpoint {
  reason: 'payment_approval' | 'captcha_detected' | '2fa_required' | 'element_ambiguity' | 'error_recovery';
  message: string;
  options?: string[];
  suggestedAction?: string;
}

export interface Workflow {
  id: string;
  title: string;
  rawPrompt: string;
  targetUrl: string;
  steps: WorkflowStep[];
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  activeStepIndex: number;
  hitlCheckpoint?: HitlCheckpoint;
  executionLogs: ExecutionLogEntry[];
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'hitl';
  message: string;
  stepId?: string;
  details?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  title: string;
  description: string;
  targetUrl: string;
  workflowTemplate: Workflow;
  schedule: {
    type: 'interval' | 'monthly_day' | 'weekly_day' | 'on_page_visit';
    intervalMinutes?: number;
    dayOfMonth?: number;
    timeOfDay?: string;
  };
  enabled: boolean;
  lastRunAt?: number;
  lastStatus?: 'success' | 'failed' | 'interrupted';
  variables: Record<string, string>;
  createdAt: number;
}

export interface VaultItem {
  id: string;
  key: string;
  value: string;
  category: 'identifier' | 'account' | 'preference' | 'note';
  masked?: boolean;
  updatedAt: number;
}

export interface DIFMState {
  currentWorkflow: Workflow | null;
  automations: AutomationRule[];
  vault: VaultItem[];
  settings: {
    localAiEnabled: boolean;
    byokProvider: 'chrome_builtin' | 'openai' | 'anthropic' | 'gemini' | 'local_heuristic';
    apiKey?: string;
    modelName?: string;
    webhookUrl?: string;
    autoApproveSafeSteps: boolean;
    highlightInteractions: boolean;
  };
}

export type ExtensionMessage =
  | { type: 'DIFM_START_WORKFLOW'; payload: { prompt: string; targetUrl?: string } }
  | { type: 'DIFM_ABORT_WORKFLOW' }
  | { type: 'DIFM_RESUME_HITL'; payload: { decision: string; userInput?: string } }
  | { type: 'DIFM_RETRY_STEP'; payload: { stepIndex: number } }
  | { type: 'DIFM_RUN_AUTOMATION'; payload: { automationId: string } }
  | { type: 'DIFM_GET_STATE' }
  | { type: 'DIFM_STATE_UPDATE'; payload: Partial<DIFMState> }
  | { type: 'DIFM_EXTRACT_DOM'; payload: { query?: string } }
  | { type: 'DIFM_DOM_SNAPSHOT'; payload: { nodes: SemanticNode[]; pageTitle: string; pageUrl: string } }
  | { type: 'DIFM_EXECUTE_ACTION_IN_TAB'; payload: { step: WorkflowStep } }
  | { type: 'DIFM_ACTION_RESULT'; payload: { stepId: string; success: boolean; error?: string; extracted?: string } }
  | { type: 'DIFM_TOGGLE_HUD' };
