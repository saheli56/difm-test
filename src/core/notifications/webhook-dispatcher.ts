export interface WebhookPayload {
  event: 'macro_completed' | 'barrier_hitl_needed' | 'price_drop_alert' | 'bill_statement_ready';
  title: string;
  url: string;
  summary: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export class WebhookDispatcher {
  public static async dispatchAlert(webhookUrl: string, payload: WebhookPayload): Promise<boolean> {
    if (!webhookUrl || !webhookUrl.startsWith('http')) return false;

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
