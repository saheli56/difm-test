import React, { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Play, 
  Clock, 
  CalendarCheck, 
  CheckCircle, 
  XCircle,
  ToggleLeft,
  ToggleRight
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { AutomationRule } from '../../core/types';

export const AutomationsView: React.FC = () => {
  const { automations, saveAutomation, deleteAutomation, toggleAutomation, startWorkflow } = useDIFMStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<'monthly_day' | 'interval'>('monthly_day');
  const [dayOfMonth, setDayOfMonth] = useState('10');
  const [intervalMinutes, setIntervalMinutes] = useState('360');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;

    const newRule: AutomationRule = {
      id: `auto-${Date.now()}`,
      title,
      description: prompt,
      targetUrl: 'https://example.com',
      enabled: true,
      schedule: {
        type: scheduleType,
        dayOfMonth: scheduleType === 'monthly_day' ? parseInt(dayOfMonth) || 1 : undefined,
        intervalMinutes: scheduleType === 'interval' ? parseInt(intervalMinutes) || 60 : undefined
      },
      variables: {},
      createdAt: Date.now(),
      workflowTemplate: {
        id: `wf-template-${Date.now()}`,
        title,
        rawPrompt: prompt,
        targetUrl: 'https://example.com',
        steps: [
          {
            id: 's1',
            action: 'wait_for',
            description: 'Load target portal and inspect elements',
            status: 'pending'
          },
          {
            id: 's2',
            action: 'click',
            description: `Execute: ${prompt.slice(0, 30)}`,
            status: 'pending'
          },
          {
            id: 's3',
            action: 'checkpoint_approval',
            description: 'Final review and execution authorization',
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
    };

    saveAutomation(newRule);
    setTitle('');
    setPrompt('');
    setShowCreateModal(false);
  };

  const handleTriggerRun = (rule: AutomationRule) => {
    startWorkflow(rule.description || rule.title);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs font-semibold text-zinc-100">Recurring Automations</h3>
          <p className="text-[11px] text-zinc-400">Background tasks executed on interval or monthly triggers</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md flex items-center gap-1 transition-colors"
        >
          <Plus size={12} weight="bold" />
          <span>New Macro</span>
        </button>
      </div>

      {showCreateModal && (
        <form onSubmit={handleCreate} className="bg-zinc-900 border border-zinc-700/80 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">Create Scheduled Macro</span>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              Cancel
            </button>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Automation Name (e.g. Monthly CESC Electricity Bill)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
            required
          />

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Natural language instruction (e.g. Check CESC bill for consumer 01029384912 on 10th of every month)"
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 resize-none"
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400 font-medium">Schedule Type</label>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as 'monthly_day' | 'interval')}
                className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="monthly_day">Monthly Day</option>
                <option value="interval">Interval (Minutes)</option>
              </select>
            </div>

            {scheduleType === 'monthly_day' ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 font-medium">Day of Month (1-31)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 font-medium">Interval (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-100 focus:outline-none"
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            className="mt-1 w-full py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded transition-colors"
          >
            Save Automation
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {automations.map((auto) => (
          <div
            key={auto.id}
            className="bg-zinc-900/70 border border-zinc-800/80 hover:border-zinc-700/80 rounded-lg p-3 flex flex-col gap-2 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-100">{auto.title}</span>
                  {auto.lastStatus === 'success' ? (
                    <CheckCircle size={13} weight="fill" className="text-emerald-400" />
                  ) : auto.lastStatus === 'failed' ? (
                    <XCircle size={13} weight="fill" className="text-rose-400" />
                  ) : null}
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-2">{auto.description}</p>
              </div>

              <button
                onClick={() => toggleAutomation(auto.id, !auto.enabled)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {auto.enabled ? (
                  <ToggleRight size={22} weight="fill" className="text-emerald-400" />
                ) : (
                  <ToggleLeft size={22} className="text-zinc-600" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 font-mono">
              <div className="flex items-center gap-1">
                {auto.schedule.type === 'monthly_day' ? (
                  <>
                    <CalendarCheck size={12} className="text-zinc-400" />
                    <span>Every {auto.schedule.dayOfMonth}th of month</span>
                  </>
                ) : (
                  <>
                    <Clock size={12} className="text-zinc-400" />
                    <span>Every {auto.schedule.intervalMinutes} mins</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleTriggerRun(auto)}
                  className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded flex items-center gap-1 transition-colors"
                >
                  <Play size={10} weight="fill" />
                  <span>Run</span>
                </button>
                <button
                  onClick={() => deleteAutomation(auto.id)}
                  className="p-1 hover:bg-rose-950/40 hover:text-rose-400 rounded transition-colors text-zinc-500"
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
