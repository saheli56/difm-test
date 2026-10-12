import { BillCandidateData, PurchaseCandidateData, SaveCandidate } from '../core/records/types';
import { SaveCoordinator } from '../core/detectors/save-coordinator';
import { RecordStorage } from '../core/records/storage';

export class SavePromptUI {
  private static hostElement: HTMLElement | null = null;
  private static shadowRoot: ShadowRoot | null = null;

  public static showPrompt(candidate: SaveCandidate) {
    // If prompt already visible, do not stack
    if (this.hostElement) {
      this.closePrompt();
    }

    this.hostElement = document.createElement('div');
    this.hostElement.id = 'difm-save-prompt-host';
    this.hostElement.style.position = 'fixed';
    this.hostElement.style.top = '16px';
    this.hostElement.style.right = '16px';
    this.hostElement.style.zIndex = '2147483647';
    this.hostElement.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
    document.body.appendChild(this.hostElement);

    this.renderPrompt(candidate);
  }

  public static closePrompt() {
    if (this.hostElement) {
      this.hostElement.remove();
      this.hostElement = null;
      this.shadowRoot = null;
    }
  }

  private static renderPrompt(candidate: SaveCandidate) {
    if (!this.shadowRoot) return;

    const isBill = candidate.eventType === 'bill_payment';
    const billData = isBill ? (candidate.extractedData as BillCandidateData) : null;
    const purchaseData = !isBill ? (candidate.extractedData as PurchaseCandidateData) : null;

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .difm-card {
        width: 340px;
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid #27272a;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-size: 13px;
        animation: difm-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes difm-slide-in {
        from { transform: translateY(-12px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .badge-bill { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
      .badge-purchase { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
      .badge-est { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
      .badge-conf { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .title {
        font-weight: 600;
        font-size: 13px;
        color: #fafafa;
        line-height: 1.3;
      }
      .details-grid {
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 12px;
      }
      .detail-label { color: #a1a1aa; }
      .detail-value { font-weight: 500; color: #f4f4f5; text-align: right; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .button-row {
        display: flex;
        gap: 8px;
      }
      .btn {
        flex: 1;
        padding: 7px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: background 0.15s, opacity 0.15s;
        text-align: center;
      }
      .btn-primary { background: #fafafa; color: #09090b; }
      .btn-primary:hover { background: #ffffff; }
      .btn-secondary { background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46; }
      .btn-secondary:hover { background: #3f3f46; }
      .btn-link {
        background: transparent;
        color: #71717a;
        font-size: 11px;
        padding: 4px;
        border: none;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 2px;
        align-self: center;
      }
      .btn-link:hover { color: #a1a1aa; }
      .edit-drawer {
        display: none;
        flex-direction: column;
        gap: 8px;
        background: #121214;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 10px;
      }
      .edit-row {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .edit-label { font-size: 10px; color: #a1a1aa; text-transform: uppercase; font-weight: 600; }
      .edit-input {
        background: #18181b;
        border: 1px solid #3f3f46;
        border-radius: 4px;
        padding: 5px 8px;
        color: #fafafa;
        font-size: 12px;
        outline: none;
      }
      .edit-input:focus { border-color: #71717a; }
    `;

    const container = document.createElement('div');
    container.className = 'difm-card';

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="badge ${isBill ? 'badge-bill' : 'badge-purchase'}">
          ${isBill ? 'Bill Reminder' : 'Purchase Track'}
        </span>
        <span class="badge ${
          isBill
            ? billData?.isDueDateEstimated
              ? 'badge-est'
              : 'badge-conf'
            : purchaseData?.isReturnDeadlineEstimated
            ? 'badge-est'
            : 'badge-conf'
        }">
          ${
            isBill
              ? billData?.isDueDateEstimated
                ? 'Estimated Cycle'
                : 'Confirmed'
              : purchaseData?.isReturnDeadlineEstimated
              ? 'Estimated Return'
              : 'Verified Policy'
          }
        </span>
      </div>
      <button id="btn-close" style="background: transparent; border: none; color: #71717a; cursor: pointer; font-size: 14px; line-height: 1;">✕</button>
    `;

    // Title
    const title = document.createElement('div');
    title.className = 'title';
    if (isBill) {
      title.textContent = `Looks like you paid your ${billData?.category !== 'other' ? billData?.category : 'utility'} bill.`;
    } else {
      title.textContent = 'Want me to keep track of this purchase?';
    }

    // Details Grid
    const detailsGrid = document.createElement('div');
    detailsGrid.className = 'details-grid';
    if (isBill && billData) {
      detailsGrid.innerHTML = `
        <div class="detail-row">
          <span class="detail-label">Provider</span>
          <span class="detail-value" id="val-provider">${billData.provider}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Amount</span>
          <span class="detail-value" id="val-amount">${billData.currency}${billData.amount}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Next Payment</span>
          <span class="detail-value" id="val-date">${billData.estimatedNextDueDate} ${billData.isDueDateEstimated ? '(est.)' : ''}</span>
        </div>
      `;
    } else if (purchaseData) {
      detailsGrid.innerHTML = `
        <div class="detail-row">
          <span class="detail-label">Product</span>
          <span class="detail-value" id="val-product">${purchaseData.productName}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Store</span>
          <span class="detail-value" id="val-store">${purchaseData.store}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Return Deadline</span>
          <span class="detail-value" id="val-return">${purchaseData.returnDeadline || 'Within 10 days'} ${purchaseData.isReturnDeadlineEstimated ? '(est.)' : ''}</span>
        </div>
      `;
    }

    // Editable Drawer
    const editDrawer = document.createElement('div');
    editDrawer.className = 'edit-drawer';
    editDrawer.id = 'edit-drawer';
    if (isBill && billData) {
      editDrawer.innerHTML = `
        <div class="edit-row">
          <span class="edit-label">Provider Name</span>
          <input type="text" class="edit-input" id="edit-provider" value="${billData.provider}" />
        </div>
        <div class="edit-row">
          <span class="edit-label">Amount (${billData.currency})</span>
          <input type="number" class="edit-input" id="edit-amount" value="${billData.amount}" />
        </div>
        <div class="edit-row">
          <span class="edit-label">Next Due Date (YYYY-MM-DD)</span>
          <input type="date" class="edit-input" id="edit-duedate" value="${billData.estimatedNextDueDate}" />
        </div>
        <div class="edit-row">
          <span class="edit-label">Frequency</span>
          <select class="edit-input" id="edit-freq">
            <option value="monthly" ${billData.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
            <option value="bi_monthly" ${billData.frequency === 'bi_monthly' ? 'selected' : ''}>Every 2 Months</option>
            <option value="quarterly" ${billData.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
            <option value="annual" ${billData.frequency === 'annual' ? 'selected' : ''}>Annual</option>
          </select>
        </div>
      `;
    } else if (purchaseData) {
      editDrawer.innerHTML = `
        <div class="edit-row">
          <span class="edit-label">Product Name</span>
          <input type="text" class="edit-input" id="edit-product" value="${purchaseData.productName}" />
        </div>
        <div class="edit-row">
          <span class="edit-label">Store</span>
          <input type="text" class="edit-input" id="edit-store" value="${purchaseData.store}" />
        </div>
        <div class="edit-row">
          <span class="edit-label">Return Deadline (YYYY-MM-DD)</span>
          <input type="date" class="edit-input" id="edit-returndate" value="${purchaseData.returnDeadline || ''}" />
        </div>
      `;
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = `
      <div class="button-row">
        <button class="btn btn-primary" id="btn-save">${isBill ? 'Save reminder' : 'Track this purchase'}</button>
        <button class="btn btn-secondary" id="btn-edit">Edit details</button>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px;">
        <button class="btn-link" id="btn-not-now">Not now</button>
        <button class="btn-link" id="btn-never">Never for this site</button>
      </div>
    `;

    container.appendChild(header);
    container.appendChild(title);
    container.appendChild(detailsGrid);
    container.appendChild(editDrawer);
    container.appendChild(actions);

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(container);

    // Event Listeners
    let isEditing = false;
    const btnEdit = this.shadowRoot.getElementById('btn-edit');
    btnEdit?.addEventListener('click', () => {
      isEditing = !isEditing;
      if (editDrawer) {
        editDrawer.style.display = isEditing ? 'flex' : 'none';
        btnEdit.textContent = isEditing ? 'Hide details' : 'Edit details';
      }
    });

    const btnClose = this.shadowRoot.getElementById('btn-close');
    btnClose?.addEventListener('click', () => this.closePrompt());

    const btnNotNow = this.shadowRoot.getElementById('btn-not-now');
    btnNotNow?.addEventListener('click', async () => {
      await RecordStorage.dismissCandidateKey(candidate.deduplicationKey);
      this.closePrompt();
    });

    const btnNever = this.shadowRoot.getElementById('btn-never');
    btnNever?.addEventListener('click', async () => {
      await RecordStorage.blacklistDomain(candidate.sourcePage.domain);
      this.closePrompt();
    });

    const btnSave = this.shadowRoot.getElementById('btn-save');
    btnSave?.addEventListener('click', async () => {
      if (isBill && billData) {
        const customProvider = (this.shadowRoot?.getElementById('edit-provider') as HTMLInputElement)?.value;
        const customAmount = parseFloat((this.shadowRoot?.getElementById('edit-amount') as HTMLInputElement)?.value);
        const customDate = (this.shadowRoot?.getElementById('edit-duedate') as HTMLInputElement)?.value;
        const customFreq = (this.shadowRoot?.getElementById('edit-freq') as HTMLSelectElement)?.value;

        await SaveCoordinator.convertAndSaveBillCandidate(
          candidate as SaveCandidate<BillCandidateData>,
          {
            provider: customProvider || billData.provider,
            amount: !isNaN(customAmount) ? customAmount : billData.amount,
            estimatedNextDueDate: customDate || billData.estimatedNextDueDate,
            isDueDateEstimated: false, // User confirmed/edited it!
            frequency: (customFreq as any) || billData.frequency,
            isFrequencyConfirmed: true
          }
        );
      } else if (purchaseData) {
        const customProduct = (this.shadowRoot?.getElementById('edit-product') as HTMLInputElement)?.value;
        const customStore = (this.shadowRoot?.getElementById('edit-store') as HTMLInputElement)?.value;
        const customReturnDate = (this.shadowRoot?.getElementById('edit-returndate') as HTMLInputElement)?.value;

        await SaveCoordinator.convertAndSavePurchaseCandidate(
          candidate as SaveCandidate<PurchaseCandidateData>,
          {
            productName: customProduct || purchaseData.productName,
            store: customStore || purchaseData.store,
            returnDeadline: customReturnDate || purchaseData.returnDeadline,
            isReturnDeadlineEstimated: false
          }
        );
      }

      this.closePrompt();
    });
  }
}
