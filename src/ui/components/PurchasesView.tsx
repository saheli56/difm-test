import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  Trash, 
  ArrowSquareOut, 
  Check, 
  Clock, 
  X,
  Truck
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { ReturnStatus, SavedPurchaseRecord } from '../../core/records/types';
import { RecurrenceCalculator } from '../../core/detectors/recurrence-calculator';

export const PurchasesView: React.FC = () => {
  const { purchases, savePurchase, deletePurchase, markPurchaseStatus, startReturnWorkflow } = useDIFMStore();
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [productName, setProductName] = useState('');
  const [store, setStore] = useState('Amazon');
  const [deliveryDate, setDeliveryDate] = useState(RecurrenceCalculator.getTodayIso());
  const [returnDeadline, setReturnDeadline] = useState(
    RecurrenceCalculator.formatIsoDate(new Date(Date.now() + 10 * 86400000))
  );

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !store.trim()) return;

    const newPurchase: SavedPurchaseRecord = {
      id: `purchase-${Date.now()}`,
      productName: productName.trim(),
      store: store.trim(),
      storeDomain: store.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
      deliveryDate,
      deliveryStatus: 'delivered',
      returnDeadline,
      isReturnDeadlineEstimated: false,
      returnEligibility: 'eligible',
      sourceUrl: '',
      evidence: ['Manually added by user'],
      confidence: 1.0,
      reminderSchedule: {
        leadDays: [5, 2, 0]
      },
      returnStatus: 'tracked',
      userConfirmed: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await savePurchase(newPurchase);
    setShowAddModal(false);
    setProductName('');
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 p-3.5 gap-3 overflow-y-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-1.5">
          <Package size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Purchases & Return Windows</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-md text-zinc-200 font-medium flex items-center gap-1 transition-colors"
        >
          <Plus size={12} weight="bold" />
          <span>Add Purchase</span>
        </button>
      </div>

      {/* Purchases List */}
      {purchases.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2 text-zinc-500 my-auto">
          <Package size={28} weight="thin" />
          <p className="text-xs">No purchases or return windows tracked yet.</p>
          <p className="text-[11px] text-zinc-600">
            DIFM automatically detects delivered purchases on shopping sites and tracks return deadlines.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {purchases.map((purchase) => {
            const daysLeft = purchase.returnDeadline
              ? RecurrenceCalculator.getDaysDifference(purchase.returnDeadline)
              : null;

            const isExpired = daysLeft !== null && daysLeft < 0;
            const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

            return (
              <div
                key={purchase.id}
                className="p-3 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl flex flex-col gap-2.5 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-blue-400 font-semibold border border-zinc-700/50">
                        {purchase.store}
                      </span>
                      {purchase.returnStatus !== 'tracked' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 capitalize">
                          {purchase.returnStatus.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-zinc-100 truncate mt-1">
                      {purchase.productName}
                    </span>
                    {purchase.deliveryDate && (
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Truck size={12} />
                        Delivered {purchase.deliveryDate}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    {purchase.returnDeadline && (
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isExpired
                            ? 'bg-zinc-800 text-zinc-500'
                            : isUrgent
                            ? 'bg-rose-950/80 border border-rose-800/60 text-rose-300'
                            : 'bg-emerald-950/80 border border-emerald-800/60 text-emerald-300'
                        }`}
                      >
                        {isExpired
                          ? 'Window Closed'
                          : daysLeft === 0
                          ? 'Due Today'
                          : `${daysLeft}d remaining`}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500 mt-1">
                      Deadline: {purchase.returnDeadline || 'Unverified'}
                      {purchase.isReturnDeadlineEstimated ? ' (est.)' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
                  <div className="flex items-center gap-1.5">
                    {purchase.returnStatus === 'tracked' && !isExpired && (
                      <button
                        onClick={() => startReturnWorkflow(purchase)}
                        className="py-1 px-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <ArrowSquareOut size={12} />
                        <span>Start Return</span>
                      </button>
                    )}
                    {purchase.returnStatus === 'tracked' && (
                      <button
                        onClick={() => markPurchaseStatus(purchase.id, 'kept')}
                        className="py-1 px-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                      >
                        <Check size={11} weight="bold" />
                        <span>Keep Item</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => deletePurchase(purchase.id)}
                    title="Delete purchase"
                    className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Purchase Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-semibold text-zinc-100">Add Tracked Purchase</span>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sony WH-1000XM5 Headphones"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Store / Retailer</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Amazon, Flipkart, Best Buy"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Delivery Date</label>
                <input
                  type="date"
                  required
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Return Deadline</label>
                <input
                  type="date"
                  required
                  value={returnDeadline}
                  onChange={(e) => setReturnDeadline(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-400 text-zinc-950"
                >
                  Track Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
