// ─── app.js — Main controller v3 (async, badges, CSV, summary extras) ──────

const App = (() => {

  let currentView = 'summary';

  // ── Boot ───────────────────────────────────────────────────────────────────
  function boot() {
    FB.onAuthChange(async (user) => {
      if (user) {
        showLoading(true);
        await Data.init();
        showLoading(false);
        Auth.hideAuthScreen();
        Auth.renderUserBadge(user);
        bindNav();
        bindHeader();
        refresh();
      } else {
        Auth.showAuthScreen();
      }
    });
  }

  function showLoading(on) {
    let el = document.getElementById('loadingOverlay');
    if (!el) return;
    el.classList.toggle('hidden', !on);
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  function refresh() {
    renderHeader();
    renderBadges();
    renderCurrentView();
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function bindNav() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(link.dataset.view);
      });
    });
  }

  function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-link').forEach(l =>
      l.classList.toggle('active', l.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');
    renderCurrentView();
  }

  function renderCurrentView() {
    switch (currentView) {
      case 'summary':  renderSummary();    break;
      case 'periods':  Periods.render();   break;
      case 'income':   Income.render();    break;
      case 'expenses': Expenses.render();  break;
      case 'budget':   Budget.render();    break;
      case 'savings':  Savings.render();   break;
      case 'calendar': Calendar.render();  break;
    }
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  function bindHeader() {
    document.getElementById('periodSwitcher')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('periodDropdown')?.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      document.getElementById('periodDropdown')?.classList.add('hidden');
    });
    document.getElementById('newPeriodBtn')?.addEventListener('click', () => switchView('periods'));
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportCSV);
  }

  function renderHeader() {
    const active  = Data.getActivePeriod();
    const periods = Data.getPeriods();
    const lbl     = document.getElementById('activePeriodLabel');
    if (lbl) lbl.textContent = active ? active.label : 'No period selected';

    const dd = document.getElementById('periodDropdown');
    if (!dd) return;
    if (periods.length === 0) {
      dd.innerHTML = `<div class="drop-item text-muted">No periods yet</div>`;
    } else {
      dd.innerHTML = periods.map(p => `
        <div class="drop-item ${p.id === active?.id ? 'active' : ''}" data-switch="${p.id}"
             style="border-left:3px solid ${p.color || 'var(--accent)'};">
          <span>${p.label}</span>
          <span class="drop-item-type">${p.type}</span>
        </div>
      `).join('');
      dd.querySelectorAll('[data-switch]').forEach(item => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation();
          await Data.setActivePeriod(item.dataset.switch);
          dd.classList.add('hidden');
          refresh();
        });
      });
    }
  }

  // ── Badge system ────────────────────────────────────────────────────────────
  function renderBadges() {
    const period = Data.getActivePeriod();
    const today  = Periods.todayISO();

    // Income badge: no hours logged in past 2 days within an active period
    let incomeBadge = false;
    if (period) {
      const recentEntry = (period.income.entries || []).find(e => {
        const diff = (new Date(today) - new Date(e.date + 'T00:00:00')) / 86400000;
        return diff <= 2;
      });
      const periodActive = today >= period.startDate && today <= period.endDate;
      if (periodActive && !recentEntry) incomeBadge = true;
    }

    // Expenses badge: any expense with expectedDate <= today not yet "confirmed" (has no real date)
    let expensesBadge = false;
    if (period) {
      expensesBadge = (period.expenses || []).some(e =>
        e.expectedDate && e.expectedDate <= today && !e.date
      );
    }

    setBadge('income',   incomeBadge);
    setBadge('expenses', expensesBadge);
  }

  function setBadge(view, show) {
    const link = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (!link) return;
    let badge = link.querySelector('.nav-badge');
    if (show && !badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      link.appendChild(badge);
    } else if (!show && badge) {
      badge.remove();
    }
  }

  // ── CSV Export ──────────────────────────────────────────────────────────────
  function exportCSV() {
    const period = Data.getActivePeriod();
    if (!period) { alert('No active period to export.'); return; }

    const rows = [['Type','Date','Job/Category','Note','Hours','Amount','Currency']];
    const cur  = Data.currency(period);

    (period.income.entries || []).forEach(e => {
      const job = e.jobId ? Data.getJob(e.jobId) : null;
      const wage = job ? Number(job.wage) : 0;
      rows.push(['Income', e.date, job?.name || '', e.note || '', e.hours, (e.hours * wage).toFixed(2), cur]);
    });

    (period.expenses || []).forEach(e => {
      rows.push(['Expense', e.date || e.expectedDate || '', e.category, e.note || '', '', Number(e.amount).toFixed(2), cur]);
    });

    (period.savingsGoals || []).forEach(g => {
      rows.push(['Savings Goal', '', g.label, `${g.contributed}/${g.target}`, '', Number(g.contributed).toFixed(2), cur]);
    });

    const csv     = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `ledger-${period.label.replace(/[^a-z0-9]/gi,'-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Summary view ────────────────────────────────────────────────────────────
  function renderSummary() {
    const el     = document.getElementById('view-summary');
    const period = Data.getActivePeriod();

    if (!period) {
      el.innerHTML = `
        <div class="no-period-msg">
          <div style="font-size:3rem;margin-bottom:1rem;opacity:0.2;">◎</div>
          <h2>Welcome to Ledger</h2>
          <p style="margin-bottom:1.5rem;">Create your first period to start tracking.</p>
          <button class="btn btn-primary" id="goCreatePeriod">Create a Period</button>
        </div>`;
      document.getElementById('goCreatePeriod')?.addEventListener('click', () => switchView('periods'));
      return;
    }

    const income  = Income.totalIncome(period);
    const spent   = Expenses.totalExpenses(period);
    const net     = income - spent;
    const cap     = Number(period.budget.cap) || 0;
    const saved   = Savings.totalContributed(period);
    const totTarg = Savings.totalTarget(period);

    // Projections
    const allJobs    = Data.getJobs();
    const linkedJobs = allJobs.filter(j => (period.linkedJobIds || []).includes(j.id));
    const projIncome = linkedJobs.reduce((s, j) =>
      s + Income.projectJobIncome(j, period.startDate, period.endDate), 0);

    const startD       = new Date(period.startDate + 'T00:00:00');
    const endD         = new Date(period.endDate   + 'T00:00:00');
    const periodMonths = (Math.round((endD - startD) / 86400000) + 1) / 30.44;
    const projExpenses = Expenses.recurringMonthly() * periodMonths;
    const projNet      = projIncome - projExpenses;

    const incomeVsProj  = income  - projIncome;
    const spendVsProj   = spent   - projExpenses;

    const budgetPct  = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
    const overBudget = cap > 0 && spent > cap;
    const typeLabels = { weekly:'Weekly', biweekly:'Bi-weekly', monthly:'Monthly', custom:'Custom' };
    const savingsPct = totTarg > 0 ? Math.min((saved / totTarg) * 100, 100) : 0;

    el.innerHTML = `
      <div style="display:flex;align-items:baseline;gap:1rem;margin-bottom:0.35rem;">
        <h1 class="page-title">Summary</h1>
        <span style="font-size:0.75rem;color:var(--accent);font-family:var(--font-mono);font-weight:600;letter-spacing:0.06em;">
          ${typeLabels[period.type] || period.type}
        </span>
      </div>
      <p class="page-sub">
        ${period.label} &nbsp;·&nbsp;
        ${Periods.formatDate(period.startDate)} → ${Periods.formatDate(period.endDate)}
      </p>

      <!-- Actuals -->
      <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;
        color:var(--text-muted);margin-bottom:0.6rem;font-weight:600;">Actual this period</div>
      <div class="summary-grid" style="margin-bottom:1.5rem;">
        <div class="summary-card">
          <div class="summary-label">Income</div>
          <div class="summary-amount text-green">${Data.fmt(income, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">
            ${Income.totalHours(period).toFixed(1)}h logged
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Spent</div>
          <div class="summary-amount text-red">${Data.fmt(spent, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">
            ${period.expenses.length} expense${period.expenses.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Net Balance</div>
          <div class="summary-amount ${net >= 0 ? 'text-green' : 'text-red'}">${Data.fmt(net, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">Income minus expenses</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Saved this period</div>
          <div class="summary-amount text-accent">${Data.fmt(saved, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">
            ${period.savingsGoals.length} goal${period.savingsGoals.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <!-- Estimates -->
      <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.1em;
        color:var(--text-muted);margin-bottom:0.6rem;font-weight:600;">Estimated (from schedules)</div>
      <div class="summary-grid" style="margin-bottom:1.5rem;">
        <div class="summary-card">
          <div class="summary-label">Est. Income</div>
          <div class="summary-amount text-accent">${Data.fmt(projIncome, period)}</div>
          <div style="font-size:0.75rem;margin-top:0.35rem;">
            <span class="${incomeVsProj >= 0 ? 'text-green' : 'text-red'}">
              ${incomeVsProj >= 0 ? '▲' : '▼'} ${Data.fmt(Math.abs(incomeVsProj), period)} vs actual
            </span>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Est. Expenses</div>
          <div class="summary-amount" style="color:var(--danger);">${Data.fmt(projExpenses, period)}</div>
          <div style="font-size:0.75rem;margin-top:0.35rem;">
            <span class="${spendVsProj <= 0 ? 'text-green' : 'text-red'}">
              ${spendVsProj >= 0 ? '▲' : '▼'} ${Data.fmt(Math.abs(spendVsProj), period)} vs actual
            </span>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Est. Net Balance</div>
          <div class="summary-amount ${projNet >= 0 ? 'text-green' : 'text-red'}">${Data.fmt(projNet, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">Proj. income − expenses</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Annual income est.</div>
          <div class="summary-amount text-accent">${Data.fmt(projIncome / (periodMonths || 1) * 12, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem;">Based on job schedules</div>
        </div>
      </div>

      ${cap > 0 ? `
        <div class="card" style="margin-bottom:1rem;">
          <div class="card-title">Budget Health</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.5rem;">
            <span style="font-size:0.9rem;">
              ${overBudget
                ? `<span class="text-red">⚠ Over budget by ${Data.fmt(spent - cap, period)}</span>`
                : `<span class="text-green">On track — ${Data.fmt(cap - spent, period)} remaining</span>`}
            </span>
            <span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-muted);">
              ${Data.fmt(spent, period)} / ${Data.fmt(cap, period)}
            </span>
          </div>
          <div class="budget-bar">
            <div class="budget-fill ${overBudget ? 'red' : budgetPct > 70 ? 'amber' : 'green'}"
              style="width:${budgetPct}%;"></div>
          </div>
        </div>
      ` : ''}

      ${period.savingsGoals.length > 0 ? `
        <div class="card" style="margin-bottom:1.5rem;">
          <div class="card-title">Savings Goals</div>
          ${totTarg > 0 ? `
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.4rem;">
              <span class="text-muted">All goals: ${Data.fmt(saved, period)} of ${Data.fmt(totTarg, period)}</span>
              <span>${savingsPct.toFixed(1)}%</span>
            </div>
            <div class="progress-bar" style="margin-bottom:1rem;">
              <div class="progress-fill ${savingsPct >= 100 ? 'green' : 'amber'}" style="width:${savingsPct}%;"></div>
            </div>
          ` : ''}
          ${period.savingsGoals.map(g => {
            const pct = g.target > 0 ? Math.min((g.contributed / g.target) * 100, 100) : 0;
            return `
              <div style="margin-bottom:0.85rem;">
                <div class="progress-label">
                  <span>${g.label}${g.deadline ? ` <span style="font-size:0.7rem;color:var(--text-muted);">· due ${Periods.formatDate(g.deadline)}</span>` : ''}</span>
                  <span>${Data.fmt(g.contributed, period)} / ${Data.fmt(g.target, period)}</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill ${pct >= 100 ? 'green' : 'amber'}" style="width:${pct}%;"></div>
                </div>
              </div>`;
          }).join('')}
        </div>
      ` : ''}

      <div class="divider"></div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <button class="btn-ghost btn-sm" data-goto="income">→ Log Income</button>
        <button class="btn-ghost btn-sm" data-goto="expenses">→ Add Expense</button>
        <button class="btn-ghost btn-sm" data-goto="budget">→ Budget</button>
        <button class="btn-ghost btn-sm" data-goto="savings">→ Savings Goals</button>
        <button class="btn-ghost btn-sm" data-goto="calendar">→ Calendar</button>
      </div>
    `;

    el.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.goto));
    });
  }

  return { boot, refresh };
})();

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => App.boot());
