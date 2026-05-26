// ─── calendar.js — Hour log calendar heatmap ───────────────────────────────

const Calendar = (() => {

  function render() {
    const period = Data.getActivePeriod();
    const el     = document.getElementById('view-calendar');
    if (!period) { el.innerHTML = noPeriod(); return; }

    const entries  = period.income.entries || [];
    const jobs     = Data.getJobs();

    // Build a map: date → { totalHours, entries[] }
    const dayMap = {};
    entries.forEach(e => {
      if (!dayMap[e.date]) dayMap[e.date] = { hours: 0, entries: [] };
      dayMap[e.date].hours   += Number(e.hours);
      dayMap[e.date].entries.push(e);
    });

    // Determine months to show (cover the full period)
    const start  = new Date(period.startDate + 'T00:00:00');
    const end    = new Date(period.endDate   + 'T00:00:00');
    const months = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push(new Date(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    const maxHours = Math.max(...Object.values(dayMap).map(d => d.hours), 1);

    el.innerHTML = `
      <h1 class="page-title">Hour Log Calendar</h1>
      <p class="page-sub">${period.label}</p>

      <!-- Legend -->
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <span style="font-size:0.78rem;color:var(--text-muted);">Hours worked:</span>
        ${[0, 0.25, 0.5, 0.75, 1].map(t => `
          <div style="display:flex;align-items:center;gap:0.3rem;">
            <div style="width:16px;height:16px;border-radius:3px;background:${heatColor(t)};border:1px solid var(--border);"></div>
            <span style="font-size:0.72rem;color:var(--text-muted);">${t === 0 ? '0' : t === 1 ? maxHours.toFixed(0)+'h' : ''}</span>
          </div>
        `).join('')}
        <div style="margin-left:auto;display:flex;gap:1rem;font-size:0.78rem;color:var(--text-muted);">
          <span>Total: <strong style="color:var(--accent2);">${Object.values(dayMap).reduce((s,d)=>s+d.hours,0).toFixed(1)}h</strong></span>
          <span>Days worked: <strong style="color:var(--accent2);">${Object.keys(dayMap).length}</strong></span>
        </div>
      </div>

      <!-- Month grids -->
      ${months.map(month => renderMonth(month, dayMap, maxHours, start, end, jobs)).join('')}

      <!-- Day detail panel -->
      <div id="dayDetail" class="hidden" style="
        background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
        padding:1.25rem;margin-top:1.5rem;">
      </div>
    `;

    // Click handlers on day cells
    el.querySelectorAll('[data-day]').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.dataset.day;
        const dayData = dayMap[dateStr];
        showDayDetail(dateStr, dayData, jobs, period);
      });
    });
  }

  function renderMonth(month, dayMap, maxHours, periodStart, periodEnd, jobs) {
    const year     = month.getFullYear();
    const monthIdx = month.getMonth();
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const firstDow    = new Date(year, monthIdx, 1).getDay(); // 0=Sun
    const startDow    = (firstDow + 6) % 7; // Mon=0

    const monthName = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    let cells = '';
    // Empty cells before month start
    for (let i = 0; i < startDow; i++) {
      cells += `<div class="cal-cell cal-empty"></div>`;
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthIdx+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const inPeriod = dateStr >= Data.toISO(periodStart) && dateStr <= Data.toISO(periodEnd);
      const dayData  = dayMap[dateStr];
      const hours    = dayData?.hours || 0;
      const intensity = maxHours > 0 ? hours / maxHours : 0;
      const today    = dateStr === Periods.todayISO();

      cells += `
        <div class="cal-cell ${inPeriod ? 'in-period' : 'out-period'} ${dayData ? 'has-data' : ''} ${today ? 'today' : ''}"
             data-day="${dateStr}"
             style="${dayData ? `background:${heatColor(intensity)};` : ''}"
             title="${dateStr}${hours > 0 ? ': ' + hours.toFixed(1) + 'h' : ''}">
          <span class="cal-day-num">${d}</span>
          ${hours > 0 ? `<span class="cal-day-hours">${hours.toFixed(1)}h</span>` : ''}
        </div>
      `;
    }

    return `
      <div class="cal-month" style="margin-bottom:2rem;">
        <div class="cal-month-title">${monthName}</div>
        <div class="cal-dow-row">
          ${['Mo','Tu','We','Th','Fr','Sa','Su'].map(d =>
            `<div class="cal-dow">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">${cells}</div>
      </div>
    `;
  }

  function showDayDetail(dateStr, dayData, jobs, period) {
    const el = document.getElementById('dayDetail');
    el.classList.remove('hidden');

    if (!dayData || dayData.entries.length === 0) {
      el.innerHTML = `
        <div style="font-size:0.875rem;color:var(--text-muted);">
          No hours logged on ${Periods.formatDate(dateStr)}.
        </div>`;
      return;
    }

    const totalHours = dayData.hours;
    const wage       = dayData.entries.reduce((s, e) => {
      const job = e.jobId ? Data.getJob(e.jobId) : null;
      return s + (Number(e.hours) * (job ? Number(job.wage) : 0));
    }, 0);

    el.innerHTML = `
      <div style="font-family:var(--font-serif);font-size:1.1rem;margin-bottom:0.75rem;">
        ${Periods.formatDate(dateStr)}
      </div>
      <table class="data-table">
        <thead>
          <tr><th>Job</th><th>Hours</th><th>Earnings</th><th>Note</th></tr>
        </thead>
        <tbody>
          ${dayData.entries.map(e => {
            const job = e.jobId ? Data.getJob(e.jobId) : null;
            return `<tr>
              <td>
                ${job ? `<span style="display:inline-flex;align-items:center;gap:0.4rem;">
                  <span style="width:8px;height:8px;border-radius:50%;background:${job.color};"></span>
                  ${job.name}
                </span>` : '—'}
              </td>
              <td class="mono">${Number(e.hours).toFixed(1)}h</td>
              <td class="mono text-accent">${job ? Data.fmt(e.hours * job.wage, period) : '—'}</td>
              <td class="text-muted">${e.note || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="totals-row">
        <div class="total-item">
          <span class="total-label">Day total:</span>
          <span class="total-value">${totalHours.toFixed(1)}h · ${Data.fmt(wage, period)}</span>
        </div>
      </div>
    `;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Map 0–1 intensity to a color
  function heatColor(t) {
    if (t === 0) return 'transparent';
    // accent2 (#7eb8a4) at low, accent (#c8a96e) at high
    const r = Math.round(126 + (200 - 126) * t);
    const g = Math.round(184 + (169 - 184) * t);
    const b = Math.round(164 + (110 - 164) * t);
    return `rgba(${r},${g},${b},${0.25 + t * 0.65})`;
  }

  function noPeriod() {
    return `<div class="no-period-msg"><h2>No active period</h2><p>Select or create a period first.</p></div>`;
  }

  return { render };
})();
