import React from 'react';
import { 
  WarningCircle, 
  CheckCircle, 
  ArrowSquareOut, 
  Clock, 
  Receipt, 
  Package, 
  Check, 
  Sparkle
} from '@phosphor-icons/react';
import { useDIFMStore } from '../store/use-difm-store';
import { SavedBillRecord, SavedPurchaseRecord } from '../../core/records/types';

export const AttentionView: React.FC = () => {
  const { 
    attentionItems, 
    startBillPaymentWorkflow, 
    startReturnWorkflow, 
    markBillPaid, 
    markPurchaseStatus,
    setActiveView,
    bills,
    purchases
  } = useDIFMStore();

  return (
    <div className="h-full w-full flex flex-col bg-zinc-950 p-3.5 gap-3.5 overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-col gap-1 border-b border-zinc-800/80 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
            <Sparkle size={15} weight="fill" className="text-emerald-400" />
            <span>Action Center</span>
          </h2>
          <span className="text-[11px] font-medium text-zinc-400">
            {attentionItems.length} item{attentionItems.length === 1 ? '' : 's'} require attention
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Upcoming deadlines and actions ready to prepare.
        </p>
      </div>

      {/* Attention Items List */}
      {attentionItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl my-auto">
          <div className="h-10 w-10 rounded-full bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
            <CheckCircle size={22} weight="fill" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-zinc-200">All caught up!</h3>
            <p className="text-[11px] text-zinc-400 max-w-[240px]">
              No upcoming bills or expiring return windows need your immediate attention.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setActiveView('bills')}
              className="text-xs px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 font-medium transition-colors"
            >
              View {bills.length} Bills
            </button>
            <button
              onClick={() => setActiveView('purchases')}
              className="text-xs px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md text-zinc-300 font-medium transition-colors"
            >
              View {purchases.length} Purchases
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {attentionItems.map((item) => {
            const isBill = item.type === 'bill';
            const isOverdue = item.urgency === 'overdue';
            const isUrgent = item.urgency === 'urgent';

            return (
              <div
                key={item.id}
                className={`p-3 rounded-xl border flex flex-col gap-2.5 transition-all shadow-sm ${
                  isOverdue
                    ? 'bg-rose-950/20 border-rose-800/50'
                    : isUrgent
                    ? 'bg-amber-950/20 border-amber-800/40'
                    : 'bg-zinc-900/60 border-zinc-800'
                }`}
              >
                {/* Item Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
                        isBill
                          ? 'bg-emerald-950/50 border-emerald-800/50 text-emerald-400'
                          : 'bg-blue-950/50 border-blue-800/50 text-blue-400'
                      }`}
                    >
                      {isBill ? <Receipt size={16} /> : <Package size={16} />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {item.title}
                      </span>
                      <span
                        className={`text-[11px] font-medium flex items-center gap-1 ${
                          isOverdue
                            ? 'text-rose-400'
                            : isUrgent
                            ? 'text-amber-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        <Clock size={12} />
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  {item.isEstimated && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/60 border border-amber-800/50 text-amber-300 rounded font-medium shrink-0">
                      Estimated date
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/50">
                  {isBill ? (
                    <>
                      <button
                        onClick={() => startBillPaymentWorkflow(item.item as SavedBillRecord)}
                        className="flex-1 py-1.5 px-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      >
                        <ArrowSquareOut size={13} weight="bold" />
                        <span>Prepare Payment</span>
                      </button>
                      <button
                        onClick={() => markBillPaid(item.item.id)}
                        title="Mark bill paid for this cycle and calculate next due date"
                        className="py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Check size={12} weight="bold" />
                        <span>Paid</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startReturnWorkflow(item.item as SavedPurchaseRecord)}
                        className="flex-1 py-1.5 px-2 bg-blue-500 hover:bg-blue-400 text-zinc-950 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      >
                        <ArrowSquareOut size={13} weight="bold" />
                        <span>Start Return</span>
                      </button>
                      <button
                        onClick={() => markPurchaseStatus(item.item.id, 'kept')}
                        title="Mark item kept and dismiss return reminders"
                        className="py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Check size={12} weight="bold" />
                        <span>Keep</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Summary Section */}
      <div className="mt-auto pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveView('bills')}
            className="hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            <span className="font-semibold text-zinc-200">{bills.length}</span>
            <span>Recurring Bills</span>
          </button>
          <span>&bull;</span>
          <button 
            onClick={() => setActiveView('purchases')}
            className="hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            <span className="font-semibold text-zinc-200">{purchases.length}</span>
            <span>Tracked Purchases</span>
          </button>
        </div>
      </div>
    </div>
  );
};
