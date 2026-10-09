import { WorkflowStep, SemanticNode } from '../types';

export interface ModelResponse {
  steps: WorkflowStep[];
  reasoning?: string;
  source: 'chrome_builtin_nano' | 'cloud_byok' | 'deterministic_engine';
}

export class ModelClient {
  public static async queryPlanningModel(
    prompt: string,
    nodes: SemanticNode[],
    provider: 'chrome_builtin' | 'openai' | 'anthropic' | 'gemini' | 'local_heuristic',
    apiKey?: string
  ): Promise<ModelResponse> {
    // 1. Check Chrome Built-in Prompt API (Gemini Nano)
    if (provider === 'chrome_builtin' && typeof window !== 'undefined' && (window as any).ai?.languageModel) {
      try {
        const session = await (window as any).ai.languageModel.create({
          systemPrompt: 'You are DIFM, a fast browser automation agent. Output JSON array of execution steps for the interactive elements provided.'
        });
        const condensedNodes = nodes.slice(0, 40).map((n) => ({
          id: n.id,
          tag: n.tag,
          role: n.role,
          name: n.name,
          selector: n.selector
        }));
        const userMessage = `Goal: "${prompt}". Page Elements: ${JSON.stringify(condensedNodes)}. Provide step sequence JSON.`;
        const result = await session.prompt(userMessage);
        const parsed = this.tryParseJsonSteps(result);
        if (parsed.length > 0) {
          return {
            steps: parsed,
            reasoning: 'Synthesized via Chrome Built-in Gemini Nano',
            source: 'chrome_builtin_nano'
          };
        }
      } catch {
        // Fallback to local deterministic
      }
    }

    // 2. Cloud BYOK (OpenAI / Anthropic / Gemini)
    if (apiKey) {
      try {
        if (provider === 'openai') {
          return await this.callOpenAI(prompt, nodes, apiKey);
        } else if (provider === 'anthropic') {
          return await this.callAnthropic(prompt, nodes, apiKey);
        } else if (provider === 'gemini') {
          return await this.callGemini(prompt, nodes, apiKey);
        }
      } catch {
        // Fallback to deterministic engine on network / auth failure
      }
    }

    return {
      steps: [],
      source: 'deterministic_engine'
    };
  }

  private static async callOpenAI(prompt: string, nodes: SemanticNode[], key: string): Promise<ModelResponse> {
    const condensedNodes = nodes.slice(0, 30).map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      selector: n.selector
    }));

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Decompose browser task into structured JSON steps. Valid actions: click, type, wait_for, verify_condition, checkpoint_approval.'
          },
          {
            role: 'user',
            content: `Instruction: "${prompt}"\nAvailable Elements: ${JSON.stringify(condensedNodes)}`
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const parsed = this.tryParseJsonSteps(content);

    return {
      steps: parsed,
      source: 'cloud_byok',
      reasoning: 'Decomposed via OpenAI GPT-4o-mini'
    };
  }

  private static async callAnthropic(prompt: string, nodes: SemanticNode[], key: string): Promise<ModelResponse> {
    const condensedNodes = nodes.slice(0, 30).map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      selector: n.selector
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Decompose task into JSON array of steps: "${prompt}". Elements: ${JSON.stringify(condensedNodes)}`
          }
        ]
      })
    });

    const data = await res.json();
    const content = data.content?.[0]?.text || '';
    const parsed = this.tryParseJsonSteps(content);

    return {
      steps: parsed,
      source: 'cloud_byok',
      reasoning: 'Decomposed via Claude 3.5 Haiku'
    };
  }

  private static async callGemini(prompt: string, nodes: SemanticNode[], key: string): Promise<ModelResponse> {
    const condensedNodes = nodes.slice(0, 30).map((n) => ({
      id: n.id,
      name: n.name,
      role: n.role,
      selector: n.selector
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Output JSON array of steps for goal: "${prompt}". Elements: ${JSON.stringify(condensedNodes)}`
              }
            ]
          }
        ]
      })
    });

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = this.tryParseJsonSteps(content);

    return {
      steps: parsed,
      source: 'cloud_byok',
      reasoning: 'Decomposed via Gemini 2.0 Flash'
    };
  }

  private static tryParseJsonSteps(text: string): WorkflowStep[] {
    try {
      const match = text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      const array = Array.isArray(parsed) ? parsed : parsed.steps || [];
      return array.map((s: any, idx: number) => ({
        id: s.id || `step-${idx + 1}`,
        action: s.action || 'click',
        description: s.description || `Step ${idx + 1}`,
        targetSemanticName: s.targetSemanticName || s.name,
        targetNodeSelector: s.targetNodeSelector || s.selector,
        value: s.value,
        requiresApproval: Boolean(s.requiresApproval),
        status: 'pending' as const
      }));
    } catch {
      return [];
    }
  }
}
