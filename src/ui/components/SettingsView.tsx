import React, { useState } from 'react';
import { 
  Cpu, 
  ShieldCheck, 
  SlidersHorizontal, 
  Key, 
  DownloadSimple, 
  WebhooksLogo, 
  Record, 
  Crown,
  ToggleLeft,
  ToggleRight,
  Check
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, automations, vault } = useDIFMStore();
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl || '');
  const [isRecording, setIsRecording] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExportData = () => {
    const backup = {
      automations,
      vault,
      settings,
      version: '1.0.0',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `difm-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleVisualRecording = () => {
    const nextState = !isRecording;
    setIsRecording(nextState);

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: nextState ? 'DIFM_START_RECORDER' : 'DIFM_STOP_RECORDER'
          }).catch(() => {});
        }
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3">
      {/* Pro Tier Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 border border-zinc-700/80 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Crown size={18} weight="fill" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
              DIFM Core (Free Local Tier)
            </span>
            <span className="text-[10px] text-zinc-400">Unlimited local deterministic macros & on-device AI</span>
          </div>
        </div>
      </div>

      {/* Visual Macro Recorder Trigger */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
            <Record size={14} className={isRecording ? 'text-rose-500 animate-pulse' : 'text-zinc-400'} weight="fill" />
            <span>Interactive Teach Mode</span>
          </span>
          <span className="text-[10px] text-zinc-500">Visually click & point on the page to record macros</span>
        </div>
        <button
          onClick={toggleVisualRecording}
          className={`px-3 py-1 text-xs font-semibold rounded-md border transition-all ${
            isRecording
              ? 'bg-rose-950/80 border-rose-700 text-rose-200 animate-pulse'
              : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200'
          }`}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </div>

      {/* Engine & BYOK */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-zinc-200">
          <Cpu size={15} className="text-blue-400" />
          <span className="text-xs font-semibold">Reasoning & Planning Engine</span>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-400 font-medium">Provider Selection</label>
          <select
            value={settings.byokProvider}
            onChange={(e) => updateSettings({ byokProvider: e.target.value as any })}
            className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none"
          >
            <option value="chrome_builtin">Chrome Built-in AI (Gemini Nano) - Free Local</option>
            <option value="local_heuristic">AXTree Deep Semantic Parser - Zero Tokens</option>
            <option value="openai">OpenAI (BYOK - GPT-4o-mini)</option>
            <option value="anthropic">Anthropic (BYOK - Claude 3.5 Haiku)</option>
            <option value="gemini">Google Gemini 2.0 Flash (BYOK)</option>
          </select>
        </div>

        {settings.byokProvider !== 'chrome_builtin' && settings.byokProvider !== 'local_heuristic' && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
              <Key size={12} />
              <span>API Key (Stored locally in chrome.storage)</span>
            </label>
            <input
              type="password"
              value={settings.apiKey || ''}
              onChange={(e) => updateSettings({ apiKey: e.target.value })}
              placeholder="sk-..."
              className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Safety Guardrails */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-200">
          <ShieldCheck size={15} className="text-emerald-400" />
          <span className="text-xs font-semibold">Security Guardrails</span>
        </div>

        <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-200">Mandatory Payment Checkpoint</span>
            <span className="text-[10px] text-zinc-500">Always pause for manual approval before checkout</span>
          </div>
          <button
            onClick={() => updateSettings({ autoApproveSafeSteps: !settings.autoApproveSafeSteps })}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ToggleRight size={22} weight="fill" className="text-emerald-400" />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-200">Visual Interaction Highlights</span>
            <span className="text-[10px] text-zinc-500">Render glowing target boxes during execution</span>
          </div>
          <button
            onClick={() => updateSettings({ highlightInteractions: !settings.highlightInteractions })}
            className="text-zinc-400 hover:text-zinc-200"
          >
            {settings.highlightInteractions ? (
              <ToggleRight size={22} weight="fill" className="text-emerald-400" />
            ) : (
              <ToggleLeft size={22} className="text-zinc-600" />
            )}
          </button>
        </div>
      </div>

      {/* Webhook Dispatcher */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-200">
          <WebhooksLogo size={15} className="text-amber-400" />
          <span className="text-xs font-semibold">Webhook Alerts & Notifications</span>
        </div>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => {
            setWebhookUrl(e.target.value);
            updateSettings({ webhookUrl: e.target.value });
          }}
          placeholder="https://discord.com/api/webhooks/... or Telegram endpoint"
          className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none"
        />
        <span className="text-[10px] text-zinc-500">
          DIFM dispatches background task results and price drop triggers to this webhook.
        </span>
      </div>

      {/* Data Backup */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-200">
          <SlidersHorizontal size={15} className="text-purple-400" />
          <span className="text-xs font-semibold">Backup & Storage</span>
        </div>

        <button
          onClick={handleExportData}
          className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <DownloadSimple size={14} />}
          <span>{copied ? 'Backup Downloaded' : 'Export Full Automation & Vault JSON'}</span>
        </button>
      </div>
    </div>
  );
};
