// ─── data.js — Data layer v3 (Firestore-backed) ────────────────────────────
// All function signatures identical to v2 — other modules need no changes.
// Internally uses FB.loadDB / FB.saveDB instead of localStorage.

const Data = (() => {

  // In-memory cache — loaded once on login, written back on every mutation
  let _cache = null;

  async function init() {
    _cache = await FB.loadDB();
  }

  function _get() {
    if (!_cache) _cache = FB.defaultDB();
    return _cache;
  }

  async function _save() {
    await FB.saveDB(_cache);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  function getDB()           { return _get(); }

  async function setSettings(patch) {
    _get().settings = { ..._get().settings, ...patch };
    await _save();
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  function getJobs()    { return _get().jobs || []; }
  function getJob(id)   { return getJobs().find(j => j.id === id) || null; }

  async function addJob(job) {
    _get().jobs.push({ ...job, id: job.id || uid() });
    await _save();
  }

  async function updateJob(id, patch) {
    const db = _get();
    const i  = db.jobs.findIndex(j => j.id === id);
    if (i === -1) return;
    db.jobs[i] = { ...db.jobs[i], ...patch };
    await _save();
  }

  async function deleteJob(id) {
    const db = _get();
    db.jobs = db.jobs.filter(j => j.id !== id);
    db.periods.forEach(p => {
      p.linkedJobIds = (p.linkedJobIds || []).filter(jid => jid !== id);
      p.income.entries = p.income.entries.filter(e => e.jobId !== id);
    });
    await _save();
  }

  // ── Categories ────────────────────────────────────────────────────────────
  function getCategories() { return _get().categories || []; }

  async function addCategory(name) {
    if (!_get().categories.includes(name)) _get().categories.push(name);
    await _save();
  }

  async function renameCategory(oldName, newName) {
    const db = _get();
    const i  = db.categories.indexOf(oldName);
    if (i !== -1) db.categories[i] = newName;
    db.periods.forEach(p => {
      p.expenses.forEach(e => { if (e.category === oldName) e.category = newName; });
      if (p.budget.categoryCaps?.[oldName] !== undefined) {
        p.budget.categoryCaps[newName] = p.budget.categoryCaps[oldName];
        delete p.budget.categoryCaps[oldName];
      }
    });
    await _save();
  }

  async function deleteCategory(name) {
    _get().categories = _get().categories.filter(c => c !== name);
    await _save();
  }

  // ── Recurring expenses ────────────────────────────────────────────────────
  function getRecurring() { return _get().recurringExpenses || []; }

  async function addRecurring(rec) {
    _get().recurringExpenses.push({ ...rec, id: rec.id || uid() });
    await _save();
  }

  async function updateRecurring(id, patch) {
    const db = _get();
    const i  = db.recurringExpenses.findIndex(r => r.id === id);
    if (i === -1) return;
    db.recurringExpenses[i] = { ...db.recurringExpenses[i], ...patch };
    await _save();
  }

  async function deleteRecurring(id) {
    _get().recurringExpenses = _get().recurringExpenses.filter(r => r.id !== id);
    await _save();
  }

  async function injectRecurring(periodId) {
    const db    = _get();
    const p     = db.periods.find(p => p.id === periodId);
    if (!p) return;
    const recs  = db.recurringExpenses;
    const start = new Date(p.startDate + 'T00:00:00');
    const end   = new Date(p.endDate   + 'T00:00:00');

    recs.forEach(rec => {
      const alreadyInjected = p.expenses.some(e => e.recurringId === rec.id);
      if (alreadyInjected) return;

      if (rec.frequency === 'per-period') {
        p.expenses.push({ id: uid(), date: p.startDate, amount: rec.amount,
          category: rec.category, note: rec.note || rec.name, recurringId: rec.id, auto: true });
      } else if (rec.frequency === 'monthly') {
        const dom = rec.dayOfMonth || 1;
        let d = new Date(start.getFullYear(), start.getMonth(), dom);
        while (d <= end) {
          if (d >= start) {
            p.expenses.push({ id: uid(), date: toISO(d), amount: rec.amount,
              category: rec.category, note: rec.note || rec.name, recurringId: rec.id, auto: true });
          }
          d = new Date(d.getFullYear(), d.getMonth() + 1, dom);
        }
      } else if (rec.frequency === 'weekly') {
        let d = new Date(start);
        while (d <= end) {
          p.expenses.push({ id: uid(), date: toISO(d), amount: rec.amount,
            category: rec.category, note: rec.note || rec.name, recurringId: rec.id, auto: true });
          d.setDate(d.getDate() + 7);
        }
      }
    });
    await _save();
  }

  // ── Periods ───────────────────────────────────────────────────────────────
  function getPeriods()  { return _get().periods || []; }
  function getPeriod(id) { return getPeriods().find(p => p.id === id) || null; }

  function getActivePeriod() {
    const db = _get();
    return db.periods.find(p => p.id === db.activePeriodId) || null;
  }

  async function setActivePeriod(id) {
    _get().activePeriodId = id;
    await _save();
  }

  async function addPeriod(period) {
    const db = _get();
    db.periods.unshift(period);
    if (!db.activePeriodId) db.activePeriodId = period.id;
    await _save();
    return period;
  }

  async function updatePeriod(id, patch) {
    const db = _get();
    const i  = db.periods.findIndex(p => p.id === id);
    if (i === -1) return;
    db.periods[i] = { ...db.periods[i], ...patch };
    await _save();
  }

  async function deletePeriod(id) {
    const db = _get();
    db.periods = db.periods.filter(p => p.id !== id);
    if (db.activePeriodId === id) db.activePeriodId = db.periods[0]?.id || null;
    await _save();
  }

  // ── Income entries ────────────────────────────────────────────────────────
  async function addIncomeEntry(periodId, entry) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.income.entries.push(entry);
    await _save();
  }

  async function deleteIncomeEntry(periodId, entryId) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.income.entries = p.income.entries.filter(e => e.id !== entryId);
    await _save();
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  async function addExpense(periodId, expense) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.expenses.push(expense);
    await _save();
  }

  async function deleteExpense(periodId, expenseId) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.expenses = p.expenses.filter(e => e.id !== expenseId);
    await _save();
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  async function setBudget(periodId, cap) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.budget.cap = cap;
    await _save();
  }

  async function setCategoryCap(periodId, category, cap) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    if (!p.budget.categoryCaps) p.budget.categoryCaps = {};
    p.budget.categoryCaps[category] = cap;
    await _save();
  }

  async function deleteCategoryCap(periodId, category) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p || !p.budget.categoryCaps) return;
    delete p.budget.categoryCaps[category];
    await _save();
  }

  // ── Savings ───────────────────────────────────────────────────────────────
  async function addSavingsGoal(periodId, goal) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.savingsGoals.push(goal);
    await _save();
  }

  async function updateSavingsGoal(periodId, goalId, patch) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    const i = p.savingsGoals.findIndex(g => g.id === goalId);
    if (i === -1) return;
    p.savingsGoals[i] = { ...p.savingsGoals[i], ...patch };
    await _save();
  }

  async function deleteSavingsGoal(periodId, goalId) {
    const p = _get().periods.find(p => p.id === periodId);
    if (!p) return;
    p.savingsGoals = p.savingsGoals.filter(g => g.id !== goalId);
    await _save();
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function toISO(date) { return date.toISOString().slice(0, 10); }

  function currency(period) {
    if (period?.currency) return period.currency;
    return _get().settings?.currency || '€';
  }

  function fmt(amount, period) {
    return `${currency(period)}${Number(amount).toFixed(2)}`;
  }

  function newPeriodShell(label, type, startDate, endDate, opts = {}) {
    const db = _get();
    return {
      id: uid(), label, type, startDate, endDate,
      color:        opts.color || '#c8a96e',
      tags:         opts.tags || [],
      linkedJobIds: opts.linkedJobIds || [],
      currency:     opts.currency || db.settings?.currency || '€',
      income:       { entries: [] },
      expenses:     [],
      budget:       { cap: 0, categoryCaps: {} },
      savingsGoals: []
    };
  }

  function copyFromPeriod(sourcePeriod, newShell) {
    newShell.linkedJobIds = [...(sourcePeriod.linkedJobIds || [])];
    newShell.color        = sourcePeriod.color;
    newShell.tags         = [...(sourcePeriod.tags || [])];
    newShell.currency     = sourcePeriod.currency;
    newShell.budget       = {
      cap: sourcePeriod.budget.cap,
      categoryCaps: { ...(sourcePeriod.budget.categoryCaps || {}) }
    };
    newShell.savingsGoals = (sourcePeriod.savingsGoals || []).map(g => ({
      ...g, id: uid(), contributed: 0
    }));
    return newShell;
  }

  return {
    init, getDB, setSettings,
    getJobs, getJob, addJob, updateJob, deleteJob,
    getCategories, addCategory, renameCategory, deleteCategory,
    getRecurring, addRecurring, updateRecurring, deleteRecurring, injectRecurring,
    getPeriods, getPeriod, getActivePeriod, setActivePeriod,
    addPeriod, updatePeriod, deletePeriod,
    addIncomeEntry, deleteIncomeEntry,
    addExpense, deleteExpense,
    setBudget, setCategoryCap, deleteCategoryCap,
    addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
    uid, toISO, currency, fmt, newPeriodShell, copyFromPeriod
  };
})();
