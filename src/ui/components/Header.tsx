import React from 'react';
import { 
  Robot, 
  ClockCountdown, 
  Vault, 
  GearSix, 
  Sparkle,
  Receipt,
  Package
} from '@phosphor-icons/react';
import { useDIFMStore, DIFMView } from '../store/use-difm-store';

export const Header: React.FC = () => {
  const { activeView, setActiveView, attentionItems } = useDIFMStore();

  const navItems: Array<{ id: DIFMView; label: string; icon: any; badge?: number }> = [
    { id: 'attention', label: 'Action', icon: Sparkle, badge: attentionItems.length },
    { id: 'bills', label: 'Bills', icon: Receipt },
    { id: 'purchases', label: 'Orders', icon: Package },
    { id: 'telemetry', label: 'Agent', icon: Robot },
    { id: 'automations', label: 'Macros', icon: ClockCountdown },
    { id: 'vault', label: 'Vault', icon: Vault },
    { id: 'settings', label: 'Settings', icon: GearSix }
  ];

  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md sticky top-0 z-40 px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-zinc-900 border border-zinc-700/60 flex items-center justify-center text-zinc-200 font-bold text-xs tracking-tight shadow-inner">
            DF
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold tracking-tight text-zinc-100">
              Do It For Me
            </span>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 p-0.5 bg-zinc-900/80 border border-zinc-800/60 rounded-lg overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`shrink-0 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-md text-xs font-medium transition-all relative ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon size={13} weight={isActive ? 'fill' : 'regular'} />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-500 text-zinc-950">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
