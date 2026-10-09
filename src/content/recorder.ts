import { DeepSemanticCrawler } from '../core/ax-tree/deep-crawler';
import { WorkflowStep } from '../core/types';

export class VisualMacroRecorder {
  private static isRecording = false;
  private static hoverOverlay: HTMLElement | null = null;
  private static recordedSteps: WorkflowStep[] = [];

  public static startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.recordedSteps = [];
    this.createHoverOverlay();
    this.attachEventListeners();
  }

  public static stopRecording(): WorkflowStep[] {
    this.isRecording = false;
    this.removeHoverOverlay();
    this.detachEventListeners();
    return [...this.recordedSteps];
  }

  private static handleMouseMove = (e: MouseEvent) => {
    if (!this.isRecording || !this.hoverOverlay) return;
    const target = e.target as HTMLElement;
    if (!target || target.id?.startsWith('difm-') || target.closest('#difm-spotlight-root')) return;

    const rect = target.getBoundingClientRect();
    this.hoverOverlay.style.display = 'block';
    this.hoverOverlay.style.top = `${rect.top - 2}px`;
    this.hoverOverlay.style.left = `${rect.left - 2}px`;
    this.hoverOverlay.style.width = `${rect.width + 4}px`;
    this.hoverOverlay.style.height = `${rect.height + 4}px`;

    const badge = this.hoverOverlay.querySelector('.difm-badge') as HTMLElement;
    if (badge) {
      const tag = target.tagName.toLowerCase();
      const name = target.getAttribute('aria-label') || (target as HTMLInputElement).placeholder || target.innerText?.slice(0, 25) || tag;
      badge.innerText = `${tag} | ${name.trim()}`;
    }
  };

  private static handleClick = (e: MouseEvent) => {
    if (!this.isRecording) return;
    const target = e.target as HTMLElement;
    if (!target || target.id?.startsWith('difm-') || target.closest('#difm-spotlight-root')) return;

    e.preventDefault();
    e.stopPropagation();

    const tag = target.tagName.toLowerCase();
    const isInput = ['input', 'textarea', 'select'].includes(tag);
    const name = target.getAttribute('aria-label') || (target as HTMLInputElement).placeholder || target.innerText?.slice(0, 30) || tag;

    const step: WorkflowStep = {
      id: `rec-step-${Date.now()}`,
      action: isInput ? 'type' : 'click',
      description: isInput ? `Input data into ${name}` : `Click on ${name}`,
      targetSemanticName: name.trim(),
      targetNodeSelector: this.generateQuickSelector(target),
      status: 'pending'
    };

    this.recordedSteps.push(step);
    DeepSemanticCrawler.highlightElement(target, 'RECORDED');

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'DIFM_STATE_UPDATE',
        payload: {
          currentWorkflow: {
            id: `wf-rec-${Date.now()}`,
            title: `Recorded Workflow (${this.recordedSteps.length} steps)`,
            rawPrompt: 'Visually taught macro sequence',
            targetUrl: window.location.href,
            steps: this.recordedSteps,
            status: 'idle',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            activeStepIndex: 0,
            executionLogs: []
          }
        }
      }).catch(() => {});
    }
  };

  private static attachEventListeners() {
    window.addEventListener('mousemove', this.handleMouseMove, true);
    window.addEventListener('click', this.handleClick, true);
  }

  private static detachEventListeners() {
    window.removeEventListener('mousemove', this.handleMouseMove, true);
    window.removeEventListener('click', this.handleClick, true);
  }

  private static createHoverOverlay() {
    this.hoverOverlay = document.createElement('div');
    this.hoverOverlay.id = 'difm-recorder-hover';
    this.hoverOverlay.style.position = 'fixed';
    this.hoverOverlay.style.border = '2px dashed #10b981';
    this.hoverOverlay.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
    this.hoverOverlay.style.pointerEvents = 'none';
    this.hoverOverlay.style.zIndex = '2147483645';
    this.hoverOverlay.style.display = 'none';
    this.hoverOverlay.style.borderRadius = '4px';

    const badge = document.createElement('div');
    badge.className = 'difm-badge';
    badge.style.position = 'absolute';
    badge.style.top = '-20px';
    badge.style.left = '0';
    badge.style.backgroundColor = '#059669';
    badge.style.color = '#ffffff';
    badge.style.fontFamily = 'monospace';
    badge.style.fontSize = '10px';
    badge.style.padding = '1px 5px';
    badge.style.borderRadius = '3px';

    this.hoverOverlay.appendChild(badge);
    document.body.appendChild(this.hoverOverlay);
  }

  private static removeHoverOverlay() {
    if (this.hoverOverlay) {
      this.hoverOverlay.remove();
      this.hoverOverlay = null;
    }
  }

  private static generateQuickSelector(el: HTMLElement): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    const testId = el.getAttribute('data-testid');
    if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
    const name = el.getAttribute('name');
    if (name) return `[name="${CSS.escape(name)}"]`;
    return el.tagName.toLowerCase();
  }
}
