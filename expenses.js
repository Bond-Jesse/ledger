// ─── expenses.js — Expenses v2 (custom categories, recurring, expected dates) ──

const Expenses = (() => {

  function totalExpenses(period) {
    return period.expenses.reduce((s, e) => s + Number(e.amount), 0);
  }

  function byCategory(period) {
    const map = {};
    period.expenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount);
    });
    return map;
  }

  // Monthly & annual projections from recurring templates
  function recurringMonthly() {
    const recs = Data.getRecurring();
    return recs.reduce((s, r) => {
      if (r.frequency === 'monthly')    return s + Number(r.amount);
      if (r.frequency === 'weekly')     return s + Number(r.amount) * 4.33;
      if (r.frequency === 'per-period') return s + Number(r.amount);
      return s;
    }, 0);
  }

  function render() {
    const period = Data.getActivePeriod();
    const el     = document.getElementById('view-expenses');
    if (!period) { el.innerHTML = noPeriod(); return; }

    const expenses  = period.expenses;
    const total     = totalExpenses(period);
    const cats      = byCategory(period);
    const categories = Data.getCategories();
    const recurrings = Data.getRecurring();
    const monthly   = recurringMonthly();

    // Upcoming expected expenses (have expectedDate in the future or in period)
    const today = Periods.todayISO();
    const upcoming = expenses.filter(e => e.expectedDate && e.expectedDate > today)
      .sort((a,b) => a.expectedDate.localeCompare(b.expectedDate));

    el.innerHTML = `
      <h1 class="page-title">Expenses</h1>
      <p class="page-sub">${period.label}</p>

      <!-- Projections banner -->
      <div class="card" style="margin-bottom:1rem;">
        <div class="card-title">Recurring projections</div>
        <div style="display:flex;gap:2rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Monthly (from recurring)</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--danger);">${Data.fmt(monthly, period)}</div>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Annual estimate</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--danger);">${Data.fmt(monthly * 12, period)}</div>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">This period total</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--danger);">${Data.fmt(total, period)}</div>
          </div>
        </div>
      </div>

      <!-- Category manager -->
      <div class="section-header">
        <span class="section-title">Categories</span>
        <button class="btn-ghost btn-sm" id="toggleCatMgr">Manage categories ▾</button>
      </div>
      <div id="catManager" class="inline-form hidden" style="margin-bottom:1rem;">
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;" id="catList">
          ${categories.map(c => `
            <div style="display:flex;align-items:center;gap:0.25rem;background:var(--bg);
              border:1px solid var(--border);border-radius:5px;padding:0.25rem 0.5rem;">
              <span style="font-size:0.82rem;">${c}</span>
              <button class="btn-icon" data-del-cat="${c}" title="Delete category"
                style="font-size:0.7rem;padding:0.1rem 0.25rem;">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="flex gap-1" style="max-width:320px;">
          <input type="text" class="form-input" id="newCatInput" placeholder="New category name" />
          <button class="btn btn-primary btn-sm" id="addCatBtn">Add</button>
        </div>
        <div class="flex gap-1 mt-1" style="max-width:440px;">
          <input type="text" class="form-input" id="renameCatFrom" placeholder="Rename from..." />
          <input type="text" class="form-input" id="renameCatTo"   placeholder="To..." />
          <button class="btn-ghost btn-sm" id="renameCatBtn">Rename</button>
        </div>
      </div>

      <!-- Recurring expense manager -->
      <div class="section-header">
        <span class="section-title">Recurring expenses</span>
        <button class="btn-ghost btn-sm" id="toggleRecMgr">Manage ▾</button>
      </div>
      <div id="recManager" class="inline-form hidden" style="margin-bottom:1rem;">
        ${recurrings.length > 0 ? `
          <div style="margin-bottom:0.75rem;">
            ${recurrings.map(r => `
              <div style="display:flex;align-items:center;justify-content:space-between;
                padding:0.5rem 0;border-bottom:1px solid var(--border);">
                <div>
                  <span style="font-size:0.875rem;">${r.name}</span>
                  <span class="badge badge-category" style="margin-left:0.5rem;">${r.category}</span>
                  <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.5rem;">${r.frequency}${r.frequency === 'monthly' ? ` (day ${r.dayOfMonth})` : ''}</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  <span style="font-family:var(--font-mono);color:var(--danger);">${Data.fmt(r.amount, period)}</span>
                  <button class="btn-icon" data-del-rec="${r.id}">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<p class="text-muted" style="font-size:0.82rem;margin-bottom:0.75rem;">No recurring expenses yet.</p>`}
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:1rem;">
          <div style="font-size:0.72rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.75rem;font-weight:600;">Add recurring</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name</label>
              <input type="text" class="form-input" id="rName" placeholder="e.g. Rent" />
            </div>
            <div class="form-group">
              <label class="form-label">Amount (${Data.currency(period)})</label>
              <input type="number" class="form-input" id="rAmount" placeholder="0.00" step="0.01" min="0" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="rCategory">
                ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Frequency</label>
              <select class="form-select" id="rFrequency">
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="per-period">Once per period</option>
              </select>
            </div>
          </div>
          <div class="form-group" id="domWrap" style="max-width:200px;">
            <label class="form-label">Day of month</label>
            <input type="number" class="form-input" id="rDom" value="1" min="1" max="31" />
          </div>
          <div class="form-group">
            <label class="form-label">Note (optional)</label>
            <input type="text" class="form-input" id="rNote" placeholder="" />
          </div>
          <div class="flex flex-end">
            <button class="btn btn-primary btn-sm" id="saveRecBtn">Add Recurring</button>
          </div>
        </div>
      </div>

      <!-- Upcoming expected expenses -->
      ${upcoming.length > 0 ? `
        <div class="card" style="margin-bottom:1rem;">
          <div class="card-title">⏱ Upcoming expected expenses</div>
          ${upcoming.map(e => `
            <div style="display:flex;justify-content:space-between;align-items:center;
              padding:0.5rem 0;border-bottom:1px solid var(--border);">
              <div>
                <span style="font-size:0.875rem;">${e.note || e.category}</span>
                <span class="badge badge-category" style="margin-left:0.5rem;">${e.category}</span>
              </div>
              <div style="display:flex;align-items:center;gap:1rem;">
                <span style="font-size:0.78rem;color:var(--text-muted);font-family:var(--font-mono);">
                  expected ${Periods.formatDate(e.expectedDate)}
                </span>
                <span style="font-family:var(--font-mono);color:var(--danger);">${Data.fmt(e.amount, period)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Category breakdown -->
      ${Object.keys(cats).length > 0 ? `
        <div class="card" style="margin-bottom:1.5rem;">
          <div class="card-title">Breakdown by category</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
            ${Object.entries(cats).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => `
              <div style="background:var(--surface2);border:1px solid var(--border);
                border-radius:6px;padding:0.5rem 0.85rem;min-width:110px;">
                <div style="font-size:0.68rem;color:var(--text-muted);text-transform:uppercase;
                  letter-spacing:0.08em;margin-bottom:0.2rem;">${cat}</div>
                <div style="font-family:var(--font-mono);color:var(--danger);">${Data.fmt(amt, period)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Add expense -->
      <div class="section-header">
        <span class="section-title">All expenses</span>
        <button class="btn btn-primary btn-sm" id="addExpenseBtn">+ Add Expense</button>
      </div>

      <div id="expenseForm" class="inline-form hidden">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="exDate" value="${Periods.todayISO()}" />
          </div>
          <div class="form-group">
            <label class="form-label">Amount (${Data.currency(period)})</label>
            <input type="number" class="form-input" id="exAmount" placeholder="0.00" step="0.01" min="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="exCategory">
              ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Note (optional)</label>
            <input type="text" class="form-input" id="exNote" placeholder="e.g. Groceries" />
          </div>
        </div>
        <div class="form-group" style="max-width:260px;">
          <label class="form-label">Expected date (if not paid yet, optional)</label>
          <input type="date" class="form-input" id="exExpected" />
        </div>
        <div class="flex flex-end gap-1">
          <button class="btn-ghost btn-sm" id="cancelExpenseBtn">Cancel</button>
          <button class="btn btn-primary btn-sm" id="saveExpenseBtn">Add Expense</button>
        </div>
      </div>

      <!-- Expenses table -->
      <div class="card" style="padding:0;overflow:hidden;">
        ${expenses.length === 0
          ? `<div class="empty-state" style="padding:2.5rem;">
               <div class="empty-icon">↓</div><h3>No expenses yet</h3>
               <p>Add your first expense for this period.</p>
             </div>`
          : `<table class="data-table">
              <thead>
                <tr><th>Date</th><th>Category</th><th>Note</th><th>Expected</th><th>Amount</th><th></th></tr>
              </thead>
              <tbody>
                ${[...expenses].sort((a,b) => (b.date||'').localeCompare(a.date||'')).map(e => `
                  <tr ${e.auto ? 'style="opacity:0.75;"' : ''}>
                    <td class="mono text-muted">${e.date ? Periods.formatDate(e.date) : '—'}</td>
                    <td><span class="badge badge-category">${e.category}</span></td>
                    <td class="text-muted" style="font-size:0.82rem;">
                      ${e.note || '—'}
                      ${e.auto ? '<span style="font-size:0.65rem;color:var(--accent);margin-left:0.3rem;">auto</span>' : ''}
                    </td>
                    <td class="mono text-muted" style="font-size:0.8rem;">
                      ${e.expectedDate ? Periods.formatDate(e.expectedDate) : '—'}
                    </td>
                    <td class="mono text-red">${Data.fmt(e.amount, period)}</td>
                    <td><button class="btn-icon" data-del-expense="${e.id}">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals-row">
              <div class="total-item">
                <span class="total-label">Total spent:</span>
                <span class="total-value text-red">${Data.fmt(total, period)}</span>
              </div>
            </div>`
        }
      </div>
    `;

    bindEvents(period.id, categories);
  }

  function bindEvents(periodId, categories) {
    // Category manager toggle
    document.getElementById('toggleCatMgr')?.addEventListener('click', () => {
      document.getElementById('catManager').classList.toggle('hidden');
    });
    document.getElementById('addCatBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('newCatInput').value.trim();
      if (name) { await Data.addCategory(name); render(); }
    });
    document.getElementById('renameCatBtn')?.addEventListener('click', async () => {
      const from = document.getElementById('renameCatFrom').value.trim();
      const to   = document.getElementById('renameCatTo').value.trim();
      if (from && to) { await Data.renameCategory(from, to); render(); }
    });
    document.getElementById('catManager')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-del-cat]');
      if (btn) { await Data.deleteCategory(btn.dataset.delCat); render(); }
    });

    // Recurring manager toggle
    document.getElementById('toggleRecMgr')?.addEventListener('click', () => {
      document.getElementById('recManager').classList.toggle('hidden');
    });
    document.getElementById('rFrequency')?.addEventListener('change', e => {
      document.getElementById('domWrap').style.display = e.target.value === 'monthly' ? '' : 'none';
    });
    document.getElementById('saveRecBtn')?.addEventListener('click', async () => {
      const name      = document.getElementById('rName').value.trim();
      const amount    = parseFloat(document.getElementById('rAmount').value);
      const category  = document.getElementById('rCategory').value;
      const frequency = document.getElementById('rFrequency').value;
      const dayOfMonth= parseInt(document.getElementById('rDom').value) || 1;
      const note      = document.getElementById('rNote').value.trim();
      if (!name || isNaN(amount) || amount <= 0) return;
      await Data.addRecurring({ id: Data.uid(), name, amount, category, frequency, dayOfMonth, note });
      render();
    });
    document.getElementById('recManager')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-del-rec]');
      if (btn) { await Data.deleteRecurring(btn.dataset.delRec); render(); }
    });

    // Expense form
    document.getElementById('addExpenseBtn')?.addEventListener('click', () => {
      document.getElementById('expenseForm').classList.toggle('hidden');
      document.getElementById('exAmount')?.focus();
    });
    document.getElementById('cancelExpenseBtn')?.addEventListener('click', () => {
      document.getElementById('expenseForm').classList.add('hidden');
    });
    document.getElementById('saveExpenseBtn')?.addEventListener('click', async () => {
      const date         = document.getElementById('exDate').value;
      const amount       = parseFloat(document.getElementById('exAmount').value);
      const category     = document.getElementById('exCategory').value;
      const note         = document.getElementById('exNote').value.trim();
      const expectedDate = document.getElementById('exExpected').value || null;
      if (!date || isNaN(amount) || amount <= 0) return;
      await Data.addExpense(periodId, { id: Data.uid(), date, amount, category, note, expectedDate });
      document.getElementById('expenseForm').classList.add('hidden');
      render();
    });

    // Delete expense
    document.getElementById('view-expenses')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-del-expense]');
      if (btn) { await Data.deleteExpense(periodId, btn.dataset.delExpense); render(); }
    });
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render, totalExpenses, byCategory, recurringMonthly };
})();
