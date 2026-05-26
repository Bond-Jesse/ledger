// ─── periods.js — Period management v2 ─────────────────────────────────────

const Periods = (() => {

  function toISO(date) { return date.toISOString().slice(0, 10); }

  function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function todayISO() { return toISO(new Date()); }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function lengthDays(type) {
    return { weekly: 7, biweekly: 14, monthly: 30, custom: 7 }[type] || 7;
  }

  function autoEndDate(startDate, days) {
    return addDays(startDate, days - 1);
  }

  function autoLabel(type, startDate, customDays) {
    const d = new Date(startDate + 'T00:00:00');
    switch (type) {
      case 'weekly':    return `Week of ${formatDate(startDate)}`;
      case 'biweekly':  return `Fortnight of ${formatDate(startDate)}`;
      case 'monthly':   return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      default:          return `${customDays}-day period from ${formatDate(startDate)}`;
    }
  }

  // ── Auto-generate periods from a job pattern ───────────────────────────────
  // Returns array of period shells (not yet saved)
  function generatePeriodsFromJob(job, startDate, periodLengthDays, count) {
    const periods = [];
    let cursor = startDate;
    for (let i = 0; i < count; i++) {
      const end  = autoEndDate(cursor, periodLengthDays);
      const lbl  = `Auto: ${formatDate(cursor)} → ${formatDate(end)}`;
      const shell = Data.newPeriodShell(lbl, 'custom', cursor, end, {
        linkedJobIds: [job.id],
        color: job.color
      });
      periods.push(shell);
      cursor = addDays(end, 1);
    }
    return periods;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    const el      = document.getElementById('view-periods');
    const periods = Data.getPeriods();
    const active  = Data.getActivePeriod();
    const jobs    = Data.getJobs();

    el.innerHTML = `
      <h1 class="page-title">Periods</h1>
      <p class="page-sub">Each period is a time window you track separately.</p>

      <div class="section-header">
        <span></span>
        <div class="flex gap-1">
          <button class="btn-ghost btn-sm" id="autoGenBtn">⚡ Auto-generate</button>
          <button class="btn btn-primary btn-sm" id="addPeriodBtn">+ Add Period</button>
        </div>
      </div>

      <!-- Manual add form -->
      <div id="addPeriodForm" class="inline-form hidden">
        ${renderAddForm(periods, jobs)}
      </div>

      <!-- Auto-generate form -->
      <div id="autoGenForm" class="inline-form hidden">
        ${renderAutoGenForm(jobs)}
      </div>

      ${periods.length === 0
        ? `<div class="empty-state">
             <div class="empty-icon">⊞</div>
             <h3>No periods yet</h3>
             <p>Create your first period to start tracking.</p>
           </div>`
        : `<div class="period-grid" id="periodGrid">
             ${periods.map(p => renderPeriodCard(p, active?.id)).join('')}
           </div>`
      }
    `;

    bindEvents();
  }

  function renderAddForm(allPeriods, jobs) {
    const today = todayISO();
    return `
      <h3 style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:1rem;">New Period</h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="pType">
            <option value="weekly">Weekly (7 days)</option>
            <option value="biweekly">Bi-weekly (14 days)</option>
            <option value="monthly">Monthly (30 days)</option>
            <option value="custom">Custom length</option>
          </select>
        </div>
        <div class="form-group" id="customDaysWrap" style="display:none;">
          <label class="form-label">Length (days)</label>
          <input type="number" class="form-input" id="pDays" value="7" min="1" max="365" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start date</label>
          <input type="date" class="form-input" id="pStart" value="${today}" />
        </div>
        <div class="form-group">
          <label class="form-label">End date</label>
          <input type="date" class="form-input" id="pEnd" value="${autoEndDate(today, 7)}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Label (optional)</label>
          <input type="text" class="form-input" id="pLabel" placeholder="Auto-generated if empty" />
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" class="form-input" id="pColor" value="#c8a96e"
            style="padding:0.3rem;height:38px;cursor:pointer;" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Tags (comma separated)</label>
        <input type="text" class="form-input" id="pTags" placeholder="e.g. busy, holiday, side-hustle" />
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select class="form-select" id="pCurrency" style="max-width:160px;">
          ${['€','$','£','CHF','SEK','NOK','DKK'].map(c =>
            `<option value="${c}" ${c === Data.currency() ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Link jobs to this period</label>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          ${Data.getJobs().map(j => `
            <label style="display:flex;align-items:center;gap:0.35rem;cursor:pointer;font-size:0.82rem;
              background:var(--bg);border:1px solid var(--border);border-radius:5px;padding:0.3rem 0.6rem;">
              <input type="checkbox" name="pJob" value="${j.id}"
                style="accent-color:${j.color};width:13px;height:13px;" />
              <span style="width:8px;height:8px;border-radius:50%;background:${j.color};display:inline-block;"></span>
              ${j.name}
            </label>
          `).join('') || '<span class="text-muted" style="font-size:0.82rem;">No jobs yet — create one in Income.</span>'}
        </div>
      </div>
      ${allPeriods.length > 0 ? `
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.82rem;">
            <input type="checkbox" id="pCopyPrev"
              style="accent-color:var(--accent);width:14px;height:14px;" />
            Copy settings from most recent period (budget caps, savings goals, linked jobs)
          </label>
        </div>
      ` : ''}
      <div class="flex flex-end gap-1 mt-2">
        <button class="btn-ghost btn-sm" id="cancelPeriodBtn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="savePeriodBtn">Create Period</button>
      </div>
    `;
  }

  function renderAutoGenForm(jobs) {
    if (jobs.length === 0) return `
      <p class="text-muted" style="font-size:0.85rem;">
        No jobs defined yet. Create a job in Income first, then auto-generate periods from its schedule.
      </p>
      <div class="flex flex-end mt-2">
        <button class="btn-ghost btn-sm" id="cancelAutoGen">Cancel</button>
      </div>`;

    return `
      <h3 style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:1rem;">Auto-generate Periods</h3>
      <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem;">
        Generate consecutive periods automatically from a job's schedule.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Job to use</label>
          <select class="form-select" id="agJob">
            ${jobs.map(j => `<option value="${j.id}">${j.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Period length (days)</label>
          <input type="number" class="form-input" id="agDays" value="7" min="1" max="365" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Start date</label>
          <input type="date" class="form-input" id="agStart" value="${todayISO()}" />
        </div>
        <div class="form-group">
          <label class="form-label">Number of periods to generate</label>
          <input type="number" class="form-input" id="agCount" value="4" min="1" max="52" />
        </div>
      </div>
      <div id="agPreview" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem;"></div>
      <div class="flex flex-end gap-1">
        <button class="btn-ghost btn-sm" id="cancelAutoGen">Cancel</button>
        <button class="btn btn-primary btn-sm" id="confirmAutoGen">Generate Periods</button>
      </div>
    `;
  }

  function renderPeriodCard(period, activeId) {
    const isActive = period.id === activeId;
    const typeMap  = { weekly:'Weekly', biweekly:'Bi-weekly', monthly:'Monthly', custom:'Custom' };
    const tags     = (period.tags || []).filter(Boolean);
    const jobs     = (period.linkedJobIds || []).map(id => Data.getJob(id)).filter(Boolean);

    return `
      <div class="period-card ${isActive ? 'active-period' : ''}" data-id="${period.id}"
           style="border-left: 3px solid ${period.color || '#c8a96e'};">
        <div class="period-card-actions">
          <button class="btn-icon" data-delete="${period.id}" title="Delete">✕</button>
        </div>
        <div class="period-card-type">${typeMap[period.type] || period.type}</div>
        <div class="period-card-label">${period.label}</div>
        <div class="period-card-dates">${formatDate(period.startDate)} → ${formatDate(period.endDate)}</div>
        ${tags.length > 0 ? `
          <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.3rem;">
            ${tags.map(t => `<span style="font-size:0.65rem;background:var(--surface2);border:1px solid var(--border);
              border-radius:3px;padding:0.15rem 0.4rem;color:var(--text-muted);">${t}</span>`).join('')}
          </div>` : ''}
        ${jobs.length > 0 ? `
          <div style="margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.35rem;">
            ${jobs.map(j => `<span style="font-size:0.7rem;display:inline-flex;align-items:center;gap:0.3rem;">
              <span style="width:7px;height:7px;border-radius:50%;background:${j.color};"></span>
              ${j.name}
            </span>`).join('')}
          </div>` : ''}
        ${isActive ? `<div style="margin-top:0.75rem;font-size:0.68rem;color:var(--accent);font-weight:600;letter-spacing:0.08em;">● ACTIVE</div>` : ''}
      </div>
    `;
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  function bindEvents() {
    // Toggle forms
    document.getElementById('addPeriodBtn')?.addEventListener('click', () => {
      document.getElementById('addPeriodForm').classList.toggle('hidden');
      document.getElementById('autoGenForm').classList.add('hidden');
    });
    document.getElementById('autoGenBtn')?.addEventListener('click', () => {
      document.getElementById('autoGenForm').classList.toggle('hidden');
      document.getElementById('addPeriodForm').classList.add('hidden');
      bindAutoGenEvents();
    });
    document.getElementById('cancelPeriodBtn')?.addEventListener('click', () => {
      document.getElementById('addPeriodForm').classList.add('hidden');
    });

    // Type change → update end date
    const pType  = document.getElementById('pType');
    const pStart = document.getElementById('pStart');
    const pEnd   = document.getElementById('pEnd');
    const pDays  = document.getElementById('pDays');
    const customWrap = document.getElementById('customDaysWrap');

    function syncEnd() {
      const type  = pType?.value;
      const start = pStart?.value;
      if (!start) return;
      customWrap.style.display = type === 'custom' ? '' : 'none';
      const days = type === 'custom' ? (parseInt(pDays?.value) || 7) : lengthDays(type);
      if (pEnd) pEnd.value = autoEndDate(start, days);
    }

    pType?.addEventListener('change', syncEnd);
    pStart?.addEventListener('change', syncEnd);
    pDays?.addEventListener('input', syncEnd);

    // Save period
    document.getElementById('savePeriodBtn')?.addEventListener('click', async () => {
      const type  = pType.value;
      const start = pStart.value;
      const end   = pEnd.value;
      if (!start || !end) return;

      const days     = parseInt(pDays?.value) || lengthDays(type);
      const label    = document.getElementById('pLabel').value.trim() || autoLabel(type, start, days);
      const color    = document.getElementById('pColor').value;
      const currency = document.getElementById('pCurrency').value;
      const tags     = document.getElementById('pTags').value.split(',').map(t => t.trim()).filter(Boolean);
      const linkedJobIds = [...document.querySelectorAll('input[name="pJob"]:checked')].map(c => c.value);
      const copyPrev = document.getElementById('pCopyPrev')?.checked;

      let shell = Data.newPeriodShell(label, type, start, end, { color, tags, linkedJobIds, currency });

      if (copyPrev) {
        const periods = Data.getPeriods();
        if (periods.length > 0) shell = Data.copyFromPeriod(periods[0], shell);
      }

      await Data.addPeriod(shell);
      await Data.setActivePeriod(shell.id);
      await Data.injectRecurring(shell.id);
      App.refresh();
    });

    // Period grid
    document.getElementById('periodGrid')?.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delete]');
      if (del) {
        if (confirm('Delete this period and all its data?')) { 
          await Data.deletePeriod(del.dataset.delete);
          App.refresh();
        }
        return;
      }
      const card = e.target.closest('.period-card');
      if (card && !e.target.closest('button')) {
        await Data.setActivePeriod(card.dataset.id);
        App.refresh();
      }
    });
  }

  function bindAutoGenEvents() {
    document.getElementById('cancelAutoGen')?.addEventListener('click', () => {
      document.getElementById('autoGenForm').classList.add('hidden');
    });

    function updatePreview() {
      const preview = document.getElementById('agPreview');
      if (!preview) return;
      const count = parseInt(document.getElementById('agCount')?.value) || 0;
      const days  = parseInt(document.getElementById('agDays')?.value) || 7;
      const start = document.getElementById('agStart')?.value;
      if (!start) return;
      const end = autoEndDate(addDays(start, days * count - 1), 1);
      preview.textContent = `Will create ${count} periods of ${days} days each, ending ${formatDate(end)}.`;
    }

    ['agCount','agDays','agStart','agJob'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updatePreview);
      document.getElementById(id)?.addEventListener('change', updatePreview);
    });
    updatePreview();

    document.getElementById('confirmAutoGen')?.addEventListener('click', async () => {
      const jobId = document.getElementById('agJob').value;
      const job   = Data.getJob(jobId);
      if (!job) return;
      const days  = parseInt(document.getElementById('agDays').value) || 7;
      const start = document.getElementById('agStart').value;
      const count = parseInt(document.getElementById('agCount').value) || 4;
      if (!start || count < 1) return;

      const shells = generatePeriodsFromJob(job, start, days, count);
      // Add in reverse so newest ends up first
      [...shells].reverse().forEach(s => {
        await Data.addPeriod(s);
        await Data.injectRecurring(s.id);
      });
      if (shells.length > 0) await Data.setActivePeriod(shells[0].id);
      App.refresh();
    });
  }

  return { render, formatDate, todayISO };
})();
