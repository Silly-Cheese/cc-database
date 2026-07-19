import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInWithEmailAndPassword,
  signInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
  runTransaction,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDXxh48yiFHMqL4dH82-fTg0dZXqFi1ud4',
  authDomain: 'cc-database-19dba.firebaseapp.com',
  projectId: 'cc-database-19dba',
  appId: '1:793192077235:web:ff335960e78a39ac971dc6',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const root = document.getElementById('app');

const aliasFor = username => `${username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')}@accounts.canela.internal`;
const hash = async value => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toUpperCase()))),
).map(byte => byte.toString(16).padStart(2, '0')).join('');
const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

let account = null;
let currentView = 'dashboard';

function nav(id, label, icon) {
  return `<button data-view="${id}" class="nav-item ${currentView === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`;
}

function shell(content) {
  root.innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="brand-mark">CC</div><div><strong>Canela Portal</strong><span>${esc(account?.organizationalRank || 'Administration')}</span></div></div>
      <button id="menuBtn" class="icon-btn">☰</button>
    </header>
    <div class="layout">
      <aside id="sidebar">
        <nav>
          ${nav('dashboard', 'Dashboard', '⌂')}
          ${nav('staff', 'Staff Directory', '👥')}
          ${nav('personnel', 'Personnel', '↕')}
          ${nav('compliance', 'Compliance', '⚖')}
          ${nav('alliances', 'Alliances', '🤝')}
          ${nav('training', 'Training & HR', '🎓')}
          ${nav('policies', 'Policies', '📚')}
          ${account?.systemRoles?.includes('SYSTEM_ADMINISTRATOR') ? nav('system', 'System Admin', '⚙') : ''}
        </nav>
        <button id="logoutBtn" class="logout">Sign out</button>
      </aside>
      <main>${content}</main>
    </div>`;

  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('logoutBtn').onclick = () => signOut(auth);
  document.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => {
      currentView = button.dataset.view;
      renderPortal();
    };
  });
}

async function count(name) {
  try { return (await getDocs(collection(db, name))).size; } catch { return 0; }
}

function moduleCard(id, title, text) {
  return `<button class="module-card" data-view="${id}"><strong>${title}</strong><span>${text}</span></button>`;
}

async function dashboard() {
  const [staff, cases, appeals, alliances] = await Promise.all([
    count('staffProfiles'), count('disciplinaryCases'), count('appeals'), count('alliances'),
  ]);
  return `
    <section class="hero"><p>CANELA CORPORATION</p><h1>Welcome, ${esc(account?.displayName || account?.portalUsername || 'Staff Member')}</h1><span>Secure organizational operations portal</span></section>
    <section class="cards">
      <article><small>Staff profiles</small><strong>${staff}</strong><span>Current database entries</span></article>
      <article><small>Disciplinary cases</small><strong>${cases}</strong><span>Recorded cases</span></article>
      <article><small>Appeals</small><strong>${appeals}</strong><span>Submitted reviews</span></article>
      <article><small>Alliances</small><strong>${alliances}</strong><span>Partnership records</span></article>
    </section>
    <section class="panel"><h2>Portal modules</h2><div class="module-grid">
      ${moduleCard('staff', 'Staff Management', 'Profiles, ranks, departments, quotas and personnel history.')}
      ${moduleCard('compliance', 'Compliance', 'Punishments, offences, blacklists and appeals.')}
      ${moduleCard('alliances', 'External Relations', 'Alliance representatives, partnership status and strikes.')}
      ${moduleCard('training', 'Workforce & HR', 'Training, certifications, reviews, goals and attendance.')}
    </div></section>`;
}

async function listCollection(name, title, fields) {
  let documents = [];
  try {
    documents = (await getDocs(collection(db, name))).docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  } catch {
    return `<section class="panel"><h1>${title}</h1><p class="error">Unable to load this collection. Check Firestore rules.</p></section>`;
  }
  return `<section class="panel"><div class="section-head"><div><p>DATABASE MODULE</p><h1>${title}</h1></div><span>${documents.length} records</span></div>${documents.length ? `<div class="table-wrap"><table><thead><tr>${fields.map(field => `<th>${field.label}</th>`).join('')}</tr></thead><tbody>${documents.map(item => `<tr>${fields.map(field => `<td>${esc(typeof field.value === 'function' ? field.value(item) : item[field.value])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">No records have been added yet.</div>'}</section>`;
}

async function renderPortal() {
  let content = '';
  if (currentView === 'dashboard') content = await dashboard();
  else if (currentView === 'staff') content = await listCollection('staffProfiles', 'Staff Directory', [
    { label: 'Name', value: item => item.displayName || item.robloxUsername }, { label: 'Roblox', value: 'robloxUsername' }, { label: 'Discord', value: 'discordUsername' }, { label: 'Rank', value: item => item.rankName || item.organizationalRank }, { label: 'Status', value: item => item.staffStatus || item.status },
  ]);
  else if (currentView === 'personnel') content = await listCollection('personnelActions', 'Personnel Actions', [
    { label: 'Staff', value: 'staffName' }, { label: 'Action', value: 'actionType' }, { label: 'Reason', value: 'reason' }, { label: 'Status', value: 'status' },
  ]);
  else if (currentView === 'compliance') content = await listCollection('disciplinaryCases', 'Compliance & Discipline', [
    { label: 'Subject', value: 'subjectName' }, { label: 'Offence', value: 'offenceName' }, { label: 'Recommendation', value: 'recommendedAction' }, { label: 'Status', value: 'status' },
  ]);
  else if (currentView === 'alliances') content = await listCollection('alliances', 'Alliance Management', [
    { label: 'Alliance', value: 'name' }, { label: 'Canela Rep', value: 'canelaRepresentative' }, { label: 'Partner Rep', value: 'partnerRepresentative' }, { label: 'Status', value: 'status' },
  ]);
  else if (currentView === 'training') content = await listCollection('courses', 'Training & Workforce', [
    { label: 'Course', value: 'title' }, { label: 'Category', value: 'category' }, { label: 'Passing score', value: item => item.passingScore ? `${item.passingScore}%` : '—' }, { label: 'Status', value: 'status' },
  ]);
  else if (currentView === 'policies') content = await listCollection('documents', 'Policy Library', [
    { label: 'Title', value: 'title' }, { label: 'Type', value: 'type' }, { label: 'Version', value: 'version' }, { label: 'Visibility', value: 'visibility' },
  ]);
  else content = `<section class="panel"><p>SYSTEM ADMINISTRATION</p><h1>Account overview</h1><dl class="details"><dt>Display name</dt><dd>${esc(account.displayName)}</dd><dt>Portal username</dt><dd>${esc(account.portalUsername)}</dd><dt>Rank</dt><dd>${esc(account.organizationalRank)}</dd><dt>Status</dt><dd>${esc(account.portalStatus)}</dd><dt>System roles</dt><dd>${esc((account.systemRoles || []).join(', ') || 'None')}</dd></dl></section>`;

  shell(content);
  document.querySelectorAll('.module-card').forEach(button => {
    button.onclick = () => { currentView = button.dataset.view; renderPortal(); };
  });
}

function bootstrapModal(message = '') {
  document.getElementById('bootstrapModal')?.remove();
  root.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop" id="bootstrapModal">
      <section class="bootstrap-modal">
        <div class="brand-mark large">CC</div>
        <p>INITIAL SYSTEM SETUP</p>
        <h2>Create your System Owner account</h2>
        <span>No linked Canela account was detected. Enter the one-time code stored in <strong>system/bootstrap</strong>.</span>
        ${message ? `<div class="alert">${esc(message)}</div>` : ''}
        <form id="bootstrapForm">
          <label>One-time bootstrap code<input name="code" autocomplete="one-time-code" required></label>
          <label>Display name<input name="displayName" value="Christopher Shelley" required></label>
          <label>Portal username<input name="username" autocomplete="username" minlength="4" maxlength="24" required></label>
          <label>Password<input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
          <label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label>
          <button>Create System Owner account</button>
        </form>
        <button id="closeBootstrap" class="text-button">Return to sign in</button>
      </section>
    </div>`);
  document.getElementById('bootstrapForm').onsubmit = bootstrapOwner;
  document.getElementById('closeBootstrap').onclick = () => document.getElementById('bootstrapModal').remove();
}

async function bootstrapOwner(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const password = String(form.get('password'));
  if (password !== String(form.get('confirm'))) {
    bootstrapModal('Passwords do not match.');
    return;
  }

  try {
    const bootstrapCode = String(form.get('code')).trim().toUpperCase();
    const bootstrapRef = doc(db, 'system', 'bootstrap');
    const bootstrapSnapshot = await getDoc(bootstrapRef);
    const bootstrap = bootstrapSnapshot.data();

    if (
      !bootstrapSnapshot.exists()
      || bootstrap.enabled !== true
      || bootstrap.ownerCreated === true
      || String(bootstrap.code || '').trim().toUpperCase() !== bootstrapCode
    ) {
      throw new Error('Invalid or disabled bootstrap code');
    }

    const anonymous = auth.currentUser?.isAnonymous ? { user: auth.currentUser } : await signInAnonymously(auth);
    const username = String(form.get('username')).trim().toLowerCase();
    const linked = await linkWithCredential(anonymous.user, EmailAuthProvider.credential(aliasFor(username), password));

    await runTransaction(db, async transaction => {
      const freshSnapshot = await transaction.get(bootstrapRef);
      const freshBootstrap = freshSnapshot.data();
      if (
        !freshSnapshot.exists()
        || freshBootstrap.enabled !== true
        || freshBootstrap.ownerCreated === true
        || String(freshBootstrap.code || '').trim().toUpperCase() !== bootstrapCode
      ) {
        throw new Error('Bootstrap already used or disabled');
      }

      transaction.set(doc(db, 'portalAccounts', linked.user.uid), {
        displayName: String(form.get('displayName')).trim(),
        portalUsername: username,
        organizationalRank: 'Vice President',
        portalStatus: 'ACTIVE',
        staffProfileId: '',
        systemRoles: ['SYSTEM_OWNER', 'SYSTEM_ADMINISTRATOR'],
        permissions: ['*'],
        bootstrapSource: 'system/bootstrap',
        createdAt: serverTimestamp(),
      });
      transaction.set(doc(db, 'portalUsernames', username), {
        uid: linked.user.uid,
        createdAt: serverTimestamp(),
      });
      transaction.update(bootstrapRef, {
        enabled: false,
        ownerCreated: true,
        ownerUid: linked.user.uid,
        ownerUsername: username,
        completedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(error);
    try { await signOut(auth); } catch {}
    authPage();
    bootstrapModal('Bootstrap failed. Confirm system/bootstrap exists, is enabled, and contains the exact code.');
  }
}

async function authPage(message = '') {
  root.innerHTML = `
    <main class="auth-page"><section class="auth-card">
      <div class="brand-mark large">CC</div><p>CANELA CORPORATION</p><h1>Administration Portal</h1><span>Authorized personnel only</span>
      ${message ? `<div class="alert">${esc(message)}</div>` : ''}
      <div class="auth-tabs"><button id="loginTab" class="active">Sign in</button><button id="activateTab">Activate</button></div>
      <form id="loginForm">
        <label>Portal username<input name="username" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
        <label class="check"><input name="remember" type="checkbox" checked>Remember this device</label>
        <button>Sign in</button>
      </form>
      <form id="activateForm" hidden>
        <label>Activation code<input name="code" required></label>
        <label>Choose username<input name="username" minlength="4" maxlength="24" required></label>
        <label>Create password<input name="password" type="password" minlength="10" required></label>
        <label>Confirm password<input name="confirm" type="password" minlength="10" required></label>
        <button>Activate account</button>
      </form>
      <button id="bootstrapButton" class="bootstrap-link" hidden>System owner setup</button>
    </section></main>`;

  const loginForm = document.getElementById('loginForm');
  const activateForm = document.getElementById('activateForm');
  const bootstrapButton = document.getElementById('bootstrapButton');

  document.getElementById('loginTab').onclick = () => { loginForm.hidden = false; activateForm.hidden = true; };
  document.getElementById('activateTab').onclick = () => { loginForm.hidden = true; activateForm.hidden = false; };

  try {
    const snapshot = await getDoc(doc(db, 'system', 'bootstrap'));
    const bootstrap = snapshot.data();
    if (snapshot.exists() && bootstrap.enabled === true && bootstrap.ownerCreated !== true) {
      bootstrapButton.hidden = false;
      bootstrapButton.onclick = async () => {
        if (!auth.currentUser) await signInAnonymously(auth);
        bootstrapModal();
      };
    }
  } catch (error) {
    console.warn('Bootstrap availability could not be checked.', error);
  }

  loginForm.onsubmit = login;
  activateForm.onsubmit = activate;
}

async function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await setPersistence(auth, form.get('remember') ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, aliasFor(String(form.get('username'))), String(form.get('password')));
  } catch {
    authPage('Sign-in failed. Check your username and password.');
  }
}

async function activate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const password = String(form.get('password'));
  if (password !== String(form.get('confirm'))) return authPage('Passwords do not match.');
  try {
    const codeHash = await hash(String(form.get('code')));
    const codeRef = doc(db, 'activationCodes', codeHash);
    const snapshot = await getDoc(codeRef);
    if (!snapshot.exists() || snapshot.data().status !== 'PENDING') throw new Error();
    const anonymous = await signInAnonymously(auth);
    const linked = await linkWithCredential(anonymous.user, EmailAuthProvider.credential(aliasFor(String(form.get('username'))), password));
    await runTransaction(db, async transaction => {
      const fresh = await transaction.get(codeRef);
      if (!fresh.exists() || fresh.data().status !== 'PENDING') throw new Error();
      transaction.set(doc(db, 'portalAccounts', linked.user.uid), {
        displayName: fresh.data().displayName || form.get('username'),
        portalUsername: String(form.get('username')).trim().toLowerCase(),
        organizationalRank: fresh.data().organizationalRank || 'Staff',
        portalStatus: 'ACTIVE',
        staffProfileId: fresh.data().staffProfileId || '',
        systemRoles: fresh.data().systemRoles || [],
        permissions: fresh.data().permissions || [],
        activationCodeHash: codeHash,
        createdAt: serverTimestamp(),
      });
      transaction.set(doc(db, 'portalUsernames', String(form.get('username')).trim().toLowerCase()), { uid: linked.user.uid, createdAt: serverTimestamp() });
      transaction.update(codeRef, { status: 'USED', usedByUid: linked.user.uid, usedAt: serverTimestamp() });
    });
  } catch {
    try { await signOut(auth); } catch {}
    authPage('Activation failed. Confirm the code is valid and the username is unused.');
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    account = null;
    authPage();
    return;
  }

  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) {
      if (user.isAnonymous) {
        authPage();
      } else {
        await signOut(auth);
      }
      return;
    }
    account = snapshot.data();
    if (account.portalStatus !== 'ACTIVE') {
      root.innerHTML = '<div class="loading-screen"><div class="brand-mark">CC</div><h1>Canela Portal</h1><p>Account access restricted.</p></div>';
      return;
    }
    renderPortal();
  } catch {
    authPage('The portal could not verify your account.');
  }
});