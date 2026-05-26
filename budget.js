// ─── budget.js — Per-category budget + projections v2 ──────────────────────

const Budget = (() => {

  function render() {
    const period = Data.getActivePeriod();
    const el     = document.getElementById('view-budget');
    if (!period) { el.innerHTML = noPeriod(); return; }

    const income     = Income.totalIncome(period);
    const spent      = Expenses.totalExpenses(period);
    const cap        = Number(period.budget.cap) || 0;
    const catCaps    = period.budget.categoryCaps || {};
    const catSpend   = Expenses.byCategory(period);
    const net        = income - spent;
    const overBudget = cap > 0 && spent > cap;
    const pct        = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
    const categories = Data.getCategories();

    // Projections
    const allJobs   = Data.getJobs();
    const linkedIds = period.linkedJobIds || [];
    const linkedJobs= allJobs.filter(j => linkedIds.includes(j.id));
    const projIncome= linkedJobs.reduce((s, j) =>
      s + Income.projectJobIncome(j, period.startDate, period.endDate), 0);

    const recMonthly = Expenses.recurringMonthly();

    // Period length in days
    const startD = new Date(period.startDate + 'T00:00:00');
    const endD   = new Date(period.endDate   + 'T00:00:00');
    const periodDays = Math.round((endD - startD) / 86400000) + 1;
    const periodMonths = periodDays / 30.44;

    const projExpenses = recMonthly * periodMonths;
    const projNet      = projIncome - projExpenses;

    el.innerHTML = `
      <h1 class="page-title">Budget</h1>
      <p class="page-sub">${period.label}</p>

      <!-- Projections -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">Projections for this period</div>
        <div style="display:flex;gap:2rem;flex-wrap:wrap;">
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Projected income</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--accent2);">${Data.fmt(projIncome, period)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">from job schedules</div>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Projected expenses</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--danger);">${Data.fmt(projExpenses, period)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);">from recurring (${periodDays}d period)</div>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Projected net</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:${projNet >= 0 ? 'var(--accent2)' : 'var(--danger)'};">
              ${Data.fmt(projNet, period)}
            </div>
          </div>
          <div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.2rem;">Annual income est.</div>
            <div style="font-family:var(--font-mono);font-size:1.3rem;color:var(--accent);">
              ${Data.fmt(projIncome / periodMonths * 12, period)}
            </div>
          </div>
        </div>
      </div>

      <!-- Overall cap -->
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">Overall spending cap</div>
        <div class="flex gap-1" style="align-items:center;max-width:320px;margin-bottom:1rem;">
          <input type="number" class="form-input" id="capInput"
            value="${cap || ''}" placeholder="e.g. 1500" step="10" min="0" />
          <button class="btn btn-primary btn-sm" id="saveCapBtn">Save</button>
        </div>

        <div class="summary-grid" style="margin-bottom:${cap > 0 ? '1rem' : '0'};">
          <div class="summary-card">
            <div class="summary-label">Income</div>
            <div class="summary-amount text-green">${Data.fmt(income, period)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Spent</div>
            <div class="summary-amount text-red">${Data.fmt(spent, period)}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Net</div>
            <div class="summary-amount ${net >= 0 ? 'text-green' : 'text-red'}">${Data.fmt(net, period)}</div>
          </div>
          ${cap > 0 ? `
            <div class="summary-card">
              <div class="summary-label">${overBudget ? '⚠ Over budget' : 'Budget left'}</div>
              <div class="summary-amount ${overBudget ? 'text-red' : 'text-accent'}">
                ${Data.fmt(Math.abs(cap - spent), period)}
              </div>
            </div>
          ` : ''}
        </div>

        ${cap > 0 ? `
          <div class="budget-bar">
            <div class="budget-fill ${overBudget ? 'red' : pct > 70 ? 'amber' : 'green'}"
              style="width:${pct}%;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-muted);margin-top:0.4rem;">
            <span>${pct.toFixed(1)}% used</span>
            <span>${overBudget
              ? Data.fmt(spent - cap, period) + ' over'
              : Data.fmt(cap - spent, period) + ' remaining'}</span>
          </div>
        ` : ''}
      </div>

      <!-- Per-category caps -->
      <div class="section-header">
        <span class="section-title">Per-category limits</span>
      </div>
      <div class="card" style="padding:1.25rem;">
        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;">
          Set a spending limit per category. Leave blank for no limit.
        </p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;" id="catCapsList">
          ${categories.map(cat => {
            const catSpent = catSpend[cat] || 0;
            const catCap   = catCaps[cat] || 0;
            const catPct   = catCap > 0 ? Math.min((catSpent / catCap) * 100, 100) : 0;
            const over     = catCap > 0 && catSpent > catCap;
            return `
              <div style="background:var(--surface2);border:1px solid var(--border);
                border-radius:6px;padding:0.75rem 1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${catCap > 0 ? '0.5rem' : '0'};">
                  <div style="display:flex;align-items:center;gap:1rem;">
                    <span style="font-size:0.875rem;min-width:100px;">${cat}</span>
                    <span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--danger);">
                      ${Data.fmt(catSpent, period)} spent
                    </span>
                    ${catCap > 0 ? `<span style="font-size:0.78rem;color:${over ? 'var(--danger)' : 'var(--text-muted)'};">
                      / ${Data.fmt(catCap, period)} limit ${over ? '⚠' : ''}
                    </span>` : ''}
                  </div>
                  <div class="flex gap-1" style="align-items:center;">
                    <input type="number" class="form-input" data-cat-cap="${cat}"
                      value="${catCap || ''}" placeholder="limit" step="10" min="0"
                      style="width:110px;font-size:0.82rem;padding:0.35rem 0.6rem;" />
                    <button class="btn-ghost btn-sm" data-save-cat-cap="${cat}">Set</button>
                    ${catCap > 0 ? `<button class="btn-icon" data-clear-cat-cap="${cat}" title="Remove limit">✕</button>` : ''}
                  </div>
                </div>
                ${catCap > 0 ? `
                  <div class="budget-bar" style="height:5px;">
                    <div class="budget-fill ${over ? 'red' : catPct > 75 ? 'amber' : 'green'}"
                      style="width:${catPct}%;"></div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    bindEvents(period.id);
  }

  function bindEvents(periodId) {
    document.getElementById('saveCapBtn')?.addEventListener('click', async () => {
      const cap = parseFloat(document.getElementById('capInput').value);
      if (!isNaN(cap) && cap >= 0) { await Data.setBudget(periodId, cap); render(); }
    });

    document.getElementById('catCapsList')?.addEventListener('click', async e => {
      // Save category cap
      const saveBtn = e.target.closest('[data-save-cat-cap]');
      if (saveBtn) {
        const cat = saveBtn.dataset.saveCatCap;
        const val = parseFloat(document.querySelector(`[data-cat-cap="${cat}"]`)?.value);
        if (!isNaN(val) && val >= 0) { await Data.setCategoryCap(periodId, cat, val); render(); }
        return;
      }
      // Clear category cap
      const clearBtn = e.target.closest('[data-clear-cat-cap]');
      if (clearBtn) { await Data.deleteCategoryCap(periodId, clearBtn.dataset.clearCatCap); render(); }
    });
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render };
})();
