// ─── income.js — Multi-job income with schedule & suggestions ──────────────

const Income = (() => {

  const JOB_COLORS = ['#c8a96e','#7eb8a4','#a07ec8','#e07070','#7ea8c8','#c8a07e','#7ec87e','#c87ea0'];

  // ── Calculations ───────────────────────────────────────────────────────────

  function totalHours(period) {
    return period.income.entries.reduce((s, e) => s + Number(e.hours), 0);
  }

  function totalIncome(period) {
    return period.income.entries.reduce((s, e) => {
      const wage = entryWage(e, period);
      return s + Number(e.hours) * wage;
    }, 0);
  }

  function entryWage(entry, period) {
    if (entry.jobId) {
      const job = Data.getJob(entry.jobId);
      if (job) return Number(job.wage);
    }
    return 0;
  }

  // Calculate projected hours for a job within a period's date range
  function projectJobHours(job, startDate, endDate) {
    const start   = new Date(startDate + 'T00:00:00');
    const end     = new Date(endDate   + 'T00:00:00');
    const totalDays = Math.round((end - start) / 86400000) + 1;
    const totalWeeks = totalDays / 7;

    const cycleLen = Number(job.weeksOn) + Number(job.weeksOff);
    if (cycleLen <= 0) return 0;

    const repeats   = Number(job.repeatCount) || 999;
    let activeWeeks = 0;
    let week = 0;
    let cycles = 0;

    while (week < totalWeeks && cycles < repeats) {
      const posInCycle = week % cycleLen;
      if (posInCycle < job.weeksOn) activeWeeks += Math.min(1, totalWeeks - week);
      week++;
      if ((week % cycleLen) === 0) cycles++;
    }

    return activeWeeks * Number(job.daysPerWeek) * Number(job.hoursPerDay);
  }

  function projectJobIncome(job, startDate, endDate) {
    return projectJobHours(job, startDate, endDate) * Number(job.wage);
  }

  // ── Suggestion engine ──────────────────────────────────────────────────────

  function getSuggestions(period, projectedTotal) {
    const target = Number(Data.getDB().settings.incomeTarget) || 0;
    if (target === 0 || projectedTotal >= target) return [];

    const gap = target - projectedTotal;
    const jobs = Data.getJobs().filter(j => (period.linkedJobIds || []).includes(j.id));
    const suggestions = [];

    suggestions.push(`You're ${Data.fmt(gap)} short of your ${Data.fmt(target)} target this period.`);

    jobs.forEach(job => {
      const extraHoursNeeded = gap / Number(job.wage);
      const extraDays = Math.ceil(extraHoursNeeded / Number(job.hoursPerDay));
      suggestions.push(`At ${job.name}: add ${extraHoursNeeded.toFixed(1)}h (~${extraDays} extra day${extraDays !== 1 ? 's' : ''}) to close the gap.`);
    });

    if (jobs.length === 0)
      suggestions.push('Link a job to this period to see specific shift suggestions.');

    suggestions.push('Consider linking an additional job to this period for extra income.');

    return suggestions;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    const period = Data.getActivePeriod();
    const el = document.getElementById('view-income');
    if (!period) { el.innerHTML = noPeriod(); return; }

    const allJobs    = Data.getJobs();
    const linkedIds  = period.linkedJobIds || [];
    const linkedJobs = allJobs.filter(j => linkedIds.includes(j.id));
    const entries    = period.income.entries;
    const target     = Number(Data.getDB().settings.incomeTarget) || 0;

    // Projected income from schedules
    const projected = linkedJobs.reduce((s, j) =>
      s + projectJobIncome(j, period.startDate, period.endDate), 0);

    // Actual income
    const actual = totalIncome(period);
    const suggestions = getSuggestions(period, projected);

    el.innerHTML = `
      <h1 class="page-title">Income</h1>
      <p class="page-sub">${period.label}</p>

      <!-- Income target -->
      <div class="card" style="margin-bottom:1rem;">
        <div class="card-title">Monthly income target</div>
        <div class="flex gap-1" style="align-items:center;max-width:320px;">
          <input type="number" id="targetInput" class="form-input"
            value="${target || ''}" placeholder="e.g. 2000" step="50" min="0" />
          <button class="btn btn-primary btn-sm" id="saveTargetBtn">Save</button>
        </div>
      </div>

      <!-- Suggestion bar -->
      ${suggestions.length > 0 ? `
        <div class="suggestion-bar" id="suggestionBar">
          <div class="suggestion-header">
            <span class="suggestion-icon">💡</span>
            <span class="suggestion-title">Suggestions to reach your target</span>
            <button class="suggestion-toggle" id="toggleSugg">▾</button>
          </div>
          <ul class="suggestion-list" id="suggList">
            ${suggestions.map(s => `<li>${s}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Summary row -->
      <div class="summary-grid" style="margin-bottom:1.5rem;">
        <div class="summary-card">
          <div class="summary-label">Projected income</div>
          <div class="summary-amount text-accent">${Data.fmt(projected, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">From schedules</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Actual logged</div>
          <div class="summary-amount text-green">${Data.fmt(actual, period)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">${totalHours(period).toFixed(1)}h worked</div>
        </div>
        ${target > 0 ? `
          <div class="summary-card">
            <div class="summary-label">vs. target</div>
            <div class="summary-amount ${projected >= target ? 'text-green' : 'text-red'}">
              ${projected >= target ? '+' : ''}${Data.fmt(projected - target, period)}
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">${target > 0 ? Math.round(projected/target*100) : 0}% of target</div>
          </div>
        ` : ''}
      </div>

      <!-- Job manager -->
      <div class="section-header">
        <span class="section-title">Jobs</span>
        <button class="btn btn-primary btn-sm" id="addJobBtn">+ New Job</button>
      </div>

      <div id="jobForm" class="inline-form hidden">
        ${renderJobForm()}
      </div>

      <div id="jobList" style="margin-bottom:1.5rem;">
        ${allJobs.length === 0
          ? `<p class="text-muted" style="font-size:0.85rem;padding:0.5rem 0;">No jobs defined yet. Create one above.</p>`
          : allJobs.map(j => renderJobCard(j, linkedIds, period)).join('')
        }
      </div>

      <!-- Log hours -->
      <div class="section-header">
        <span class="section-title">Log hours</span>
        <button class="btn btn-primary btn-sm" id="addEntryBtn">+ Log hours</button>
      </div>

      <div id="entryForm" class="inline-form hidden">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Job</label>
            <select class="form-select" id="eJob">
              <option value="">— select job —</option>
              ${allJobs.map(j => `<option value="${j.id}">${j.name} (${Data.fmt(j.wage, period)}/h)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input type="date" class="form-input" id="eDate" value="${Periods.todayISO()}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Hours</label>
            <input type="number" class="form-input" id="eHours" placeholder="8" step="0.5" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Note (optional)</label>
            <input type="text" class="form-input" id="eNote" placeholder="e.g. Overtime" />
          </div>
        </div>
        <div class="flex flex-end gap-1">
          <button class="btn-ghost btn-sm" id="cancelEntryBtn">Cancel</button>
          <button class="btn btn-primary btn-sm" id="saveEntryBtn">Add Entry</button>
        </div>
      </div>

      <!-- Entries table -->
      <div class="card" style="padding:0;overflow:hidden;">
        ${entries.length === 0
          ? `<div class="empty-state" style="padding:2.5rem;">
               <div class="empty-icon">↑</div>
               <h3>No hours logged</h3>
               <p>Log your hours for this period above.</p>
             </div>`
          : `<table class="data-table">
              <thead>
                <tr><th>Date</th><th>Job</th><th>Hours</th><th>Earnings</th><th>Note</th><th></th></tr>
              </thead>
              <tbody>
                ${[...entries].sort((a,b) => b.date.localeCompare(a.date)).map(e => {
                  const job  = e.jobId ? Data.getJob(e.jobId) : null;
                  const wage = job ? Number(job.wage) : 0;
                  return `<tr>
                    <td class="mono text-muted">${Periods.formatDate(e.date)}</td>
                    <td>
                      ${job ? `<span style="display:inline-flex;align-items:center;gap:0.4rem;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${job.color};display:inline-block;"></span>
                        ${job.name}
                      </span>` : '<span class="text-muted">—</span>'}
                    </td>
                    <td class="mono">${Number(e.hours).toFixed(1)}h</td>
                    <td class="mono text-accent">${Data.fmt(e.hours * wage, period)}</td>
                    <td class="text-muted" style="font-size:0.82rem;">${e.note || '—'}</td>
                    <td><button class="btn-icon" data-del-entry="${e.id}">✕</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            <div class="totals-row">
              <div class="total-item">
                <span class="total-label">Total hours:</span>
                <span class="total-value">${totalHours(period).toFixed(1)}h</span>
              </div>
              <div class="total-item">
                <span class="total-label">Total income:</span>
                <span class="total-value text-green">${Data.fmt(actual, period)}</span>
              </div>
            </div>`
        }
      </div>
    `;

    bindEvents(period.id);
  }

  function renderJobForm(job = null) {
    const isEdit = !!job;
    return `
      <h3 style="font-family:var(--font-serif);font-size:1.1rem;margin-bottom:1rem;">
        ${isEdit ? 'Edit' : 'New'} Job
      </h3>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Job name</label>
          <input type="text" class="form-input" id="jName" value="${job?.name || ''}" placeholder="e.g. Café weekend" />
        </div>
        <div class="form-group">
          <label class="form-label">Hourly wage (${Data.currency()})</label>
          <input type="number" class="form-input" id="jWage" value="${job?.wage || ''}" placeholder="15.00" step="0.5" min="0" />
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-group">
          <label class="form-label">Days / week</label>
          <input type="number" class="form-input" id="jDays" value="${job?.daysPerWeek || 5}" min="1" max="7" step="1" />
        </div>
        <div class="form-group">
          <label class="form-label">Hours / day</label>
          <input type="number" class="form-input" id="jHours" value="${job?.hoursPerDay || 8}" min="0.5" max="24" step="0.5" />
        </div>
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" class="form-input" id="jColor"
            value="${job?.color || JOB_COLORS[Data.getJobs().length % JOB_COLORS.length]}"
            style="padding:0.3rem;height:38px;cursor:pointer;" />
        </div>
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:1rem;margin-bottom:1rem;">
        <div style="font-size:0.72rem;color:var(--accent);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:0.75rem;font-weight:600;">
          Work pattern (weeks on / off cycle)
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Weeks active</label>
            <input type="number" class="form-input" id="jWeeksOn" value="${job?.weeksOn || 1}" min="1" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Weeks break</label>
            <input type="number" class="form-input" id="jWeeksOff" value="${job?.weeksOff || 0}" min="0" step="1" />
          </div>
          <div class="form-group">
            <label class="form-label">Repeat cycles</label>
            <input type="number" class="form-input" id="jRepeat" value="${job?.repeatCount || 0}"
              min="0" step="1" placeholder="0 = forever" title="0 means no limit" />
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">
          Example: 3 weeks on, 1 week off, repeat 4× = 3+1 cycle, 4 times then stops.
          Set break to 0 for continuous work. Set repeat to 0 for no limit.
        </div>
      </div>
      <div class="flex flex-end gap-1">
        <button class="btn-ghost btn-sm" id="cancelJobBtn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="saveJobBtn" data-edit="${job?.id || ''}">
          ${isEdit ? 'Update' : 'Create'} Job
        </button>
      </div>
    `;
  }

  function renderJobCard(job, linkedIds, period) {
    const linked   = linkedIds.includes(job.id);
    const projHrs  = projectJobHours(job, period.startDate, period.endDate);
    const projInc  = projHrs * Number(job.wage);
    const pattern  = job.weeksOff > 0
      ? `${job.weeksOn}w on / ${job.weeksOff}w off${job.repeatCount > 0 ? ` × ${job.repeatCount}` : ''}`
      : `${job.daysPerWeek}d/w continuous`;

    return `
      <div class="job-card ${linked ? 'job-linked' : ''}" data-job-id="${job.id}"
           style="border-left-color:${job.color};">
        <div class="job-card-top">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span style="width:10px;height:10px;border-radius:50%;background:${job.color};flex-shrink:0;"></span>
            <span class="job-name">${job.name}</span>
            <span class="job-wage">${Data.fmt(job.wage, period)}/h</span>
          </div>
          <div class="flex gap-1">
            <button class="btn-icon edit" data-edit-job="${job.id}" title="Edit">✎</button>
            <button class="btn-icon" data-del-job="${job.id}" title="Delete">✕</button>
          </div>
        </div>
        <div class="job-card-meta">
          <span>${job.daysPerWeek}d/w · ${job.hoursPerDay}h/d</span>
          <span>Pattern: ${pattern}</span>
          <span>Projected this period: <strong class="text-accent">${Data.fmt(projInc, period)}</strong> (${projHrs.toFixed(1)}h)</span>
        </div>
        <div style="margin-top:0.75rem;">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.82rem;color:var(--text-muted);">
            <input type="checkbox" data-link-job="${job.id}" ${linked ? 'checked' : ''}
              style="accent-color:var(--accent);width:15px;height:15px;" />
            Link to this period
          </label>
        </div>
      </div>
    `;
  }

  function bindEvents(periodId) {
    // Target
    document.getElementById('saveTargetBtn')?.addEventListener('click', async () => {
      const t = parseFloat(document.getElementById('targetInput').value);
      if (!isNaN(t)) { await Data.setSettings({ incomeTarget: t }); render(); }
    });

    // Suggestion toggle
    document.getElementById('toggleSugg')?.addEventListener('click', () => {
      const list = document.getElementById('suggList');
      const btn  = document.getElementById('toggleSugg');
      list.classList.toggle('hidden');
      btn.textContent = list.classList.contains('hidden') ? '▸' : '▾';
    });

    // Add job form
    document.getElementById('addJobBtn')?.addEventListener('click', () => {
      const form = document.getElementById('jobForm');
      form.innerHTML = renderJobForm();
      form.classList.toggle('hidden');
      bindJobFormEvents(periodId, null);
    });

    // Edit job
    document.getElementById('view-income')?.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-edit-job]');
      if (editBtn) {
        const job  = Data.getJob(editBtn.dataset.editJob);
        const form = document.getElementById('jobForm');
        form.innerHTML = renderJobForm(job);
        form.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        bindJobFormEvents(periodId, job.id);
        return;
      }

      // Delete job
      const delJob = e.target.closest('[data-del-job]');
      if (delJob) {
        if (confirm('Delete this job?')) { await Data.deleteJob(delJob.dataset.delJob); render(); }
        return;
      }

      // Link toggle
      const linkChk = e.target.closest('[data-link-job]');
      if (linkChk) {
        const jid    = linkChk.dataset.linkJob;
        const period = Data.getActivePeriod();
        let linked   = [...(period.linkedJobIds || [])];
        if (linkChk.checked) { if (!linked.includes(jid)) linked.push(jid); }
        else linked = linked.filter(id => id !== jid);
        await Data.updatePeriod(period.id, { linkedJobIds: linked });
        render();
        return;
      }

      // Delete entry
      const delEntry = e.target.closest('[data-del-entry]');
      if (delEntry) {
        await Data.deleteIncomeEntry(periodId, delEntry.dataset.delEntry);
        render();
      }
    });

    // Log hours
    document.getElementById('addEntryBtn')?.addEventListener('click', () => {
      document.getElementById('entryForm').classList.toggle('hidden');
    });
    document.getElementById('cancelEntryBtn')?.addEventListener('click', () => {
      document.getElementById('entryForm').classList.add('hidden');
    });
    document.getElementById('saveEntryBtn')?.addEventListener('click', async () => {
      const jobId = document.getElementById('eJob').value;
      const date  = document.getElementById('eDate').value;
      const hours = parseFloat(document.getElementById('eHours').value);
      const note  = document.getElementById('eNote').value.trim();
      if (!date || isNaN(hours) || hours <= 0) return;
      await Data.addIncomeEntry(periodId, { id: Data.uid(), jobId, date, hours, note });
      document.getElementById('entryForm').classList.add('hidden');
      render();
    });
  }

  function bindJobFormEvents(periodId, editId) {
    document.getElementById('cancelJobBtn')?.addEventListener('click', () => {
      document.getElementById('jobForm').classList.add('hidden');
    });
    document.getElementById('saveJobBtn')?.addEventListener('click', async () => {
      const name        = document.getElementById('jName').value.trim();
      const wage        = parseFloat(document.getElementById('jWage').value);
      const daysPerWeek = parseFloat(document.getElementById('jDays').value);
      const hoursPerDay = parseFloat(document.getElementById('jHours').value);
      const weeksOn     = parseInt(document.getElementById('jWeeksOn').value);
      const weeksOff    = parseInt(document.getElementById('jWeeksOff').value);
      const repeatCount = parseInt(document.getElementById('jRepeat').value);
      const color       = document.getElementById('jColor').value;
      if (!name || isNaN(wage)) return;
      const jobData = { name, wage, daysPerWeek, hoursPerDay, weeksOn, weeksOff, repeatCount, color };
      if (editId) await Data.updateJob(editId, jobData);
      else await Data.addJob({ id: Data.uid(), ...jobData });
      document.getElementById('jobForm').classList.add('hidden');
      render();
    });
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render, totalIncome, totalHours, projectJobIncome };
})();
