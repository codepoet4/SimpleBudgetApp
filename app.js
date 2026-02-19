/* =========================================================
   SimpleBudget - App Logic
   ========================================================= */

'use strict';

// ─── Data Model ───────────────────────────────────────────
const STORAGE_KEY = 'simpleBudgetData';
const CURRENT_YEAR = () => new Date().getFullYear();
const CURRENT_MONTH_KEY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function emptyData() {
  return {
    version: 1,
    settings: {
      annualBudget: 0
    },
    currentMonth: CURRENT_MONTH_KEY(),
    transactions: [],      // current month
    history: {}            // { "YYYY-MM": { goal, transactions[] } }
  };
}

// ─── State ────────────────────────────────────────────────
let data = emptyData();
let isIncomeMode = false;
let toastTimer = null;
let editingTxId = null;   // id of transaction being edited
let editIsIncome = false;

// ─── Persistence ──────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = Object.assign(emptyData(), parsed);
      if (!data.settings) data.settings = emptyData().settings;
      if (!data.history) data.history = {};
      if (!Array.isArray(data.transactions)) data.transactions = [];
    }
  } catch (e) {
    console.warn('Failed to load data:', e);
    data = emptyData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save data:', e);
    showToast('Storage error – data may not be saved');
  }
}

// ─── Monthly Reset ────────────────────────────────────────
function checkMonthlyReset() {
  const currentKey = CURRENT_MONTH_KEY();
  if (data.currentMonth === currentKey) return;

  // Archive the old month with the goal that was in effect at the time
  archiveMonth(data.currentMonth, data.transactions, calcDynamicMonthlyGoal());

  // Move to new month
  data.currentMonth = currentKey;
  data.transactions = [];

  pruneOldHistory();
  saveData();

  const newGoal = calcDynamicMonthlyGoal();
  showToast(`New month – budget reset to $${fmtCurrency(newGoal)}`);
}

function archiveMonth(monthKey, transactions, goal) {
  if (!monthKey) return;
  data.history[monthKey] = {
    goal: goal || 0,
    transactions: transactions || []
  };
}

function pruneOldHistory() {
  const thisYear = CURRENT_YEAR();
  const lastYear = thisYear - 1;
  Object.keys(data.history).forEach(key => {
    if (parseInt(key.split('-')[0], 10) < lastYear) {
      delete data.history[key];
    }
  });
}

// ─── Calculations ─────────────────────────────────────────

/** Months remaining in year INCLUDING current month (Jan=12, Dec=1). */
function calcMonthsRemainingInYear() {
  return 12 - new Date().getMonth(); // getMonth() 0-indexed
}

/** Net spending for the current calendar year (expenses minus income).
 *  Includes all history months in this year plus the current month. */
function calcYearToDateNet() {
  const thisYearStr = CURRENT_YEAR().toString();
  let spent = 0;
  let income = 0;

  // Past months in current year
  Object.keys(data.history).forEach(key => {
    if (key.startsWith(thisYearStr)) {
      (data.history[key].transactions || []).forEach(tx => {
        if (tx.amount < 0) spent += Math.abs(tx.amount);
        else income += tx.amount;
      });
    }
  });

  // Current month
  data.transactions.forEach(tx => {
    if (tx.amount < 0) spent += Math.abs(tx.amount);
    else income += tx.amount;
  });

  return spent - income; // positive = net spent more than earned
}

/** How much of the annual budget is still unspent. */
function calcRemainingAnnual() {
  const annual = data.settings.annualBudget || 0;
  return annual - calcYearToDateNet();
}

/** Monthly budget = remaining annual ÷ months remaining in year. */
function calcDynamicMonthlyGoal() {
  const monthsLeft = calcMonthsRemainingInYear();
  if (monthsLeft <= 0) return 0;
  return calcRemainingAnnual() / monthsLeft;
}

/** This month: how much is left of the dynamic monthly goal. */
function calcMonthlyRemaining() {
  const monthSpent = data.transactions
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthIncome = data.transactions
    .filter(t => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
  return calcDynamicMonthlyGoal() - monthSpent + monthIncome;
}

function calcMonthSpent() {
  return data.transactions
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);
}

function calcMonthIncome() {
  return data.transactions
    .filter(t => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0);
}

// ─── Rendering ────────────────────────────────────────────
function fmtCurrency(n) {
  if (isNaN(n)) return '0.00';
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function renderBudgetHero() {
  const remaining = calcMonthlyRemaining();
  const monthlyGoal = calcDynamicMonthlyGoal();
  const remainingAnnual = calcRemainingAnnual();
  const spent = calcMonthSpent();
  const income = calcMonthIncome();

  const amountEl = document.getElementById('remainingAmount');
  const fillEl = document.getElementById('progressFill');
  const metaEl = document.getElementById('budgetMeta');

  // Large amount display
  const sign = remaining < 0 ? '-' : '';
  amountEl.textContent = `${sign}$${fmtCurrency(Math.abs(remaining))}`;
  amountEl.classList.toggle('over-budget', remaining < 0);

  // Progress bar (% of monthly goal spent)
  const netMonthSpend = Math.max(0, spent - income);
  let pct = monthlyGoal > 0 ? Math.min(netMonthSpend / monthlyGoal * 100, 100) : 0;
  fillEl.style.width = `${pct}%`;
  fillEl.classList.remove('warning', 'danger');
  if (pct >= 90) fillEl.classList.add('danger');
  else if (pct >= 70) fillEl.classList.add('warning');

  // Meta: remaining for year
  const annualSign = remainingAnnual < 0 ? '-' : '';
  metaEl.textContent = `Remaining for year: ${annualSign}$${fmtCurrency(Math.abs(remainingAnnual))}`;
}

function renderTransactionsList() {
  const list = document.getElementById('transactionsList');
  const count = document.getElementById('transactionCount');

  if (data.transactions.length === 0) {
    list.innerHTML = '<div class="empty-state">No transactions yet this month</div>';
    count.textContent = '';
    return;
  }

  count.textContent = `${data.transactions.length} transaction${data.transactions.length !== 1 ? 's' : ''}`;

  list.innerHTML = data.transactions.map(tx => {
    const isExpense = tx.amount < 0;
    const typeClass = isExpense ? 'expense' : 'income';
    const icon = isExpense ? '&#128176;' : '&#128200;';
    const amtStr = isExpense
      ? `-$${fmtCurrency(Math.abs(tx.amount))}`
      : `+$${fmtCurrency(tx.amount)}`;

    return `
      <div class="transaction-item" onclick="openEditTx('${tx.id}')">
        <div class="transaction-icon ${typeClass}">${icon}</div>
        <div class="transaction-info">
          <div class="transaction-desc">${escapeHtml(tx.description)}</div>
          <div class="transaction-date">${fmtDate(tx.date)}${tx.time ? ' at ' + tx.time : ''}</div>
        </div>
        <div class="transaction-amount ${typeClass}">${amtStr}</div>
        <button class="transaction-delete" onclick="event.stopPropagation(); confirmDeleteTx('${tx.id}')" aria-label="Delete">&#215;</button>
      </div>
    `;
  }).join('');
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const keys = Object.keys(data.history).sort().reverse();

  if (keys.length === 0) {
    list.innerHTML = '<div class="empty-state">No history yet.<br>Complete a full month to see history here.</div>';
    return;
  }

  list.innerHTML = keys.map(key => {
    const month = data.history[key];
    const txs = month.transactions || [];
    const goal = month.goal || 0;
    const spent = txs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const income = txs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const net = spent - income;
    const underBudget = net <= goal;

    return `
      <div class="history-month-card">
        <div class="history-month-header" onclick="toggleHistoryMonth('${key}', this)">
          <span class="history-month-name">${fmtMonthLabel(key)}</span>
          <div class="history-month-summary">
            <div class="history-month-spent ${underBudget ? 'under' : ''}">
              ${underBudget ? '' : 'Over '}$${fmtCurrency(net)}
            </div>
            <div class="history-month-goal">Goal: $${fmtCurrency(goal)}</div>
          </div>
          <span class="history-month-chevron">&#8250;</span>
        </div>
        <div class="history-transactions" id="hist-${key}">
          ${txs.length === 0
            ? '<div class="empty-state">No transactions</div>'
            : txs.map(tx => {
                const isExpense = tx.amount < 0;
                const typeClass = isExpense ? 'expense' : 'income';
                const amtStr = isExpense
                  ? `-$${fmtCurrency(Math.abs(tx.amount))}`
                  : `+$${fmtCurrency(tx.amount)}`;
                return `
                  <div class="transaction-item" style="cursor:default">
                    <div class="transaction-icon ${typeClass}">${isExpense ? '&#128176;' : '&#128200;'}</div>
                    <div class="transaction-info">
                      <div class="transaction-desc">${escapeHtml(tx.description)}</div>
                      <div class="transaction-date">${fmtDate(tx.date)}</div>
                    </div>
                    <div class="transaction-amount ${typeClass}">${amtStr}</div>
                  </div>
                `;
              }).join('')
          }
        </div>
      </div>
    `;
  }).join('');
}

function toggleHistoryMonth(key, headerEl) {
  const txsEl = document.getElementById(`hist-${key}`);
  const isOpen = txsEl.classList.contains('open');
  txsEl.classList.toggle('open', !isOpen);
  headerEl.classList.toggle('open', !isOpen);
}

function renderSettings() {
  document.getElementById('annualBudget').value = data.settings.annualBudget || '';
  updateSettingsMonthlyDisplay();
}

function updateSettingsMonthlyDisplay() {
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  const hint = document.getElementById('suggestedMonthly');
  const computed = document.getElementById('computedMonthly');

  // Show the live calculated monthly budget
  const monthlyGoal = calcDynamicMonthlyGoal();
  if (data.settings.annualBudget > 0) {
    computed.textContent = `$${fmtCurrency(monthlyGoal)}`;
    const monthsLeft = calcMonthsRemainingInYear();
    hint.textContent = `Remaining annual ÷ ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} remaining`;
  } else if (annual > 0) {
    // Annual entered but not yet saved
    const tempMonthly = annual / calcMonthsRemainingInYear();
    computed.textContent = `$${fmtCurrency(tempMonthly)}`;
    const monthsLeft = calcMonthsRemainingInYear();
    hint.textContent = `Annual ÷ ${monthsLeft} month${monthsLeft !== 1 ? 's' : ''} remaining`;
  } else {
    computed.textContent = '—';
    hint.textContent = 'Set an annual budget to calculate';
  }
}

function renderHeaderMonth() {
  const d = new Date();
  document.getElementById('headerMonth').textContent =
    d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Transaction Management ───────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function addTransaction() {
  const amountEl = document.getElementById('amountInput');
  const descEl = document.getElementById('descriptionInput');
  const raw = parseFloat(amountEl.value);

  if (isNaN(raw) || raw <= 0) {
    amountEl.focus();
    showToast('Please enter a valid amount');
    return;
  }

  const amount = parseFloat(raw.toFixed(2));
  const description = descEl.value.trim() || (isIncomeMode ? 'Income' : 'Expense');
  const now = new Date();

  const tx = {
    id: generateId(),
    date: now.toISOString().split('T')[0],
    time: now.toTimeString().slice(0, 5),
    amount: isIncomeMode ? amount : -amount,
    description
  };

  data.transactions.unshift(tx);
  saveData();

  amountEl.value = '';
  descEl.value = '';
  amountEl.focus();

  renderBudgetHero();
  renderTransactionsList();
  showToast(isIncomeMode ? `+$${fmtCurrency(amount)} added` : `-$${fmtCurrency(amount)} recorded`);
}

function deleteTransaction(id) {
  data.transactions = data.transactions.filter(t => t.id !== id);
  saveData();
  renderBudgetHero();
  renderTransactionsList();
  showToast('Transaction removed');
}

function toggleTransactionType() {
  isIncomeMode = !isIncomeMode;
  const btn = document.getElementById('toggleIncomeBtn');
  const addBtn = document.getElementById('addBtn');
  const title = document.querySelector('.add-transaction-title');

  if (isIncomeMode) {
    btn.textContent = 'Switch to Expense';
    btn.classList.add('income-mode');
    addBtn.textContent = 'Add Income';
    addBtn.classList.add('income-mode');
    title.textContent = 'Add Income';
  } else {
    btn.textContent = 'Switch to Income';
    btn.classList.remove('income-mode');
    addBtn.textContent = 'Add Expense';
    addBtn.classList.remove('income-mode');
    title.textContent = 'Add Expense';
  }
}

function setQuickAmount(n) {
  document.getElementById('amountInput').value = n;
  document.getElementById('amountInput').focus();
}

// ─── Edit Transaction ─────────────────────────────────────
function openEditTx(id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;

  editingTxId = id;
  editIsIncome = tx.amount > 0;

  // Populate fields
  document.getElementById('editAmount').value = Math.abs(tx.amount);
  document.getElementById('editDescription').value = tx.description;
  document.getElementById('editDate').value = tx.date;

  // Set type toggle
  setEditType(editIsIncome ? 'income' : 'expense');

  // Open sheet
  document.getElementById('editOverlay').classList.add('open');

  // Focus amount after animation
  setTimeout(() => document.getElementById('editAmount').select(), 100);
}

function setEditType(type) {
  editIsIncome = (type === 'income');

  const expBtn = document.getElementById('editTypeExpense');
  const incBtn = document.getElementById('editTypeIncome');
  const saveBtn = document.getElementById('editSaveBtn');

  expBtn.classList.remove('active', 'expense-active', 'income-active');
  incBtn.classList.remove('active', 'expense-active', 'income-active');

  if (editIsIncome) {
    incBtn.classList.add('active', 'income-active');
    saveBtn.style.background = 'var(--success)';
  } else {
    expBtn.classList.add('active', 'expense-active');
    saveBtn.style.background = '';
  }
}

function saveEditTx() {
  if (!editingTxId) return;

  const raw = parseFloat(document.getElementById('editAmount').value);
  if (isNaN(raw) || raw <= 0) {
    showToast('Please enter a valid amount');
    return;
  }

  const amount = parseFloat(raw.toFixed(2));
  const description = document.getElementById('editDescription').value.trim() || (editIsIncome ? 'Income' : 'Expense');
  const newDate = document.getElementById('editDate').value;

  const tx = data.transactions.find(t => t.id === editingTxId);
  if (!tx) return;

  // Determine if the transaction needs to move to a different month
  const newMonthKey = newDate ? newDate.slice(0, 7) : data.currentMonth;
  const movingToHistory = newMonthKey !== data.currentMonth;

  if (movingToHistory) {
    // Remove from current month
    data.transactions = data.transactions.filter(t => t.id !== editingTxId);

    // Ensure history bucket exists for that month
    if (!data.history[newMonthKey]) {
      data.history[newMonthKey] = { goal: 0, transactions: [] };
    }

    // Add updated transaction to the history bucket, sorted by date descending
    const updatedTx = {
      id: tx.id,
      date: newDate,
      time: tx.time || '',
      amount: editIsIncome ? amount : -amount,
      description
    };
    data.history[newMonthKey].transactions.unshift(updatedTx);
    data.history[newMonthKey].transactions.sort((a, b) => b.date.localeCompare(a.date));

    saveData();
    closeEditModal();
    renderBudgetHero();
    renderTransactionsList();
    showToast('Transaction moved to ' + fmtMonthLabel(newMonthKey));
  } else {
    // Same month — update in place
    tx.amount = editIsIncome ? amount : -amount;
    tx.description = description;
    if (newDate) tx.date = newDate;

    saveData();
    closeEditModal();
    renderBudgetHero();
    renderTransactionsList();
    showToast('Transaction updated');
  }
}

function deleteEditTx() {
  if (!editingTxId) return;
  const id = editingTxId;
  closeEditModal();
  // Small delay so sheet animates out before confirm dialog appears
  setTimeout(() => confirmDeleteTx(id), 320);
}

function closeEditModal() {
  document.getElementById('editOverlay').classList.remove('open');
  editingTxId = null;
}

// ─── Settings Actions ─────────────────────────────────────
function onAnnualBudgetChange() {
  updateSettingsMonthlyDisplay();
}

function saveSettings() {
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  data.settings.annualBudget = annual;
  saveData();
  renderBudgetHero();
  updateSettingsMonthlyDisplay();
  showToast('Settings saved');
}

// ─── Export / Import ──────────────────────────────────────
function exportData() {
  const exportObj = {
    version: data.version || 1,
    exportedAt: new Date().toISOString(),
    settings: data.settings,
    currentMonth: data.currentMonth,
    transactions: data.transactions,
    history: data.history
  };

  const json = JSON.stringify(exportObj, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SimpleBudget-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  showToast('Data exported');
}

function triggerImport() {
  document.getElementById('importFile').click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.settings || imported.transactions === undefined) {
        showToast('Invalid file format');
        return;
      }

      showConfirmModal(
        'Import Data',
        'This will replace all current data with the imported file. This cannot be undone.',
        () => {
          data = Object.assign(emptyData(), imported);
          if (!data.history) data.history = {};
          if (!Array.isArray(data.transactions)) data.transactions = [];
          pruneOldHistory();
          saveData();
          renderAll();
          showToast('Data imported successfully');
        },
        true
      );
    } catch (err) {
      showToast('Failed to read file');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ─── Clear Data ───────────────────────────────────────────
function confirmClearData() {
  showConfirmModal(
    'Clear All Data',
    'Are you sure? All transactions, history, and settings will be permanently deleted.',
    () => {
      data = emptyData();
      saveData();
      renderAll();
      showToast('All data cleared');
    }
  );
}

// ─── Delete Transaction (from list, not edit sheet) ───────
function confirmDeleteTx(id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;

  showConfirmModal(
    'Delete Transaction',
    `Remove "${escapeHtml(tx.description)}" ($${fmtCurrency(Math.abs(tx.amount))})?`,
    () => deleteTransaction(id)
  );
}

// ─── Tab Navigation ───────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.add('active');
  document.getElementById(`btn-${name}`).classList.add('active');
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
  document.querySelector('.tab-content').scrollTop = 0;
}

// ─── Refresh ──────────────────────────────────────────────
function refreshApp() {
  window.location.reload();
}

// ─── Render All ───────────────────────────────────────────
function renderAll() {
  renderHeaderMonth();
  renderBudgetHero();
  renderTransactionsList();
  const activeTab = document.querySelector('.tab-panel.active');
  if (activeTab) {
    const name = activeTab.id.replace('tab-', '');
    if (name === 'history') renderHistory();
    if (name === 'settings') renderSettings();
  }
}

// ─── Confirm Modal ────────────────────────────────────────
let modalCallback = null;

function showConfirmModal(title, message, onConfirm, isSafe = false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;

  const confirmBtn = document.getElementById('modalConfirmBtn');
  confirmBtn.textContent = isSafe ? 'Import'
    : (title.startsWith('Delete') || title.startsWith('Clear') ? 'Delete' : 'Confirm');
  confirmBtn.className = 'modal-btn confirm' + (isSafe ? ' safe' : '');

  modalCallback = onConfirm;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCallback = null;
}

document.getElementById('modalConfirmBtn').addEventListener('click', () => {
  if (typeof modalCallback === 'function') modalCallback();
  closeModal();
});

// ─── Toast ────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ─── Utilities ────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Keyboard Support ─────────────────────────────────────
document.getElementById('amountInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('descriptionInput').focus(); }
});

document.getElementById('descriptionInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTransaction(); }
});

document.getElementById('editAmount').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('editDescription').focus(); }
});

document.getElementById('editDescription').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveEditTx(); }
});

document.getElementById('appTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') window.location.reload();
});

// Close edit sheet on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEditModal();
    closeModal();
  }
});

// ─── Service Worker Registration ─────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ─── Init ─────────────────────────────────────────────────
(function init() {
  loadData();
  checkMonthlyReset();
  renderAll();

  setTimeout(() => {
    if (window.innerWidth > 768) {
      document.getElementById('amountInput').focus();
    }
  }, 300);
})();
