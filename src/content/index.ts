import { DeepSemanticCrawler } from '../core/ax-tree/deep-crawler';
import { ActionExecutor } from '../core/engine/executor';
import { VisualMacroRecorder } from './recorder';

class DIFMContentScript {
  private static instance: DIFMContentScript;
  private shadowHost: HTMLElement | null = null;
  private isHudVisible = false;

  public static init() {
    if (!this.instance) {
      this.instance = new DIFMContentScript();
      this.instance.setupMessageListeners();
      this.instance.setupKeyboardShortcuts();
    }
  }

  private setupMessageListeners() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
      switch (message.type) {
        case 'DIFM_EXTRACT_DOM': {
          const nodes = DeepSemanticCrawler.extractDeepInteractiveNodes();
          sendResponse({
            success: true,
            payload: {
              nodes,
              pageTitle: document.title,
              pageUrl: window.location.href
            }
          });
          return true;
        }

        case 'DIFM_EXECUTE_ACTION_IN_TAB': {
          ActionExecutor.executeStep(message.payload.step).then((result) => {
            sendResponse(result);
          });
          return true;
        }

        case 'DIFM_TOGGLE_HUD': {
          this.toggleSpotlightHud();
          sendResponse({ visible: this.isHudVisible });
          return true;
        }

        case 'DIFM_START_RECORDER': {
          VisualMacroRecorder.startRecording();
          sendResponse({ recording: true });
          return true;
        }

        case 'DIFM_STOP_RECORDER': {
          const steps = VisualMacroRecorder.stopRecording();
          sendResponse({ recording: false, steps });
          return true;
        }
      }
    });
  }

  private setupKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) {
        e.preventDefault();
        this.toggleSpotlightHud();
      }
    });
  }

  private toggleSpotlightHud() {
    this.isHudVisible = !this.isHudVisible;

    if (!this.shadowHost) {
      this.createShadowHud();
    }

    if (this.shadowHost) {
      this.shadowHost.style.display = this.isHudVisible ? 'block' : 'none';
      if (this.isHudVisible) {
        const input = this.shadowHost.shadowRoot?.querySelector('input');
        input?.focus();
      }
    }
  }

  private createShadowHud() {
    this.shadowHost = document.createElement('div');
    this.shadowHost.id = 'difm-spotlight-root';
    this.shadowHost.style.position = 'fixed';
    this.shadowHost.style.top = '15%';
    this.shadowHost.style.left = '50%';
    this.shadowHost.style.transform = 'translateX(-50%)';
    this.shadowHost.style.zIndex = '2147483647';
    this.shadowHost.style.display = 'none';

    const shadow = this.shadowHost.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .hud-card {
          width: 540px;
          background: #09090b;
          border: 1px solid #27272a;
          border-radius: 12px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          color: #f4f4f5;
        }
        .input-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .badge {
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          padding: 3px 6px;
          color: #e4e4e7;
        }
        input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #fafafa;
          font-size: 13px;
        }
        .footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #27272a;
          padding-top: 8px;
          font-size: 11px;
          color: #71717a;
        }
        .btn {
          background: #fafafa;
          color: #09090b;
          border: none;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 11px;
          cursor: pointer;
        }
      </style>
      <div class="hud-card">
        <div class="input-row">
          <span class="badge">DIFM</span>
          <input type="text" placeholder="Instruct browser agent to do anything on this tab..." />
          <button class="btn" id="run-btn">Execute</button>
        </div>
        <div class="footer">
          <span>Press <b>Esc</b> to dismiss &bull; Auto-resolves barriers & halts for payment approvals</span>
          <span>Zero External API Tokens</span>
        </div>
      </div>
    `;

    const input = container.querySelector('input') as HTMLInputElement;
    const runBtn = container.querySelector('#run-btn') as HTMLButtonElement;

    const executeFromHud = () => {
      const val = input.value.trim();
      if (!val) return;
      this.toggleSpotlightHud();
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'DIFM_START_WORKFLOW',
          payload: { prompt: val }
        });
      }
    };

    runBtn.addEventListener('click', executeFromHud);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeFromHud();
      } else if (e.key === 'Escape') {
        this.toggleSpotlightHud();
      }
    });

    shadow.appendChild(container);
    document.body.appendChild(this.shadowHost);
  }
}

DIFMContentScript.init();
