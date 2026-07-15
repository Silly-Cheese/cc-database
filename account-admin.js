import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;

const hash = async value => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim().toUpperCase()))),
).map(byte => byte.toString(16).padStart(2, '0')).join('');

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function isAdmin() {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*');
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = length => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `CNL-${part(4)}-${part(4)}-${part(4)}`;
}

async function loadAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
}

async function listCodes() {
  const snapshot = await getDocs(collection(db, 'activationCodes'));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function listAccounts() {
  const snapshot = await getDocs(collection(db, 'portalAccounts'));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

async function renderManager() {
  if (!isAdmin()) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('h1')?.textContent?.trim();
  if (!panel || title !== 'Account overview' || panel.dataset.accountAdmin === 'true') return;
  panel.dataset.accountAdmin = 'true';

  let codes = [];
  let accounts = [];
  try {
    [codes, accounts] = await Promise.all([listCodes(), listAccounts()]);
  } catch (error) {
    console.error(error);
  }

  panel.insertAdjacentHTML('beforeend', `
    <section class="account-admin-section">
      <div class="account-admin-heading">
        <div><p>ACCOUNT ADMINISTRATION</p><h2>Create staff activation codes</h2></div>
        <button id="newActivationCode" class="crud-add">+ New account code</button>
      </div>
      <p class="account-help">Create an invitation for a staff member. They will open the Activate tab, enter the displayed code, and choose their own username and password.</p>
      <div class="account-stats">
        <article><strong>${accounts.length}</strong><span>Portal accounts</span></article>
        <article><strong>${codes.filter(code => code.status === 'PENDING').length}</strong><span>Pending codes</span></article>
        <article><strong>${codes.filter(code => code.status === 'USED').length}</strong><span>Used codes</span></article>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Staff member</th><th>Rank</th><th>Status</th><th>Code</th><th>Actions</th></tr></thead>
          <tbody>
            ${codes.length ? codes.map(code => `
              <tr>
                <td>${esc(code.displayName || 'Unnamed')}</td>
                <td>${esc(code.organizationalRank || 'Staff')}</td>
                <td>${esc(code.status || 'PENDING')}</td>
                <td><code>${esc(code.plainCode || 'Hidden')}</code></td>
                <td>${code.status === 'PENDING' ? `<button class="crud-edit revoke-code" data-code-id="${code.id}">Revoke</button>` : '—'}</td>
              </tr>`).join('') : '<tr><td colspan="5" class="empty">No activation codes have been created.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>`);

  document.getElementById('newActivationCode').onclick = openCodeModal;
  panel.querySelectorAll('.revoke-code').forEach(button => {
    button.onclick = async () => {
      if (!confirm('Revoke this activation code?')) return;
      await updateDoc(doc(db, 'activationCodes', button.dataset.codeId), {
        status: 'REVOKED',
        revokedAt: serverTimestamp(),
        revokedBy: auth.currentUser.uid,
      });
      location.reload();
    };
  });
}

function openCodeModal() {
  document.getElementById('accountCodeModal')?.remove();
  const generated = makeCode();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="accountCodeModal">
      <section class="crud-modal">
        <div class="crud-heading">
          <div><p>NEW PORTAL ACCOUNT</p><h2>Create activation code</h2></div>
          <button type="button" id="closeAccountCode">×</button>
        </div>
        <form id="accountCodeForm" class="crud-form">
          <label>Display name<input name="displayName" required></label>
          <label>Organizational rank<input name="organizationalRank" placeholder="Staff Member" required></label>
          <label>Staff profile ID<input name="staffProfileId" placeholder="Optional"></label>
          <label>Activation code<input name="plainCode" value="${generated}" required></label>
          <label>System role
            <select name="systemRole">
              <option value="">No system role</option>
              <option value="DATA_ADMINISTRATOR">Data Administrator</option>
              <option value="AUDITOR">Auditor</option>
              <option value="SYSTEM_ADMINISTRATOR">System Administrator</option>
            </select>
          </label>
          <label>Permissions<textarea name="permissions" placeholder="One per line, such as staff.manage"></textarea></label>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelAccountCode">Cancel</button>
            <button type="submit">Create activation code</button>
          </div>
        </form>
      </section>
    </div>`);

  document.getElementById('closeAccountCode').onclick = closeCodeModal;
  document.getElementById('cancelAccountCode').onclick = closeCodeModal;
  document.getElementById('accountCodeForm').onsubmit = createCode;
}

function closeCodeModal() {
  document.getElementById('accountCodeModal')?.remove();
}

async function createCode(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Creating…';

  try {
    const plainCode = String(form.get('plainCode')).trim().toUpperCase();
    const codeHash = await hash(plainCode);
    const codeRef = doc(db, 'activationCodes', codeHash);
    if ((await getDoc(codeRef)).exists()) throw new Error('That activation code already exists. Generate another code.');

    const role = String(form.get('systemRole') || '').trim();
    const permissions = String(form.get('permissions') || '')
      .split(/[\n,]/)
      .map(value => value.trim())
      .filter(Boolean);

    await setDoc(codeRef, {
      plainCode,
      displayName: String(form.get('displayName')).trim(),
      organizationalRank: String(form.get('organizationalRank')).trim(),
      staffProfileId: String(form.get('staffProfileId') || '').trim(),
      systemRoles: role ? [role] : [],
      permissions,
      status: 'PENDING',
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });

    closeCodeModal();
    alert(`Activation code created:\n\n${plainCode}\n\nSend this code to the staff member.`);
    location.reload();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = 'Create activation code';
    alert(`Unable to create activation code: ${error.code || error.message}`);
  }
}

const observer = new MutationObserver(() => renderManager());
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  try {
    await loadAccount();
    renderManager();
  } catch (error) {
    console.error('Unable to initialize account administration.', error);
  }
});
