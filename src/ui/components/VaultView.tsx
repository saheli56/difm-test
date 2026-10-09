import React, { useState } from 'react';
import { 
  Plus, 
  Trash, 
  Copy, 
  IdentificationCard, 
  Sliders, 
  Note, 
  Check
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { VaultItem } from '../../core/types';

export const VaultView: React.FC = () => {
  const { vault, saveVaultItem, deleteVaultItem } = useDIFMStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<VaultItem['category']>('identifier');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) return;

    saveVaultItem({
      key: key.toUpperCase().replace(/\s+/g, '_'),
      value,
      category,
      masked: false
    });

    setKey('');
    setValue('');
    setShowAddModal(false);
  };

  const copyToken = (keyName: string) => {
    navigator.clipboard.writeText(`{{${keyName}}}`);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getCategoryIcon = (cat: VaultItem['category']) => {
    switch (cat) {
      case 'identifier':
        return <IdentificationCard size={14} className="text-blue-400" />;
      case 'preference':
        return <Sliders size={14} className="text-purple-400" />;
      case 'note':
        return <Note size={14} className="text-amber-400" />;
      default:
        return <IdentificationCard size={14} className="text-emerald-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
            <span>Context Vault & Notes</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded font-medium">
              Encrypted Local
            </span>
          </h3>
          <p className="text-[11px] text-zinc-400">Agent memory for consumer IDs, account hints, and variables</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-md flex items-center gap-1 transition-colors"
        >
          <Plus size={12} weight="bold" />
          <span>Add Key</span>
        </button>
      </div>

      {showAddModal && (
        <form onSubmit={handleAdd} className="bg-zinc-900 border border-zinc-700/80 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-200">New Vault Variable</span>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="KEY_NAME (e.g. CESC_ID)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 uppercase focus:outline-none"
              required
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as VaultItem['category'])}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none"
            >
              <option value="identifier">Identifier (ID/No)</option>
              <option value="preference">Preference</option>
              <option value="note">Note / Directive</option>
            </select>
          </div>

          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value or custom directive..."
            rows={2}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none"
            required
          />

          <button
            type="submit"
            className="w-full py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold rounded transition-colors"
          >
            Save to Vault
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {vault.map((item) => (
          <div
            key={item.id}
            className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 rounded-lg p-2.5 flex flex-col gap-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {getCategoryIcon(item.category)}
                <span className="text-xs font-semibold text-zinc-200 tracking-tight">
                  {item.key}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copyToken(item.key)}
                  title="Copy token reference"
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                >
                  {copiedKey === item.key ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
                <button
                  onClick={() => deleteVaultItem(item.id)}
                  title="Delete key"
                  className="p-1 hover:bg-rose-950/40 hover:text-rose-400 text-zinc-500 rounded transition-colors"
                >
                  <Trash size={12} />
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-300 bg-zinc-950/60 p-1.5 rounded border border-zinc-800/40 break-all select-text">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
