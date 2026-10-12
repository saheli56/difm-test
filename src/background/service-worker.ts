import { AutomationManager } from '../core/scheduler/automation-manager';
import { BackgroundTabOrchestrator } from '../core/scheduler/background-runner';
import { ExtensionMessage } from '../core/types';
import { ReminderService } from '../core/reminders/reminder-service';

if (typeof chrome !== 'undefined') {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  chrome.runtime.onInstalled.addListener(async () => {
    // 1. Initialize automations alarms
    const automations = await AutomationManager.getAutomations();
    for (const auto of automations) {
      if (auto.enabled) {
        if (auto.schedule.type === 'interval' && auto.schedule.intervalMinutes) {
          chrome.alarms.create(`difm-auto-${auto.id}`, {
            periodInMinutes: auto.schedule.intervalMinutes
          });
        }
      }
    }

    // 2. Schedule recurring reminder checks for bills & return windows
    chrome.alarms.create('difm-reminders-checker', {
      periodInMinutes: 15
    });

    // Run initial check
    await ReminderService.checkAndDispatchReminders().catch(() => {});
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'difm-reminders-checker') {
      await ReminderService.checkAndDispatchReminders().catch(() => {});
      return;
    }

    if (alarm.name.startsWith('difm-auto-')) {
      const autoId = alarm.name.replace('difm-auto-', '');
      const automations = await AutomationManager.getAutomations();
      const target = automations.find((a) => a.id === autoId);

      if (target && target.enabled) {
        await BackgroundTabOrchestrator.executeBackgroundMacro(target);
      }
    }
  });

  if (chrome.notifications) {
    chrome.notifications.onClicked.addListener(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id && chrome.sidePanel && chrome.sidePanel.open) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        }
      });
    });
  }

  if (chrome.commands) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command === 'toggle-difm-hud') {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, { type: 'DIFM_TOGGLE_HUD' }).catch(() => {});
        }
      }
    });
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'DIFM_START_WORKFLOW') {
      chrome.runtime.sendMessage(message).catch(() => {});
      sendResponse({ received: true });
      return true;
    }
  });
}
