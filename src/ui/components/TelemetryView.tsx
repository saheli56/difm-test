import React, { useState } from 'react';
import { 
  PaperPlaneRight, 
  Stop, 
  ArrowClockwise, 
  CheckCircle, 
  XCircle, 
  WarningCircle, 
  ShieldWarning, 
  LockKey, 
  CreditCard,
  CursorClick, 
  Keyboard, 
  Eye, 
  HourglassHigh,
  TerminalWindow,
  Sparkle,
  BookmarkSimple
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { WorkflowStep } from '../../core/types';

export const TelemetryView: React.FC = () => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [hitlInput, setHitlInput] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  const {
    currentWorkflow,
    isExecuting,
    startWorkflow,
    abortWorkflow,
    resumeHitl,
    retryStep,
    saveAutomation,
    vault
  } = useDIFMStore();

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isExecuting) return;
    startWorkflow(inputPrompt);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInputPrompt(prompt);
    startWorkflow(prompt);
  };

  const handleSaveAsAutomation = () => {
    if (!currentWorkflow) return;
    saveAutomation({
      id: `auto-${Date.now()}`,
      title: currentWorkflow.title,
      description: currentWorkflow.rawPrompt,
      targetUrl: currentWorkflow.targetUrl,
      enabled: true,
      createdAt: Date.now(),
      schedule: {
        type: 'monthly_day',
        dayOfMonth: 1
      },
      variables: {},
      workflowTemplate: currentWorkflow
    });
  };

  const renderActionIcon = (action: WorkflowStep['action']) => {
    switch (action) {
      case 'click':
        return <CursorClick size={14} className="text-blue-400" />;
      case 'type':
        return <Keyboard size={14} className="text-emerald-400" />;
      case 'wait_for':
        return <Eye size={14} className="text-amber-400" />;
      case 'verify_condition':
        return <HourglassHigh size={14} className="text-purple-400" />;
      case 'checkpoint_approval':
        return <LockKey size={14} className="text-rose-400" />;
      default:
        return <Sparkle size={14} className="text-zinc-400" />;
    }
  };

  const renderStatusBadge = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={15} weight="fill" className="text-emerald-400 shrink-0" />;
      case 'executing':
        return (
          <div className="h-3.5 w-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
        );
      case 'failed':
        return <XCircle size={15} weight="fill" className="text-rose-400 shrink-0" />;
      default:
        return <div className="h-2 w-2 rounded-full bg-zinc-700 shrink-0" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3">
      <form onSubmit={handleExecute} className="flex flex-col gap-1.5">
        <div className="relative flex items-center">
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={isExecuting}
            placeholder="Instruct agent (e.g. Pay CESC bill for consumer 01029384912)"
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-3 pr-20 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors shadow-inner"
          />
          <div className="absolute right-1.5 flex items-center gap-1">
            {isExecuting ? (
              <button
                type="button"
                onClick={abortWorkflow}
                className="px-2.5 py-1 bg-rose-950/70 border border-rose-800/80 hover:bg-rose-900 text-rose-200 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors"
              >
                <Stop size={12} weight="fill" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputPrompt.trim()}
                className="px-2.5 py-1 bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-40 disabled:hover:bg-zinc-100 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors shadow-sm"
              >
                <span>Run</span>
                <PaperPlaneRight size={12} weight="bold" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => handleQuickPrompt('Pay CESC electricity bill with consumer id 01029384912')}
            className="shrink-0 px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            CESC Bill Pay
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('Add Sony WH-1000XM5 to cart if price is below 24990')}
            className="shrink-0 px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Price Drop Cart
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('Process return request for order #402-918239')}
            className="shrink-0 px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Order Return
          </button>
        </div>
      </form>

      {/* Reactive HITL Barrier Card */}
      {currentWorkflow?.status === 'paused_hitl' && currentWorkflow.hitlCheckpoint && (
        <div className="bg-rose-950/30 border border-rose-800/80 rounded-lg p-3 flex flex-col gap-2.5 shadow-lg">
          <div className="flex items-start gap-2">
            <div className="p-1.5 rounded-md bg-rose-900/50 text-rose-300 border border-rose-700/60 shrink-0">
              {currentWorkflow.hitlCheckpoint.reason === 'payment_approval' ? (
                <CreditCard size={18} weight="bold" />
              ) : currentWorkflow.hitlCheckpoint.reason === '2fa_required' ? (
                <LockKey size={18} weight="bold" />
              ) : (
                <ShieldWarning size={18} weight="bold" />
              )}
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-xs font-semibold text-rose-200 uppercase tracking-wider font-mono">
                {currentWorkflow.hitlCheckpoint.reason.replace('_', ' ')}
              </span>
              <p className="text-xs text-zinc-200 leading-relaxed">
                {currentWorkflow.hitlCheckpoint.message}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-1 border-t border-rose-900/40">
            <input
              type="text"
              value={hitlInput}
              onChange={(e) => setHitlInput(e.target.value)}
              placeholder="Optional input / custom instruction override..."
              className="w-full bg-zinc-950/80 border border-rose-800/60 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
            />
            <div className="flex items-center gap-1.5 justify-end">
              <button
                type="button"
                onClick={() => abortWorkflow()}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-medium rounded transition-colors"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={() => {
                  resumeHitl('Approve & Continue', hitlInput);
                  setHitlInput('');
                }}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded transition-colors shadow-sm"
              >
                Authorize & Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow Step Progression */}
      {currentWorkflow ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-zinc-200 truncate max-w-[200px]">
                {currentWorkflow.title}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                {currentWorkflow.steps.length} Steps
              </span>
            </div>
            <button
              onClick={handleSaveAsAutomation}
              title="Save as recurring automation"
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <BookmarkSimple size={15} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {currentWorkflow.steps.map((step, idx) => {
              const isActive = currentWorkflow.activeStepIndex === idx && currentWorkflow.status === 'running';
              return (
                <div
                  key={step.id}
                  className={`p-2 rounded-md border text-xs flex items-start gap-2.5 transition-all ${
                    isActive
                      ? 'bg-zinc-800/90 border-zinc-600 shadow-sm'
                      : step.status === 'success'
                      ? 'bg-zinc-900/40 border-zinc-800/50 text-zinc-400'
                      : step.status === 'failed'
                      ? 'bg-rose-950/20 border-rose-900/50 text-rose-200'
                      : 'bg-zinc-950/30 border-zinc-800/30 text-zinc-500'
                  }`}
                >
                  <div className="pt-0.5">{renderStatusBadge(step.status)}</div>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                        {renderActionIcon(step.action)}
                        <span className="truncate">{step.description}</span>
                      </span>
                      {step.status === 'failed' && (
                        <button
                          onClick={() => retryStep(idx)}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 underline"
                        >
                          <ArrowClockwise size={11} />
                          Retry
                        </button>
                      )}
                    </div>
                    {step.value && (
                      <span className="font-mono text-[10px] text-zinc-400 truncate bg-zinc-950/50 px-1.5 py-0.5 rounded border border-zinc-800 w-fit">
                        Value: "{step.value}"
                      </span>
                    )}
                    {step.errorMessage && (
                      <span className="text-[10px] text-rose-400 mt-0.5 font-mono">
                        Error: {step.errorMessage}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-800 rounded-lg">
          <Sparkle size={28} weight="duotone" className="text-zinc-600 mb-2" />
          <h4 className="text-xs font-semibold text-zinc-300">Zero-Overhead Browser Agent</h4>
          <p className="text-[11px] text-zinc-500 mt-1 max-w-[240px]">
            Input instructions above to execute actions natively inside this tab without external token costs.
          </p>
        </div>
      )}

      {/* Execution Telemetry Log Drawer */}
      {currentWorkflow && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-950 overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full px-3 py-2 bg-zinc-900/60 hover:bg-zinc-900 flex items-center justify-between text-xs text-zinc-400 font-mono transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <TerminalWindow size={14} />
              <span>Execution Logs ({currentWorkflow.executionLogs.length})</span>
            </div>
            <span className="text-[10px] text-zinc-500">{showLogs ? 'Hide' : 'Expand'}</span>
          </button>

          {showLogs && (
            <div className="p-2.5 max-h-48 overflow-y-auto font-mono text-[10px] flex flex-col gap-1 border-t border-zinc-800/80 bg-zinc-950">
              {currentWorkflow.executionLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-1.5">
                  <span className="text-zinc-600 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-rose-400'
                        : log.level === 'warn'
                        ? 'text-amber-400'
                        : log.level === 'success'
                        ? 'text-emerald-400'
                        : log.level === 'hitl'
                        ? 'text-purple-400 font-semibold'
                        : 'text-zinc-400'
                    }
                  >
                    [{log.level.toUpperCase()}] {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
