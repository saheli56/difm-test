import React, { useEffect } from 'react';
import { Header } from '../components/Header';
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
    <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 antialiased select-none">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'telemetry' && <TelemetryView />}
        {activeView === 'automations' && <AutomationsView />}
        {activeView === 'vault' && <VaultView />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  );
};
