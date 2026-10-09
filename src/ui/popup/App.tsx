import React, { useEffect, useState } from 'react';
import { 
  PaperPlaneRight, 
  SidebarSimple, 
  ClockCountdown, 
  Play, 
  Sparkle,
  Circle
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';

export const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const { automations, init, startWorkflow, isExecuting, currentWorkflow } = useDIFMStore();

  useEffect(() => {
    init();
  }, [init]);

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    startWorkflow(prompt);
  };

  const openSidePanel = () => {
    if (typeof chrome !== 'undefined' && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id });
          window.close();
        }
      });
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 antialiased p-3.5 gap-3 select-none">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-200 font-bold text-xs">
            DF
          </div>
          <span className="text-xs font-semibold text-zinc-100">Do It For Me</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-400">
            <Circle size={7} weight="fill" className={isExecuting ? 'text-amber-400 animate-pulse' : 'text-emerald-400'} />
            <span>{isExecuting ? 'Busy' : 'Ready'}</span>
          </div>

          <button
            onClick={openSidePanel}
            title="Open Side Panel"
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            <SidebarSimple size={15} />
          </button>
        </div>
      </div>

      <form onSubmit={handleRun} className="flex flex-col gap-2">
        <div className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should I do on this page?"
            className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg pl-3 pr-10 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isExecuting}
            className="absolute right-1.5 p-1.5 bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-40 rounded-md transition-colors"
          >
            <PaperPlaneRight size={12} weight="bold" />
          </button>
        </div>
      </form>

      {currentWorkflow && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-200 truncate">{currentWorkflow.title}</span>
            <span className="text-[10px] font-medium text-zinc-400 capitalize">{currentWorkflow.status}</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{
                width: `${
                  ((currentWorkflow.activeStepIndex + 1) / Math.max(currentWorkflow.steps.length, 1)) * 100
                }%`
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 flex-1 overflow-hidden">
        <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
          <div className="flex items-center gap-1.5">
            <ClockCountdown size={14} className="text-zinc-500" />
            <span>Quick Automations</span>
          </div>
          <button onClick={openSidePanel} className="text-[10px] text-zinc-500 hover:text-zinc-300 font-normal">
            View all
          </button>
        </div>

        <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-1">
          {automations.slice(0, 3).map((auto) => (
            <div
              key={auto.id}
              className="p-2 bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/80 rounded-md flex items-center justify-between text-xs transition-colors"
            >
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-medium text-zinc-200 truncate">{auto.title}</span>
                <span className="text-[10px] text-zinc-500">
                  {auto.schedule.type === 'monthly_day' ? `Day ${auto.schedule.dayOfMonth} monthly` : `${auto.schedule.intervalMinutes}m interval`}
                </span>
              </div>
              <button
                onClick={() => startWorkflow(auto.description)}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded transition-colors shrink-0"
              >
                <Play size={10} weight="fill" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={openSidePanel}
        className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors"
      >
        <Sparkle size={13} className="text-zinc-400" />
        <span>Open Master Control Panel</span>
      </button>
    </div>
  );
};
