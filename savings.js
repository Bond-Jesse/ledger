// ─── savings.js — Savings v4 (bug fix + full customisation) ───────────────
//
// Bug fixed: input lookup no longer uses getElementById with goal IDs
//   (goal IDs contain chars like '-' that can silently break getElementById).
//   Now uses closest('.goal-card').querySelector('[data-contrib-input]') instead.
//
// New features:
//   • Goal colour picker (shown on card + new-goal form)
//   • Edit goal in-place (name, target, deadline, colour, emoji, note)
//   • Goal emoji/icon picker
//   • Optional goal description/note
//   • Compact vs. detailed card view toggle (per-session)
//   • "Per period needed" pill surfaced clearly on every card

const Savings = (() => {

  let _hidden   = false;  // global amounts show/hide
  let _compact  = false;  // compact card list vs full cards
  let _bound    = false;  // delegated listener attached flag

  // ── Goal colours palette ────────────────────────────────────────────────
  const GOAL_COLORS = [
    '#c8a96e','#7eb8a4','#a07ec8','#e07070',
    '#7ea8c8','#c8a07e','#7ec87e','#c87ea0',
    '#d4c87a','#7ab8d4','#b47a7a','#7ab47a'
  ];

  const GOAL_EMOJIS = [
    '◈','🏠','✈️','🚗','💊','📚','🎉','💻',
    '🏖️','💍','🛒','🐾','🎓','🏋️','🎸','☕'
  ];

  // ── Calculations ────────────────────────────────────────────────────────

  function totalContributed(period) {
    return (period.savingsGoals || []).reduce((s, g) => s + Number(g.contributed), 0);
  }

  function totalTarget(period) {
    return (period.savingsGoals || []).reduce((s, g) => s + Number(g.target), 0);
  }

  function requiredPerPeriod(goal, currentPeriodEnd) {
    if (!goal.deadline) return null;
    const end      = new Date(goal.deadline    + 'T00:00:00');
    const now      = new Date(currentPeriodEnd + 'T00:00:00');
    const daysLeft = Math.max(0, Math.round((end - now) / 86400000));
    if (daysLeft === 0) return null;
    const remaining   = Math.max(0, Number(goal.target) - Number(goal.contributed));
    const periodsLeft = Math.max(1, daysLeft / 30);
    return remaining / periodsLeft;
  }

  // ── Main render ─────────────────────────────────────────────────────────

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

      <!-- ── Summary slide ── -->
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
                ? `<div style="color:var(--accent2);font-size:0.82rem;margin-top:0.25rem;font-weight:600;">
                     ✓ All goals completed!
                   </div>`
                : `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">
                     ${Data.fmt(Math.max(0, totTarg - totCont), period)} remaining across all goals
                   </div>`
              }
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
              <button class="btn-ghost btn-sm" id="toggleCompact">
                ${_compact ? '⊞ Detailed' : '☰ Compact'}
              </button>
              <button class="btn-ghost btn-sm" id="toggleSavingsVisibility">
                ${_hidden ? '👁 Show' : '🙈 Hide'} amounts
              </button>
            </div>
          </div>
          <div class="progress-bar" style="height:10px;margin-top:0.75rem;">
            <div class="progress-fill ${allDone ? 'green' : totPct > 66 ? 'green' : 'amber'}"
              style="width:${totPct}%;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.75rem;
            color:var(--text-muted);margin-top:0.35rem;">
            <span>${totPct.toFixed(1)}% complete</span>
            <span>${goals.length} goal${goals.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      ` : ''}

      <!-- ── Section header ── -->
      <div class="section-header">
        <span class="section-title">${goals.length} goal${goals.length !== 1 ? 's' : ''}</span>
        <button class="btn btn-primary btn-sm" id="addGoalBtn">+ New Goal</button>
      </div>

      <!-- ── Add goal form ── -->
      <div id="goalForm" class="inline-form hidden">
        ${renderGoalForm()}
      </div>

      <!-- ── Edit goal form (hidden until edit clicked) ── -->
      <div id="editGoalForm" class="inline-form hidden"></div>

      <!-- ── Goal list ── -->
      ${goals.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">◈</div>
             <h3>No savings goals</h3>
             <p>Create a goal and track your progress each period.</p>
           </div>`
        : goals.map(g => _compact ? renderGoalRow(g, period) : renderGoalCard(g, period)).join('')
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

  // ── New goal form HTML ──────────────────────────────────────────────────

  function renderGoalForm(existing) {
    const colorVal  = existing?.color   || GOAL_COLORS[0];
    const emojiVal  = existing?.emoji   || '◈';
    const noteVal   = existing?.note    || '';
    const isEdit    = !!existing;
    return `
      <h3 style="font-family:var(--font-serif);font-size:1.1rem;margin-bottom:1rem;">
        ${isEdit ? 'Edit Goal' : 'New Savings Goal'}
      </h3>

      <!-- Name + emoji row -->
      <div class="form-row">
        <div class="form-group" style="flex:0 0 56px;">
          <label class="form-label">Icon</label>
          <div style="position:relative;">
            <button type="button" class="form-input" id="emojiPickerBtn"
              style="font-size:1.3rem;cursor:pointer;padding:0.4rem;text-align:center;min-width:56px;">
              ${emojiVal}
            </button>
            <input type="hidden" id="gEmoji" value="${emojiVal}" />
            <div id="emojiPicker" class="hidden" style="
              position:absolute;top:100%;left:0;z-index:50;
              background:var(--surface);border:1px solid var(--border);
              border-radius:var(--radius);padding:0.5rem;
              display:flex;flex-wrap:wrap;gap:0.3rem;width:220px;box-shadow:var(--shadow);">
              ${GOAL_EMOJIS.map(e =>
                `<button type="button" class="btn-ghost btn-sm emoji-opt"
                   style="font-size:1.1rem;padding:0.25rem 0.4rem;" data-emoji="${e}">${e}</button>`
              ).join('')}
            </div>
          </div>
        </div>
        <div class="form-group" style="flex:1;">
          <label class="form-label">Goal name</label>
          <input type="text" class="form-input" id="gName"
            value="${existing?.label || ''}" placeholder="e.g. Emergency fund" />
        </div>
        <div class="form-group" style="flex:0 0 56px;">
          <label class="form-label">Colour</label>
          <input type="color" class="form-input" id="gColor"
            value="${colorVal}"
            style="padding:0.3rem;height:38px;cursor:pointer;min-width:48px;" />
        </div>
      </div>

      <!-- Target + contribution -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Target amount</label>
          <input type="number" class="form-input" id="gTarget"
            value="${existing?.target || ''}" placeholder="1000" step="10" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">${isEdit ? 'Contributed so far' : 'Initial contribution'}</label>
          <input type="number" class="form-input" id="gContrib"
            value="${existing?.contributed ?? 0}" placeholder="0" step="1" min="0" />
        </div>
      </div>

      <!-- Deadline + note -->
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Deadline (optional)</label>
          <input type="date" class="form-input" id="gDeadline"
            value="${existing?.deadline || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Note (optional)</label>
          <input type="text" class="form-input" id="gNote"
            value="${noteVal}" placeholder="e.g. Keep in high-yield account" />
        </div>
      </div>

      <div class="flex flex-end gap-1">
        <button class="btn-ghost btn-sm" id="cancelGoalBtn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="saveGoalBtn"
          data-edit-id="${existing?.id || ''}">
          ${isEdit ? 'Save Changes' : 'Create Goal'}
        </button>
      </div>
    `;
  }

  // ── Full goal card (detailed view) ──────────────────────────────────────

  function renderGoalCard(goal, period) {
    const pct      = goal.target > 0 ? Math.min((Number(goal.contributed) / Number(goal.target)) * 100, 100) : 0;
    const done     = Number(goal.contributed) >= Number(goal.target) && Number(goal.target) > 0;
    const reqPer   = requiredPerPeriod(goal, period.endDate);
    const daysLeft = goal.deadline
      ? Math.max(0, Math.round((new Date(goal.deadline + 'T00:00:00') - new Date()) / 86400000))
      : null;
    const color    = goal.color || GOAL_COLORS[0];
    const emoji    = goal.emoji || '◈';

    return `
      <div class="goal-card" style="border-left: 4px solid ${color};" data-goal-id="${goal.id}">
        <div class="goal-header">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span style="font-size:1.3rem;line-height:1;">${emoji}</span>
            <div class="goal-name">${done ? '✓ ' : ''}${goal.label}</div>
          </div>
          <div style="display:flex;gap:0.25rem;align-items:center;">
            <button class="btn-icon" data-edit-goal="${goal.id}" title="Edit goal">✎</button>
            <button class="btn-icon" data-del-goal="${goal.id}" title="Delete goal">✕</button>
          </div>
        </div>

        ${goal.note ? `
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.6rem;
            padding:0.4rem 0.6rem;background:var(--bg);border-radius:4px;
            border-left:3px solid ${color};">
            ${goal.note}
          </div>
        ` : ''}

        ${goal.deadline ? `
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;
            display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
            <span>🗓 Deadline: <strong>${Periods.formatDate(goal.deadline)}</strong></span>
            ${daysLeft !== null ? `<span>${daysLeft} days left</span>` : ''}
            ${reqPer ? `
              <span style="
                background:var(--accent);color:var(--bg);
                font-size:0.72rem;font-weight:600;padding:0.15rem 0.5rem;
                border-radius:999px;">
                ${Data.fmt(reqPer, period)}/period needed
              </span>` : ''}
          </div>
        ` : (reqPer ? `
          <div style="margin-bottom:0.75rem;">
            <span style="
              background:var(--accent);color:var(--bg);
              font-size:0.72rem;font-weight:600;padding:0.15rem 0.5rem;
              border-radius:999px;">
              ${Data.fmt(reqPer, period)}/period needed
            </span>
          </div>
        ` : '')}

        <div class="goal-stats" style="margin-bottom:1rem;">
          <div class="goal-stat">
            <span class="goal-stat-label">Saved</span>
            <span class="goal-stat-value text-accent ${_hidden ? 'blurred' : ''}">
              ${Data.fmt(goal.contributed, period)}
            </span>
          </div>
          <div class="goal-stat">
            <span class="goal-stat-label">Target</span>
            <span class="goal-stat-value ${_hidden ? 'blurred' : ''}">
              ${Data.fmt(goal.target, period)}
            </span>
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

        <!-- ── Add / subtract controls ── -->
        <div style="display:flex;gap:0.6rem;align-items:center;flex-wrap:wrap;">
          <input type="number" data-contrib-input
            placeholder="Amount" step="1" min="0"
            class="form-input"
            style="max-width:140px;font-size:0.85rem;padding:0.4rem 0.65rem;" />
          <button class="btn btn-primary btn-sm" data-add-contrib="${goal.id}">+ Add</button>
          <button class="btn-ghost btn-sm" data-sub-contrib="${goal.id}"
            style="color:var(--danger);border-color:var(--danger);">− Subtract</button>
        </div>
      </div>
    `;
  }

  // ── Compact goal row (slim list view) ───────────────────────────────────

  function renderGoalRow(goal, period) {
    const pct   = goal.target > 0 ? Math.min((Number(goal.contributed) / Number(goal.target)) * 100, 100) : 0;
    const done  = Number(goal.contributed) >= Number(goal.target) && Number(goal.target) > 0;
    const color = goal.color || GOAL_COLORS[0];
    const emoji = goal.emoji || '◈';

    return `
      <div class="goal-card" style="padding:0.75rem 1rem;border-left:4px solid ${color};"
        data-goal-id="${goal.id}">
        <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
          <span style="font-size:1.1rem;">${emoji}</span>
          <span style="flex:1;font-size:0.9rem;font-weight:500;min-width:100px;">
            ${done ? '✓ ' : ''}${goal.label}
          </span>
          <span style="font-family:var(--font-mono);font-size:0.82rem;" class="${_hidden ? 'blurred' : ''}">
            ${Data.fmt(goal.contributed, period)} / ${Data.fmt(goal.target, period)}
          </span>
          <span style="font-size:0.78rem;color:var(--text-muted);min-width:44px;text-align:right;">
            ${pct.toFixed(0)}%
          </span>
          <!-- inline add in compact mode -->
          <div style="display:flex;gap:0.4rem;align-items:center;">
            <input type="number" data-contrib-input
              placeholder="Amt" step="1" min="0"
              class="form-input"
              style="width:80px;font-size:0.8rem;padding:0.3rem 0.5rem;" />
            <button class="btn btn-primary btn-sm" data-add-contrib="${goal.id}" style="padding:0.3rem 0.6rem;">+</button>
            <button class="btn-ghost btn-sm" data-sub-contrib="${goal.id}"
              style="padding:0.3rem 0.6rem;color:var(--danger);border-color:var(--danger);">−</button>
          </div>
          <button class="btn-icon" data-edit-goal="${goal.id}" title="Edit">✎</button>
          <button class="btn-icon" data-del-goal="${goal.id}" title="Delete">✕</button>
        </div>
        <div class="progress-bar" style="height:4px;margin-top:0.5rem;">
          <div class="progress-fill ${done ? 'green' : pct > 66 ? 'green' : 'amber'}"
            style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  }

  // ── Event binding ────────────────────────────────────────────────────────

  function bindEvents(periodId, period) {

    // These buttons live inside innerHTML so they're brand-new each render — safe to re-bind.
    document.getElementById('toggleSavingsVisibility')?.addEventListener('click', () => {
      _hidden = !_hidden;
      render();
    });

    document.getElementById('toggleCompact')?.addEventListener('click', () => {
      _compact = !_compact;
      render();
    });

    document.getElementById('addGoalBtn')?.addEventListener('click', () => {
      const form = document.getElementById('goalForm');
      const wasHidden = form.classList.contains('hidden');
      document.getElementById('editGoalForm')?.classList.add('hidden');
      if (wasHidden) {
        form.innerHTML = renderGoalForm();
        form.classList.remove('hidden');
        bindGoalFormEvents(form, periodId, null);
        document.getElementById('gName')?.focus();
      } else {
        form.classList.add('hidden');
      }
    });

    // ── Delegated click handler — attached ONCE only ──
    // #view-savings is never replaced between renders (only its innerHTML changes).
    // Attaching this listener on every render stacks copies, so every click fires
    // multiple times — that's what caused amounts to multiply (2 → 200 → 800 etc).
    if (_bound) return;
    _bound = true;

    document.getElementById('view-savings')?.addEventListener('click', async (e) => {
      // Always read fresh data — never rely on the periodId/period closed over at render time.
      const currentPeriod = Data.getActivePeriod();
      if (!currentPeriod) return;
      const currentPeriodId = currentPeriod.id;

      // Emoji picker toggle
      if (e.target.closest('#emojiPickerBtn')) {
        document.getElementById('emojiPicker')?.classList.toggle('hidden');
        return;
      }
      // Emoji option selected
      const emojiOpt = e.target.closest('.emoji-opt');
      if (emojiOpt) {
        const val = emojiOpt.dataset.emoji;
        document.getElementById('gEmoji').value = val;
        document.getElementById('emojiPickerBtn').textContent = val;
        document.getElementById('emojiPicker')?.classList.add('hidden');
        return;
      }

      // Edit goal — open edit form below the card
      const editBtn = e.target.closest('[data-edit-goal]');
      if (editBtn) {
        const goalId   = editBtn.dataset.editGoal;
        const goal     = currentPeriod.savingsGoals?.find(g => g.id === goalId);
        if (!goal) return;
        document.getElementById('goalForm')?.classList.add('hidden');
        const editForm = document.getElementById('editGoalForm');
        editForm.innerHTML = renderGoalForm(goal);
        editForm.classList.remove('hidden');
        const card = document.querySelector(`[data-goal-id="${goalId}"]`);
        if (card && card.nextSibling) {
          card.parentNode.insertBefore(editForm, card.nextSibling);
        }
        bindGoalFormEvents(editForm, currentPeriodId, goal.id);
        editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      // Delete goal
      const delBtn = e.target.closest('[data-del-goal]');
      if (delBtn) {
        if (confirm('Delete this savings goal?')) {
          await Data.deleteSavingsGoal(currentPeriodId, delBtn.dataset.delGoal);
          render();
        }
        return;
      }

      // Add contribution
      const addBtn = e.target.closest('[data-add-contrib]');
      if (addBtn) {
        const goalId = addBtn.dataset.addContrib;
        const card   = addBtn.closest('[data-goal-id]');
        const input  = card?.querySelector('[data-contrib-input]');
        const amount = parseFloat(input?.value);
        if (isNaN(amount) || amount <= 0) { input?.focus(); return; }
        const goal = currentPeriod.savingsGoals?.find(g => g.id === goalId);
        if (!goal) return;
        await Data.updateSavingsGoal(currentPeriodId, goalId, {
          contributed: Number(goal.contributed) + amount
        });
        if (input) input.value = '';
        render();
        return;
      }

      // Subtract contribution
      const subBtn = e.target.closest('[data-sub-contrib]');
      if (subBtn) {
        const goalId = subBtn.dataset.subContrib;
        const card   = subBtn.closest('[data-goal-id]');
        const input  = card?.querySelector('[data-contrib-input]');
        const amount = parseFloat(input?.value);
        if (isNaN(amount) || amount <= 0) { input?.focus(); return; }
        const goal = currentPeriod.savingsGoals?.find(g => g.id === goalId);
        if (!goal) return;
        const newVal = Math.max(0, Number(goal.contributed) - amount);
        await Data.updateSavingsGoal(currentPeriodId, goalId, { contributed: newVal });
        if (input) input.value = '';
        render();
      }
    });
  }

  // ── Goal form events (shared between new + edit) ──────────────────────

  function bindGoalFormEvents(formEl, periodId, editId) {
    // Cancel
    formEl.querySelector('#cancelGoalBtn')?.addEventListener('click', () => {
      formEl.classList.add('hidden');
    });

    // Emoji picker (within this form scope)
    formEl.querySelector('#emojiPickerBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      formEl.querySelector('#emojiPicker')?.classList.toggle('hidden');
    });
    formEl.querySelectorAll('.emoji-opt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = btn.dataset.emoji;
        formEl.querySelector('#gEmoji').value = val;
        formEl.querySelector('#emojiPickerBtn').textContent = val;
        formEl.querySelector('#emojiPicker')?.classList.add('hidden');
      });
    });
    // Close emoji picker when clicking outside
    document.addEventListener('click', function closePicker(e) {
      if (!formEl.contains(e.target)) {
        formEl.querySelector('#emojiPicker')?.classList.add('hidden');
        document.removeEventListener('click', closePicker);
      }
    });

    // Save (create or update)
    formEl.querySelector('#saveGoalBtn')?.addEventListener('click', async () => {
      const label       = formEl.querySelector('#gName')?.value.trim();
      const target      = parseFloat(formEl.querySelector('#gTarget')?.value);
      const contributed = parseFloat(formEl.querySelector('#gContrib')?.value) || 0;
      const deadline    = formEl.querySelector('#gDeadline')?.value || null;
      const color       = formEl.querySelector('#gColor')?.value || GOAL_COLORS[0];
      const emoji       = formEl.querySelector('#gEmoji')?.value  || '◈';
      const note        = formEl.querySelector('#gNote')?.value.trim() || '';

      if (!label || isNaN(target) || target <= 0) {
        // highlight missing fields
        if (!label)                formEl.querySelector('#gName')?.classList.add('input-error');
        if (isNaN(target) || target <= 0) formEl.querySelector('#gTarget')?.classList.add('input-error');
        return;
      }

      if (editId) {
        // Editing existing goal
        await Data.updateSavingsGoal(periodId, editId, {
          label, target, contributed, deadline, color, emoji, note
        });
      } else {
        // Creating new goal
        await Data.addSavingsGoal(periodId, {
          id: Data.uid(), label, target, contributed, deadline, color, emoji, note
        });
      }

      formEl.classList.add('hidden');
      render();
    });
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render, totalContributed, totalTarget };
})();
