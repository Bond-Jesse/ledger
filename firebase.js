// ─── firebase.js — Firebase init, auth & Firestore operations ──────────────

const firebaseConfig = {
  apiKey: "AIzaSyCMHhasL6dKq5NVm2ngMLQ6fcCqC6UOFxI",
  authDomain: "ledger-62bb0.firebaseapp.com",
  projectId: "ledger-62bb0",
  storageBucket: "ledger-62bb0.firebasestorage.app",
  messagingSenderId: "423871116248",
  appId: "1:423871116248:web:ea1ba8510297d86263f8ad"
};

// ── Init ──────────────────────────────────────────────────────────────────
firebase.initializeApp(firebaseConfig);

const FB = (() => {
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // ── Auth ────────────────────────────────────────────────────────────────

  function getCurrentUser() { return auth.currentUser; }

  function onAuthChange(callback) {
    auth.onAuthStateChanged(callback);
  }

  async function register(email, password) {
    return auth.createUserWithEmailAndPassword(email, password);
  }

  async function login(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  async function logout() {
    return auth.signOut();
  }

  async function resetPassword(email) {
    return auth.sendPasswordResetEmail(email);
  }

  // ── Firestore helpers ───────────────────────────────────────────────────

  function userDoc() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return db.collection('users').doc(user.uid);
  }

  // Load full DB for current user
  async function loadDB() {
    try {
      const snap = await userDoc().get();
      if (snap.exists) return snap.data();
      // First time — save and return default
      const fresh = defaultDB();
      await userDoc().set(fresh);
      return fresh;
    } catch (e) {
      console.error('Firestore load error:', e);
      return defaultDB();
    }
  }

  // Save full DB for current user
  async function saveDB(db_data) {
    try {
      await userDoc().set(db_data);
    } catch (e) {
      console.error('Firestore save error:', e);
    }
  }

  function defaultDB() {
    return {
      settings: {
        currency: '€',
        defaultHourlyWage: 0,
        incomeTarget: 0
      },
      activePeriodId: null,
      jobs: [],
      categories: [
        'Housing','Food','Transport','Health','Entertainment',
        'Clothing','Utilities','Education','Subscriptions','Other'
      ],
      recurringExpenses: [],
      periods: []
    };
  }

  return {
    getCurrentUser, onAuthChange,
    register, login, logout, resetPassword,
    loadDB, saveDB, defaultDB
  };
})();
