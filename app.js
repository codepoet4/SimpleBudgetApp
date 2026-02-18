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
      annualBudget: 0,
      monthlyGoal: 0,
      customMonthlyGoal: false
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

// ─── Persistence ──────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      data = Object.assign(emptyData(), parsed);
      // Ensure nested objects exist
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

  // Archive the old month
  archiveMonth(data.currentMonth, data.transactions, data.settings.monthlyGoal);

  // Move to new month
  data.currentMonth = currentKey;
  data.transactions = [];

  // Update monthly goal from annual if not customized
  if (!data.settings.customMonthlyGoal && data.settings.annualBudget > 0) {
    data.settings.monthlyGoal = parseFloat((data.settings.annualBudget / 12).toFixed(2));
  }

  pruneOldHistory();
  saveData();
  showToast(`New month started – budget reset to $${fmtCurrency(data.settings.monthlyGoal)}`);
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
  const keys = Object.keys(data.history);
  keys.forEach(key => {
    const year = parseInt(key.split('-')[0], 10);
    if (year < lastYear) {
      delete data.history[key];
    }
  });
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

  // Reset inputs
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

// ─── Calculations ─────────────────────────────────────────
function calcSpent() {
  return data.transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

function calcIncome() {
  return data.transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);
}

function calcRemaining() {
  const goal = data.settings.monthlyGoal || 0;
  const net = data.transactions.reduce((sum, t) => sum + t.amount, 0);
  return goal - Math.abs(data.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0) - calcIncome());
}

function calcRemainingSimple() {
  const goal = data.settings.monthlyGoal || 0;
  const spent = calcSpent();
  const income = calcIncome();
  return goal - spent + income;
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
  const remaining = calcRemainingSimple();
  const goal = data.settings.monthlyGoal || 0;
  const spent = calcSpent();
  const income = calcIncome();

  const amountEl = document.getElementById('remainingAmount');
  const fillEl = document.getElementById('progressFill');
  const metaEl = document.getElementById('budgetMeta');

  // Amount display
  const sign = remaining < 0 ? '-' : '';
  amountEl.textContent = `${sign}$${fmtCurrency(Math.abs(remaining))}`;

  if (remaining < 0) {
    amountEl.classList.add('over-budget');
  } else {
    amountEl.classList.remove('over-budget');
  }

  // Progress bar
  let pct = goal > 0 ? Math.min((spent - income) / goal * 100, 100) : 0;
  if (pct < 0) pct = 0;
  fillEl.style.width = `${pct}%`;
  fillEl.classList.remove('warning', 'danger');
  if (pct >= 90) {
    fillEl.classList.add('danger');
  } else if (pct >= 70) {
    fillEl.classList.add('warning');
  }

  // Meta text
  let meta = `Goal: $${fmtCurrency(goal)}`;
  if (spent > 0) meta += `  •  Spent: $${fmtCurrency(spent)}`;
  if (income > 0) meta += `  •  Income: $${fmtCurrency(income)}`;
  metaEl.textContent = meta;
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
      <div class="transaction-item">
        <div class="transaction-icon ${typeClass}">${icon}</div>
        <div class="transaction-info">
          <div class="transaction-desc">${escapeHtml(tx.description)}</div>
          <div class="transaction-date">${fmtDate(tx.date)}${tx.time ? ' at ' + tx.time : ''}</div>
        </div>
        <div class="transaction-amount ${typeClass}">${amtStr}</div>
        <button class="transaction-delete" onclick="confirmDeleteTx('${tx.id}')" aria-label="Delete">&#215;</button>
      </div>
    `;
  }).join('');
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const keys = Object.keys(data.history).sort().reverse();

  // Also include a snapshot of current month for reference (optional - skip if same as shown in Budget tab)
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
              ${underBudget ? '' : 'Over '} $${fmtCurrency(net)}
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
                  <div class="transaction-item">
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
  document.getElementById('monthlyGoal').value = data.settings.monthlyGoal || '';
  updateSuggestedHint();
}

function updateSuggestedHint() {
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  const hint = document.getElementById('suggestedMonthly');
  if (annual > 0) {
    const suggested = (annual / 12).toFixed(2);
    hint.textContent = `Suggested monthly: $${parseFloat(suggested).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  } else {
    hint.textContent = '';
  }
}

function renderHeaderMonth() {
  const d = new Date();
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  document.getElementById('headerMonth').textContent = label;
}

// ─── Settings Actions ─────────────────────────────────────
function onAnnualBudgetChange() {
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  updateSuggestedHint();
  // Auto-fill monthly if not custom
  if (annual > 0 && !data.settings.customMonthlyGoal) {
    document.getElementById('monthlyGoal').value = (annual / 12).toFixed(2);
  }
}

function onMonthlyGoalInput() {
  // Mark as custom if user edits directly
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  const monthly = parseFloat(document.getElementById('monthlyGoal').value) || 0;
  const auto = annual > 0 ? parseFloat((annual / 12).toFixed(2)) : 0;
  data.settings.customMonthlyGoal = (monthly !== auto);
}

function saveSettings() {
  const annual = parseFloat(document.getElementById('annualBudget').value) || 0;
  const monthly = parseFloat(document.getElementById('monthlyGoal').value) || 0;

  data.settings.annualBudget = annual;
  data.settings.monthlyGoal = monthly;

  const auto = annual > 0 ? parseFloat((annual / 12).toFixed(2)) : 0;
  data.settings.customMonthlyGoal = (monthly !== auto && monthly > 0);

  saveData();
  renderBudgetHero();
  showToast('Settings saved');
}

// ─── Export / Import ──────────────────────────────────────
function exportData() {
  // Include current month in export
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
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `SimpleBudget-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
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

      // Validate structure
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
  // Reset so same file can be re-imported
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

// ─── Delete Transaction ───────────────────────────────────
function confirmDeleteTx(id) {
  const tx = data.transactions.find(t => t.id === id);
  if (!tx) return;
  const amt = Math.abs(tx.amount);

  showConfirmModal(
    'Delete Transaction',
    `Remove "${escapeHtml(tx.description)}" ($${fmtCurrency(amt)})?`,
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

  // Scroll to top
  document.querySelector('.tab-content').scrollTop = 0;
}

// ─── Refresh ──────────────────────────────────────────────
function refreshApp() {
  checkMonthlyReset();
  renderAll();
  showToast('Refreshed');

  // Brief visual feedback on title
  const title = document.getElementById('appTitle');
  title.style.opacity = '0.5';
  setTimeout(() => { title.style.opacity = ''; }, 200);
}

// ─── Render All ───────────────────────────────────────────
function renderAll() {
  renderHeaderMonth();
  renderBudgetHero();
  renderTransactionsList();
  // Only render active panels to avoid unnecessary work
  const activeTab = document.querySelector('.tab-panel.active');
  if (activeTab) {
    const name = activeTab.id.replace('tab-', '');
    if (name === 'history') renderHistory();
    if (name === 'settings') renderSettings();
  }
}

// ─── Modal ────────────────────────────────────────────────
let modalCallback = null;

function showConfirmModal(title, message, onConfirm, isSafe = false) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalMessage').textContent = message;

  const confirmBtn = document.getElementById('modalConfirmBtn');
  confirmBtn.textContent = isSafe ? 'Import' : (title.startsWith('Delete') || title.startsWith('Clear') ? 'Delete' : 'Confirm');
  confirmBtn.className = 'modal-btn confirm' + (isSafe ? ' safe' : '');

  modalCallback = onConfirm;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCallback = null;
}

document.getElementById('modalConfirmBtn').addEventListener('click', () => {
  if (typeof modalCallback === 'function') {
    modalCallback();
  }
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

// ─── Keyboard Support ────────────────────────────────────
document.getElementById('amountInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('descriptionInput').focus();
  }
});

document.getElementById('descriptionInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTransaction();
  }
});

document.getElementById('appTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') refreshApp();
});

// ─── Service Worker Registration ─────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  });
}

// ─── Init ─────────────────────────────────────────────────
(function init() {
  loadData();
  checkMonthlyReset();
  renderAll();

  // Focus amount input after a short delay (avoid iOS keyboard jump)
  setTimeout(() => {
    const amtInput = document.getElementById('amountInput');
    // Only auto-focus if not on mobile (to avoid the keyboard popping up immediately)
    if (window.innerWidth > 768) {
      amtInput.focus();
    }
  }, 300);
})();
