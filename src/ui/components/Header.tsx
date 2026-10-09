import React from 'react';
import { 
  Robot, 
  ClockCountdown, 
  Vault, 
  GearSix, 
  Globe, 
  Circle 
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';

export const Header: React.FC = () => {
  const { activeView, setActiveView, isExecuting, currentWorkflow, activeTabInfo } = useDIFMStore();

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Active Browser';
    }
  };

  const navItems = [
    { id: 'telemetry' as const, label: 'Agent', icon: Robot },
    { id: 'automations' as const, label: 'Automations', icon: ClockCountdown },
    { id: 'vault' as const, label: 'Vault', icon: Vault },
    { id: 'settings' as const, label: 'Settings', icon: GearSix }
  ];

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-40 px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-200 font-bold text-xs tracking-tight shadow-inner">
            DF
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold tracking-tight text-zinc-100 flex items-center gap-1.5">
              Do It For Me
              <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800/70 border border-zinc-700/50 rounded text-zinc-400 font-mono">
                v1.0
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] text-zinc-300 font-mono max-w-[150px] truncate">
            <Globe size={13} className="text-zinc-500 shrink-0" weight="bold" />
            <span className="truncate">{getDomain(activeTabInfo.url)}</span>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-900/90 border border-zinc-800 text-[11px] font-medium">
            <Circle 
              size={8} 
              weight="fill" 
              className={
                isExecuting 
                  ? 'text-amber-400 animate-pulse' 
                  : currentWorkflow?.status === 'paused_hitl' 
                  ? 'text-rose-400 animate-ping' 
                  : 'text-emerald-400'
              } 
            />
            <span className="text-zinc-300 capitalize text-[10px] font-mono">
              {currentWorkflow?.status === 'paused_hitl' ? 'HITL Pause' : isExecuting ? 'Running' : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 p-0.5 bg-zinc-900/80 border border-zinc-800/60 rounded-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon size={14} weight={isActive ? 'fill' : 'regular'} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
};
