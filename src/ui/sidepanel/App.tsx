import React, { useEffect } from 'react';
import { Header } from '../components/Header';
import { AttentionView } from '../components/AttentionView';
import { BillsView } from '../components/BillsView';
import { PurchasesView } from '../components/PurchasesView';
import { TelemetryView } from '../components/TelemetryView';
import { AutomationsView } from '../components/AutomationsView';
import { VaultView } from '../components/VaultView';
import { SettingsView } from '../components/SettingsView';
import { useDIFMStore } from '../store/use-difm-store';

export const App: React.FC = () => {
  const { activeView, init } = useDIFMStore();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 antialiased select-none overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden relative bg-zinc-950">
        <div className={`h-full w-full flex-col ${activeView === 'attention' ? 'flex' : 'hidden'}`}>
          <AttentionView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'bills' ? 'flex' : 'hidden'}`}>
          <BillsView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'purchases' ? 'flex' : 'hidden'}`}>
          <PurchasesView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'telemetry' ? 'flex' : 'hidden'}`}>
          <TelemetryView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'automations' ? 'flex' : 'hidden'}`}>
          <AutomationsView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'vault' ? 'flex' : 'hidden'}`}>
          <VaultView />
        </div>
        <div className={`h-full w-full flex-col ${activeView === 'settings' ? 'flex' : 'hidden'}`}>
          <SettingsView />
        </div>
      </main>
    </div>
  );
};
