// ── STATE ──────────────────────────────────────────────────────────
let transactions = JSON.parse(localStorage.getItem('spendsmart_txns') || '[]');
let budgets = JSON.parse(localStorage.getItem('spendsmart_budgets') || '{}');
let selectedType = 'expense';
let selectedCat = '';
let charts = {};

const CATEGORY_ICONS = {
  Food: '🍔', Travel: '🚌', Stationery: '✏️', Books: '📚',
  Subscriptions: '🎧', Shopping: '🛍️', Income: '💰', Miscellaneous: '🗂️'
};
const CHART_COLORS = [
  '#7c5cbf','#1D9E75','#D85A30','#378ADD','#BA7517','#D4537E','#639922','#888780'
];
const EXPENSE_CATS = ['Food','Travel','Stationery','Books','Subscriptions','Shopping','Miscellaneous'];

// ── PERSISTENCE ────────────────────────────────────────────────────
function save() {
  localStorage.setItem('spendsmart_txns', JSON.stringify(transactions));
  localStorage.setItem('spendsmart_budgets', JSON.stringify(budgets));
}

// ── HELPERS ────────────────────────────────────────────────────────
function fmt(n) { return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

function getStats() {
  const income  = transactions.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const now = new Date();
  const monthly = transactions.filter(t => {
    const d = new Date(t.date);
    return t.type === 'expense' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s,t) => s + t.amount, 0);
  return { income, expense, balance: income - expense, monthly };
}

function catClass(cat) { return 'cat-' + (cat||'miscellaneous').toLowerCase().replace(/\s+/g,''); }

function getFilteredTxns() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const cat    = document.getElementById('filterCategory').value;
  const type   = document.getElementById('filterType').value;
  const sort   = document.getElementById('sortBy').value;

  let list = [...transactions];
  if (search) list = list.filter(t => t.desc.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
  if (cat)    list = list.filter(t => t.category === cat);
  if (type)   list = list.filter(t => t.type === type);

  list.sort((a,b) => {
    if (sort === 'date-desc') return new Date(b.date) - new Date(a.date);
    if (sort === 'date-asc')  return new Date(a.date) - new Date(b.date);
    if (sort === 'amount-desc') return b.amount - a.amount;
    if (sort === 'amount-asc')  return a.amount - b.amount;
    return 0;
  });
  return list;
}

// ── RENDER FUNCTIONS ───────────────────────────────────────────────
function renderTxnItem(t, showDelete=true) {
  const div = document.createElement('div');
  div.className = 'txn-item';
  div.innerHTML = `
    <div class="txn-icon ${catClass(t.category)}">${CATEGORY_ICONS[t.category] || '🗂️'}</div>
    <div class="txn-info">
      <div class="txn-desc">${t.desc}</div>
      <div class="txn-meta">${t.category} · ${fmtDate(t.date)}</div>
    </div>
    <span class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</span>
    ${showDelete ? `<button class="txn-delete" data-id="${t.id}" title="Delete">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>` : ''}
  `;
  if (showDelete) {
    div.querySelector('.txn-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteTxn(t.id);
    });
  }
  return div;
}

function renderStats() {
  const s = getStats();
  document.getElementById('statBalance').textContent = fmt(s.balance);
  document.getElementById('statIncome').textContent  = fmt(s.income);
  document.getElementById('statExpense').textContent = fmt(s.expense);
  document.getElementById('statMonthly').textContent = fmt(s.monthly);
  document.getElementById('statBalance').style.color = s.balance >= 0 ? 'var(--purple-400)' : 'var(--coral-400)';
}

function renderRecent() {
  const list = document.getElementById('recentList');
  list.innerHTML = '';
  const recent = [...transactions].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,5);
  if (recent.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text2);padding:2rem;font-size:13px">No transactions yet</p>';
    return;
  }
  recent.forEach(t => list.appendChild(renderTxnItem(t)));
}

function renderFullList() {
  const list = document.getElementById('fullTxnList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '';
  const filtered = getFilteredTxns();
  if (filtered.length === 0) {
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    filtered.forEach(t => list.appendChild(renderTxnItem(t)));
  }
}

// ── CHARTS ────────────────────────────────────────────────────────
function getCategoryTotals() {
  const totals = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  return totals;
}

function renderDashPie() {
  const ctx = document.getElementById('dashPieChart').getContext('2d');
  if (charts.dashPie) charts.dashPie.destroy();
  const totals = getCategoryTotals();
  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  if (data.length === 0) { ctx.canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--text2);padding:2rem;font-size:13px">No expense data yet</p>'; return; }
  charts.dashPie = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0, labels.length), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text'), font: { size: 12 }, boxWidth: 12, padding: 8 } } }
    }
  });
}

function renderAnalyticsPie() {
  const ctx = document.getElementById('analyticsPie').getContext('2d');
  if (charts.aPie) charts.aPie.destroy();
  const totals = getCategoryTotals();
  const labels = Object.keys(totals);
  const data   = Object.values(totals);
  if (data.length === 0) return;
  charts.aPie = new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0, labels.length), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text'), font: { size: 12 }, boxWidth: 12 } } }
    }
  });
}

function renderMonthlyBar() {
  const ctx = document.getElementById('monthlyBar').getContext('2d');
  if (charts.bar) charts.bar.destroy();
  const monthly = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const d = new Date(t.date);
    const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    monthly[key] = (monthly[key] || 0) + t.amount;
  });
  const labels = Object.keys(monthly).slice(-6);
  const data   = labels.map(k => parseFloat(monthly[k].toFixed(2)));
  charts.bar = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: 'rgba(124,92,191,0.7)', borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text2'), font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text2'), font: { size: 11 }, callback: v => '₹' + v.toLocaleString('en-IN') }, grid: { color: 'rgba(124,92,191,0.1)' } }
      }
    }
  });
}

function renderCategorySummary() {
  const container = document.getElementById('categorySummary');
  container.innerHTML = '';
  const totals = getCategoryTotals();
  const max = Math.max(...Object.values(totals), 1);
  if (Object.keys(totals).length === 0) {
    container.innerHTML = '<p style="color:var(--text2);font-size:13px">No expense data yet.</p>';
    return;
  }
  EXPENSE_CATS.forEach(cat => {
    const amount = totals[cat] || 0;
    const pct = Math.round((amount / max) * 100);
    const card = document.createElement('div');
    card.className = 'cat-stat';
    card.innerHTML = `
      <div class="cat-stat-name">${CATEGORY_ICONS[cat]} ${cat}</div>
      <div class="cat-stat-amount">${fmt(amount)}</div>
      <div class="cat-stat-bar"><div class="cat-stat-fill" style="width:${pct}%"></div></div>
    `;
    container.appendChild(card);
  });
}

function renderBudget() {
  const grid = document.getElementById('budgetGrid');
  grid.innerHTML = '';
  const totals = getCategoryTotals();
  EXPENSE_CATS.forEach(cat => {
    const spent  = totals[cat] || 0;
    const limit  = budgets[cat] || 0;
    const pct    = limit > 0 ? Math.min(Math.round((spent / limit) * 100), 100) : 0;
    const status = limit === 0 ? 'ok' : (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok');
    const statusText = limit === 0 ? 'No limit set' : (pct >= 100 ? 'Over budget!' : pct >= 80 ? `${pct}% used` : `${pct}% used`);
    const card = document.createElement('div');
    card.className = 'budget-card';
    card.innerHTML = `
      <div class="budget-card-header">
        <div class="budget-cat">${CATEGORY_ICONS[cat]} ${cat}</div>
        <span class="budget-status ${status}">${statusText}</span>
      </div>
      <div style="font-size:13px;color:var(--text2)">Spent: <strong style="color:var(--text)">${fmt(spent)}</strong></div>
      <div class="budget-bar"><div class="budget-fill ${status}" style="width:${limit>0?pct:0}%"></div></div>
      <div class="budget-nums">
        <span>₹0</span>
        <span>${limit > 0 ? fmt(limit) : 'No limit'}</span>
      </div>
      <div class="budget-input-row">
        <input type="number" placeholder="Set limit (₹)" min="0" value="${limit||''}" data-cat="${cat}"/>
        <button class="budget-set-btn" data-cat="${cat}">Set</button>
      </div>
    `;
    card.querySelector('.budget-set-btn').addEventListener('click', () => {
      const val = parseFloat(card.querySelector('input').value);
      if (!isNaN(val) && val >= 0) {
        budgets[cat] = val;
        save();
        renderBudget();
      }
    });
    grid.appendChild(card);
  });
}

// ── ALL RENDER ─────────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderRecent();
  renderFullList();
  renderDashPie();
  renderAnalyticsPie();
  renderMonthlyBar();
  renderCategorySummary();
  renderBudget();
}

// ── ADD / DELETE ───────────────────────────────────────────────────
function addTransaction(desc, amount, category, date, type) {
  transactions.push({ id: Date.now(), desc, amount: parseFloat(amount), category, date, type });
  save();
  renderAll();
}

function deleteTxn(id) {
  transactions = transactions.filter(t => t.id !== id);
  save();
  renderAll();
}

// ── MODAL ──────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('txnDesc').focus();
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('txnDesc').value = '';
  document.getElementById('txnAmount').value = '';
  document.getElementById('formError').textContent = '';
  selectedCat = '';
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
}

document.getElementById('openAddModal').addEventListener('click', openModal);
document.getElementById('openAddModal2').addEventListener('click', openModal);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedType = btn.dataset.type;
    document.getElementById('categoryGroup').style.display = selectedType === 'expense' ? '' : 'none';
    if (selectedType === 'income') { selectedCat = 'Income'; }
  });
});

document.querySelectorAll('.cat-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedCat = pill.dataset.cat;
  });
});

document.getElementById('submitTxn').addEventListener('click', () => {
  const desc   = document.getElementById('txnDesc').value.trim();
  const amount = document.getElementById('txnAmount').value;
  const date   = document.getElementById('txnDate').value;
  const err    = document.getElementById('formError');

  if (!desc)   { err.textContent = 'Please enter a description.'; return; }
  if (!amount || parseFloat(amount) <= 0) { err.textContent = 'Please enter a valid amount.'; return; }
  if (!date)   { err.textContent = 'Please pick a date.'; return; }
  if (selectedType === 'expense' && !selectedCat) { err.textContent = 'Please select a category.'; return; }

  addTransaction(desc, amount, selectedType === 'income' ? 'Income' : selectedCat, date, selectedType);
  closeModal();
});

// ── NAVIGATION ─────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'analytics') { renderAnalyticsPie(); renderMonthlyBar(); renderCategorySummary(); }
    if (btn.dataset.view === 'budget') renderBudget();
  });
});

// ── FILTERS ────────────────────────────────────────────────────────
['searchInput','filterCategory','filterType','sortBy'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderFullList);
  document.getElementById(id).addEventListener('change', renderFullList);
});

// ── CSV EXPORT ─────────────────────────────────────────────────────
document.getElementById('exportCSV').addEventListener('click', () => {
  const rows = [['Date','Description','Category','Type','Amount']];
  getFilteredTxns().forEach(t => rows.push([t.date, `"${t.desc}"`, t.category, t.type, t.amount.toFixed(2)]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv,' + encodeURIComponent(csv);
  a.download = 'expenses.csv';
  a.click();
});

// ── DARK MODE ──────────────────────────────────────────────────────
const themeBtn = document.getElementById('themeBtn');
const themeLabel = document.getElementById('themeLabel');
function applyTheme(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeLabel.textContent = dark ? 'Light mode' : 'Dark mode';
  localStorage.setItem('spendsmart_theme', dark ? 'dark' : 'light');
}
themeBtn.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') !== 'dark');
  renderAll();
});
const savedTheme = localStorage.getItem('spendsmart_theme');
if (savedTheme) applyTheme(savedTheme === 'dark');

// ── SEED DATA (if empty) ───────────────────────────────────────────
if (transactions.length === 0) {
  const today = new Date();
  const d = (offset) => { const x = new Date(today); x.setDate(x.getDate()-offset); return x.toISOString().split('T')[0]; };
  [
    { desc:'Monthly allowance', amount:5000, category:'Income', date:d(28), type:'income' },
    { desc:'Part-time tutoring', amount:1500, category:'Income', date:d(14), type:'income' },
    { desc:'Canteen lunch', amount:120, category:'Food', date:d(0), type:'expense' },
    { desc:'Breakfast + tea', amount:60, category:'Food', date:d(1), type:'expense' },
    { desc:'Bus pass top-up', amount:300, category:'Travel', date:d(2), type:'expense' },
    { desc:'Engineering textbook', amount:480, category:'Books', date:d(5), type:'expense' },
    { desc:'Notebook + pens', amount:95, category:'Stationery', date:d(6), type:'expense' },
    { desc:'Spotify subscription', amount:119, category:'Subscriptions', date:d(7), type:'expense' },
    { desc:'T-shirt from Ajio', amount:599, category:'Shopping', date:d(10), type:'expense' },
    { desc:'Printing assignment', amount:45, category:'Miscellaneous', date:d(3), type:'expense' },
  ].forEach((t,i) => transactions.push({ id: Date.now()+i, ...t }));
  save();
}

// ── INIT ───────────────────────────────────────────────────────────
renderAll();
