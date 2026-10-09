import { AutomationRule } from '../types';

export class AutomationManager {
  private static STORAGE_KEY = 'difm_automations_v1';

  public static async getAutomations(): Promise<AutomationRule[]> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      return (result[this.STORAGE_KEY] as AutomationRule[]) || this.getDefaultAutomations();
    }
    const local = localStorage.getItem(this.STORAGE_KEY);
    return local ? JSON.parse(local) : this.getDefaultAutomations();
  }

  public static async saveAutomation(rule: AutomationRule): Promise<AutomationRule[]> {
    const current = await this.getAutomations();
    const existingIndex = current.findIndex((a) => a.id === rule.id);

    let updated: AutomationRule[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = rule;
    } else {
      updated = [rule, ...current];
    }

    await this.persist(updated);
    this.syncChromeAlarm(rule);
    return updated;
  }

  public static async deleteAutomation(id: string): Promise<AutomationRule[]> {
    const current = await this.getAutomations();
    const updated = current.filter((a) => a.id !== id);
    await this.persist(updated);

    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear(`difm-auto-${id}`);
    }

    return updated;
  }

  public static async toggleAutomation(id: string, enabled: boolean): Promise<AutomationRule[]> {
    const current = await this.getAutomations();
    const updated = current.map((a) => (a.id === id ? { ...a, enabled } : a));
    await this.persist(updated);

    const target = updated.find((a) => a.id === id);
    if (target) {
      this.syncChromeAlarm(target);
    }

    return updated;
  }

  private static syncChromeAlarm(rule: AutomationRule) {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;

    const alarmName = `difm-auto-${rule.id}`;
    if (!rule.enabled) {
      chrome.alarms.clear(alarmName);
      return;
    }

    if (rule.schedule.type === 'interval' && rule.schedule.intervalMinutes) {
      chrome.alarms.create(alarmName, {
        periodInMinutes: rule.schedule.intervalMinutes
      });
    } else if (rule.schedule.type === 'monthly_day') {
      // Check once a day if today is the target day of month
      chrome.alarms.create(alarmName, {
        periodInMinutes: 1440 // 24 hours
      });
    }
  }

  private static async persist(rules: AutomationRule[]): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: rules });
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(rules));
  }

  private static getDefaultAutomations(): AutomationRule[] {
    return [
      {
        id: 'auto-cesc-bill',
        title: 'Monthly CESC Electricity Bill Check',
        description: 'Auto-checks consumer billing statement on the 10th of every month & requests one-tap payment approval.',
        targetUrl: 'https://cesc.co.in/quickbill',
        schedule: {
          type: 'monthly_day',
          dayOfMonth: 10,
          timeOfDay: '10:00'
        },
        enabled: true,
        variables: {
          consumer_id: '01029384912',
          provider: 'CESC Limited'
        },
        createdAt: Date.now() - 86400000 * 3,
        lastStatus: 'success',
        lastRunAt: Date.now() - 86400000 * 1,
        workflowTemplate: {
          id: 'wf-cesc-template',
          title: 'CESC Monthly Bill Flow',
          rawPrompt: 'Check bill for consumer 01029384912 and prep payment confirmation',
          targetUrl: 'https://cesc.co.in/quickbill',
          steps: [
            {
              id: 's1',
              action: 'type',
              description: 'Enter Consumer Number (01029384912)',
              targetSemanticName: 'Consumer No',
              value: '01029384912',
              status: 'pending'
            },
            {
              id: 's2',
              action: 'click',
              description: 'Submit Consumer Query',
              targetSemanticName: 'Submit',
              status: 'pending'
            },
            {
              id: 's3',
              action: 'checkpoint_approval',
              description: 'Present bill breakdown & confirm payment',
              requiresApproval: true,
              status: 'pending'
            }
          ],
          status: 'idle',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeStepIndex: 0,
          executionLogs: []
        }
      },
      {
        id: 'auto-amazon-price',
        title: 'Sony WH-1000XM5 Price Drop Alert',
        description: 'Monitors Amazon item every 6 hours and auto-adds to cart if price falls below ₹24,990.',
        targetUrl: 'https://amazon.in/dp/B09XS7JWHH',
        schedule: {
          type: 'interval',
          intervalMinutes: 360
        },
        enabled: true,
        variables: {
          asin: 'B09XS7JWHH',
          max_price: '24990'
        },
        createdAt: Date.now() - 86400000 * 5,
        lastStatus: 'success',
        lastRunAt: Date.now() - 3600000 * 3,
        workflowTemplate: {
          id: 'wf-sony-template',
          title: 'Sony XM5 Price Drop Trigger',
          rawPrompt: 'Add Sony XM5 to cart if price < 24990',
          targetUrl: 'https://amazon.in/dp/B09XS7JWHH',
          steps: [
            {
              id: 's1',
              action: 'verify_condition',
              description: 'Verify price is below ₹24,990',
              condition: {
                type: 'price_below',
                expected: 24990
              },
              status: 'pending'
            },
            {
              id: 's2',
              action: 'click',
              description: 'Add to Cart',
              targetSemanticName: 'Add to Cart',
              status: 'pending'
            },
            {
              id: 's3',
              action: 'checkpoint_approval',
              description: 'Notify user price drop triggered cart insertion',
              requiresApproval: true,
              status: 'pending'
            }
          ],
          status: 'idle',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          activeStepIndex: 0,
          executionLogs: []
        }
      }
    ];
  }
}
