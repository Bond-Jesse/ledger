// ─── savings.js — Savings v3 (toggle, subtract, summary slide, deadlines) ──

const Savings = (() => {

  let _hidden = false; // global show/hide toggle state

  function totalContributed(period) {
    return (period.savingsGoals || []).reduce((s, g) => s + Number(g.contributed), 0);
  }

  function totalTarget(period) {
    return (period.savingsGoals || []).reduce((s, g) => s + Number(g.target), 0);
  }

  // Required contribution per period to hit deadline
  function requiredPerPeriod(goal, currentPeriodEnd) {
    if (!goal.deadline) return null;
    const end      = new Date(goal.deadline   + 'T00:00:00');
    const now      = new Date(currentPeriodEnd + 'T00:00:00');
    const daysLeft = Math.max(0, Math.round((end - now) / 86400000));
    if (daysLeft === 0) return null;
    const remaining = Math.max(0, Number(goal.target) - Number(goal.contributed));
    // Assume ~30-day periods
    const periodsLeft = Math.max(1, daysLeft / 30);
    return remaining / periodsLeft;
  }

  function render() {
    const period = Data.getActivePeriod();
    const el     = document.getElementById('view-savings');
    if (!period) { el.innerHTML = noPeriod(); return; }

    const goals   = period.savingsGoals || [];
    const totCont = totalContributed(period);
    const totTarg = totalTarget(period);
    const totPct  = totTarg > 0 ? Math.min((totCont / totTarg) * 100, 100) : 0;
    const allDone = totTarg > 0 && totCont >= totTarg;

    el.innerHTML = `
      <h1 class="page-title">Savings Goals</h1>
      <p class="page-sub">${period.label}</p>

      <!-- Summary slide -->
      ${goals.length > 0 ? `
        <div class="savings-summary-slide">
          <div class="savings-summary-top">
            <div>
              <div class="savings-summary-label">All goals combined</div>
              <div class="savings-summary-amounts ${_hidden ? 'blurred' : ''}">
                <span class="savings-summary-value">${Data.fmt(totCont, period)}</span>
                <span class="savings-summary-sep">of</span>
                <span class="savings-summary-target">${Data.fmt(totTarg, period)}</span>
              </div>
              ${allDone
                ? `<div style="color:var(--accent2);font-size:0.82rem;margin-top:0.25rem;font-weight:600;">✓ All goals completed!</div>`
                : `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
                     ${Data.fmt(Math.max(0, totTarg - totCont), period)} remaining across all goals
                   </div>`
              }
            </div>
            <button class="btn-ghost btn-sm" id="toggleSavingsVisibility">
              ${_hidden ? '👁 Show' : '🙈 Hide'} amounts
            </button>
          </div>
          <div class="progress-bar" style="height:10px;margin-top:0.75rem;">
            <div class="progress-fill ${allDone ? 'green' : totPct > 66 ? 'green' : totPct > 33 ? 'amber' : 'amber'}"
              style="width:${totPct}%;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;
            color:var(--text-muted);margin-top:0.35rem;">
            <span>${totPct.toFixed(1)}% complete</span>
            <span>${goals.length} goal${goals.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      ` : ''}

      <!-- Goal list header -->
      <div class="section-header">
        <span class="section-title">${goals.length} goal${goals.length !== 1 ? 's' : ''}</span>
        <button class="btn btn-primary btn-sm" id="addGoalBtn">+ New Goal</button>
      </div>

      <!-- Add goal form -->
      <div id="goalForm" class="inline-form hidden">
        <h3 style="font-family:var(--font-serif);font-size:1.1rem;margin-bottom:1rem;">New Savings Goal</h3>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Goal name</label>
            <input type="text" class="form-input" id="gName" placeholder="e.g. Emergency fund" />
          </div>
          <div class="form-group">
            <label class="form-label">Target amount (${Data.currency(period)})</label>
            <input type="number" class="form-input" id="gTarget" placeholder="1000" step="10" min="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Initial contribution (${Data.currency(period)})</label>
            <input type="number" class="form-input" id="gContrib" placeholder="0" step="1" min="0" value="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Deadline (optional)</label>
            <input type="date" class="form-input" id="gDeadline" />
          </div>
        </div>
        <div class="flex flex-end gap-1">
          <button class="btn-ghost btn-sm" id="cancelGoalBtn">Cancel</button>
          <button class="btn btn-primary btn-sm" id="saveGoalBtn">Create Goal</button>
        </div>
      </div>

      <!-- Goals -->
      ${goals.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">◈</div>
             <h3>No savings goals</h3>
             <p>Create a goal and track your progress each period.</p>
           </div>`
        : goals.map(g => renderGoalCard(g, period)).join('')
      }

      ${goals.length > 0 ? `
        <div class="divider"></div>
        <div class="totals-row" style="justify-content:flex-start;padding:0;">
          <div class="total-item">
            <span class="total-label">Total contributed this period:</span>
            <span class="total-value text-accent ${_hidden ? 'blurred' : ''}">${Data.fmt(totCont, period)}</span>
          </div>
        </div>
      ` : ''}
    `;

    bindEvents(period.id, period);
  }

  function renderGoalCard(goal, period) {
    const pct      = goal.target > 0 ? Math.min((goal.contributed / goal.target) * 100, 100) : 0;
    const done     = Number(goal.contributed) >= Number(goal.target) && Number(goal.target) > 0;
    const reqPer   = requiredPerPeriod(goal, period.endDate);
    const daysLeft = goal.deadline
      ? Math.max(0, Math.round((new Date(goal.deadline + 'T00:00:00') - new Date()) / 86400000))
      : null;

    return `
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-name">${done ? '✓ ' : ''}${goal.label}</div>
          <button class="btn-icon" data-del-goal="${goal.id}" title="Delete goal">✕</button>
        </div>

        ${goal.deadline ? `
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;display:flex;gap:1rem;">
            <span>🗓 Deadline: <strong>${Periods.formatDate(goal.deadline)}</strong></span>
            <span>${daysLeft !== null ? `${daysLeft} days left` : ''}</span>
            ${reqPer ? `<span style="color:var(--accent);">Need ${Data.fmt(reqPer, period)}/period</span>` : ''}
          </div>
        ` : ''}

        <div class="goal-stats" style="margin-bottom:1rem;">
          <div class="goal-stat">
            <span class="goal-stat-label">Saved</span>
            <span class="goal-stat-value text-accent ${_hidden ? 'blurred' : ''}">${Data.fmt(goal.contributed, period)}</span>
          </div>
          <div class="goal-stat">
            <span class="goal-stat-label">Target</span>
            <span class="goal-stat-value ${_hidden ? 'blurred' : ''}">${Data.fmt(goal.target, period)}</span>
          </div>
          <div class="goal-stat">
            <span class="goal-stat-label">Remaining</span>
            <span class="goal-stat-value ${done ? 'text-green' : ''} ${_hidden ? 'blurred' : ''}">
              ${done ? 'Done!' : Data.fmt(Math.max(0, goal.target - goal.contributed), period)}
            </span>
          </div>
          <div class="goal-stat">
            <span class="goal-stat-label">Progress</span>
            <span class="goal-stat-value">${pct.toFixed(1)}%</span>
          </div>
        </div>

        <div class="progress-bar" style="margin-bottom:1rem;">
          <div class="progress-fill ${done ? 'green' : pct > 66 ? 'green' : 'amber'}"
            style="width:${pct}%;"></div>
        </div>

        <!-- Add / subtract controls -->
        <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <input type="number" class="form-input" id="contrib-${goal.id}"
              placeholder="Amount" step="1" min="0"
              style="max-width:140px;font-size:0.85rem;padding:0.4rem 0.65rem;" />
          </div>
          <button class="btn btn-primary btn-sm" data-add-contrib="${goal.id}">+ Add</button>
          <button class="btn-ghost btn-sm" data-sub-contrib="${goal.id}"
            style="color:var(--danger);border-color:var(--danger);">− Subtract</button>
        </div>
      </div>
    `;
  }

  function bindEvents(periodId, period) {
    // Show/hide toggle
    document.getElementById('toggleSavingsVisibility')?.addEventListener('click', () => {
      _hidden = !_hidden;
      render();
    });

    // Add goal form
    document.getElementById('addGoalBtn')?.addEventListener('click', () => {
      document.getElementById('goalForm').classList.toggle('hidden');
      document.getElementById('gName')?.focus();
    });
    document.getElementById('cancelGoalBtn')?.addEventListener('click', () => {
      document.getElementById('goalForm').classList.add('hidden');
    });
    document.getElementById('saveGoalBtn')?.addEventListener('click', async () => {
      const label      = document.getElementById('gName').value.trim();
      const target     = parseFloat(document.getElementById('gTarget').value);
      const contributed= parseFloat(document.getElementById('gContrib').value) || 0;
      const deadline   = document.getElementById('gDeadline').value || null;
      if (!label || isNaN(target) || target <= 0) return;
      await Data.addSavingsGoal(periodId, { id: Data.uid(), label, target, contributed, deadline });
      render();
    });

    // Add / subtract contributions + delete
    document.getElementById('view-savings')?.addEventListener('click', async (e) => {
      // Delete goal
      const delBtn = e.target.closest('[data-del-goal]');
      if (delBtn) {
        if (confirm('Delete this savings goal?')) {
          await Data.deleteSavingsGoal(periodId, delBtn.dataset.delGoal);
          render();
        }
        return;
      }

      // Add contribution
      const addBtn = e.target.closest('[data-add-contrib]');
      if (addBtn) {
        const goalId = addBtn.dataset.addContrib;
        const input  = document.getElementById(`contrib-${goalId}`);
        const amount = parseFloat(input?.value);
        if (isNaN(amount) || amount <= 0) return;
        const p    = Data.getActivePeriod();
        const goal = p?.savingsGoals.find(g => g.id === goalId);
        if (!goal) return;
        await Data.updateSavingsGoal(periodId, goalId, { contributed: Number(goal.contributed) + amount });
        render();
        return;
      }

      // Subtract contribution
      const subBtn = e.target.closest('[data-sub-contrib]');
      if (subBtn) {
        const goalId = subBtn.dataset.subContrib;
        const input  = document.getElementById(`contrib-${goalId}`);
        const amount = parseFloat(input?.value);
        if (isNaN(amount) || amount <= 0) return;
        const p    = Data.getActivePeriod();
        const goal = p?.savingsGoals.find(g => g.id === goalId);
        if (!goal) return;
        const newVal = Math.max(0, Number(goal.contributed) - amount);
        await Data.updateSavingsGoal(periodId, goalId, { contributed: newVal });
        render();
      }
    });
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render, totalContributed, totalTarget };
})();
