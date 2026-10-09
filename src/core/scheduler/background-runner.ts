import { AutomationRule } from '../types';

export class BackgroundTabOrchestrator {
  public static async executeBackgroundMacro(rule: AutomationRule): Promise<{ success: boolean; result?: string; hitlPrompt?: string }> {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      return { success: false, result: 'Chrome extension environment required' };
    }

    // 1. Create a quiet background tab
    const tab = await chrome.tabs.create({
      url: rule.targetUrl,
      active: false
    });

    if (!tab.id) {
      return { success: false, result: 'Failed to launch background tab' };
    }

    try {
      // 2. Wait for page load
      await this.waitForTabComplete(tab.id);

      // 3. Inject execution script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (steps) => {
          return new Promise((resolve) => {
            const currentTitle = document.title;
            const bodyText = document.body.innerText;
            resolve({
              title: currentTitle,
              snippet: bodyText.slice(0, 300)
            });
          });
        },
        args: [rule.workflowTemplate.steps]
      });

      // 4. Update automation record
      rule.lastRunAt = Date.now();
      rule.lastStatus = 'success';

      // 5. Notify user
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.svg',
          title: `DIFM Completed: ${rule.title}`,
          message: `Background check finished on ${new URL(rule.targetUrl).hostname}.`,
          priority: 1
        });
      }

      // Close tab if safe
      await chrome.tabs.remove(tab.id);

      return {
        success: true,
        result: `Executed background macro for ${rule.title}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (tab.id) {
        // Leave tab open so user can inspect if needed
      }
      return { success: false, result: msg };
    }
  }

  private static waitForTabComplete(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: { status?: string }) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
}
