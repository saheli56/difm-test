import React, { useState } from 'react';
import { 
  Receipt, 
  Plus, 
  Trash, 
  ArrowSquareOut, 
  Check, 
  CalendarCheck, 
  Sparkle,
  X
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { BillCategory, RecurrenceFrequency, SavedBillRecord } from '../../core/records/types';
import { RecurrenceCalculator } from '../../core/detectors/recurrence-calculator';

export const BillsView: React.FC = () => {
  const { bills, saveBill, deleteBill, markBillPaid, startBillPaymentWorkflow } = useDIFMStore();
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [provider, setProvider] = useState('');
  const [category, setCategory] = useState<BillCategory>('electricity');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(RecurrenceCalculator.getTodayIso());
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider.trim() || !amount) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const newBill: SavedBillRecord = {
      id: `bill-${Date.now()}`,
      provider: provider.trim(),
      category,
      amount: parsedAmount,
      currency: '₹',
      lastPaymentDate: RecurrenceCalculator.getTodayIso(),
      nextEstimatedDueDate: dueDate,
      isDueDateEstimated: false,
      recurrenceRule: {
        frequency,
        dayOfMonth: new Date(dueDate).getDate() || 1,
        isConfirmedByUser: true
      },
      sourceUrl: '',
      providerDomain: provider.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
      evidence: ['Manually added by user'],
      confidence: 1.0,
      reminderPreferences: {
        leadDays: [3, 1, 0],
        notifyOnDueDay: true,
        enabled: true
      },
      status: 'active',
      userConfirmed: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await saveBill(newBill);
    setShowAddModal(false);
    setProvider('');
    setAmount('');
  };

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 p-3.5 gap-3 overflow-y-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-1.5">
          <Receipt size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Recurring Bills</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-md text-zinc-200 font-medium flex items-center gap-1 transition-colors"
        >
          <Plus size={12} weight="bold" />
          <span>Add Bill</span>
        </button>
      </div>

      {/* Bills List */}
      {bills.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2 text-zinc-500 my-auto">
          <Receipt size={28} weight="thin" />
          <p className="text-xs">No recurring bills tracked yet.</p>
          <p className="text-[11px] text-zinc-600">
            DIFM will automatically offer to remember bills when you make payments, or you can add one manually.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="p-3 bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 rounded-xl flex flex-col gap-2.5 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {bill.provider}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize border border-zinc-700/50">
                      {bill.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-400 mt-0.5">
                    {bill.currency}{bill.amount}
                  </span>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[11px] font-medium text-zinc-300">
                    Next: {bill.nextEstimatedDueDate}
                  </span>
                  <span className="text-[10px] text-zinc-500 capitalize">
                    {bill.recurrenceRule.frequency.replace('_', ' ')}
                    {bill.isDueDateEstimated ? ' (est.)' : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => startBillPaymentWorkflow(bill)}
                    className="py-1 px-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <ArrowSquareOut size={12} />
                    <span>Prepare Payment</span>
                  </button>
                  <button
                    onClick={() => markBillPaid(bill.id)}
                    title="Mark paid and advance to next recurrence cycle"
                    className="py-1 px-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                  >
                    <Check size={11} weight="bold" />
                    <span>Mark Paid</span>
                  </button>
                </div>

                <button
                  onClick={() => deleteBill(bill.id)}
                  title="Delete bill"
                  className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                >
                  <Trash size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Bill Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-semibold text-zinc-100">Add Recurring Bill</span>
              <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-zinc-300">
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Provider Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CESC, Airtel, Jio"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BillCategory)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                >
                  <option value="electricity">Electricity</option>
                  <option value="internet">Internet / Broadband</option>
                  <option value="mobile">Mobile / Cell</option>
                  <option value="water">Water</option>
                  <option value="gas">Gas</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="insurance">Insurance</option>
                  <option value="rent">Rent</option>
                  <option value="subscription">Subscription</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Amount (₹)</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 1450"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Next Due Date</label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">Recurrence</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                >
                  <option value="monthly">Monthly</option>
                  <option value="bi_monthly">Every 2 Months</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
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
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                >
                  Save Bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
