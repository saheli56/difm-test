import { VaultItem } from '../types';

export class ContextVault {
  private static STORAGE_KEY = 'difm_context_vault_v1';

  public static async getItems(): Promise<VaultItem[]> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      return (result[this.STORAGE_KEY] as VaultItem[]) || this.getDefaultVaultItems();
    }
    const local = localStorage.getItem(this.STORAGE_KEY);
    return local ? JSON.parse(local) : this.getDefaultVaultItems();
  }

  public static async saveItem(item: Omit<VaultItem, 'id' | 'updatedAt'> & { id?: string }): Promise<VaultItem[]> {
    const current = await this.getItems();
    const id = item.id || `vault-${Date.now()}`;
    const newItem: VaultItem = {
      ...item,
      id,
      updatedAt: Date.now()
    };

    const existingIndex = current.findIndex((v) => v.id === id);
    let updated: VaultItem[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = newItem;
    } else {
      updated = [newItem, ...current];
    }

    await this.persist(updated);
    return updated;
  }

  public static async deleteItem(id: string): Promise<VaultItem[]> {
    const current = await this.getItems();
    const updated = current.filter((v) => v.id !== id);
    await this.persist(updated);
    return updated;
  }

  private static async persist(items: VaultItem[]): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: items });
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
  }

  private static getDefaultVaultItems(): VaultItem[] {
    return [
      {
        id: 'v1',
        key: 'CESC_CONSUMER_ID',
        value: '01029384912',
        category: 'identifier',
        masked: false,
        updatedAt: Date.now() - 86400000 * 2
      },
      {
        id: 'v2',
        key: 'PRIMARY_DELIVERY_ZIP',
        value: '700001',
        category: 'preference',
        masked: false,
        updatedAt: Date.now() - 86400000 * 4
      },
      {
        id: 'v3',
        key: 'RETURN_POLICY_NOTE',
        value: 'Always choose original payment source refund instead of store credits.',
        category: 'note',
        masked: false,
        updatedAt: Date.now() - 86400000 * 7
      }
    ];
  }
}
