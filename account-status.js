import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentAccount = null;
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function isAdmin() {
  const roles = currentAccount?.systemRoles || [];
  const permissions = currentAccount?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*');
}

async function loadCurrentAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  currentAccount = snapshot.exists() ? snapshot.data() : null;
  return currentAccount;
}

async function setAccountStatus(uid, nextStatus, displayName) {
  if (uid === auth.currentUser.uid && nextStatus !== 'ACTIVE') {
    alert('You cannot disable your own account while signed in.');
    return;
  }

  const action = nextStatus === 'ACTIVE' ? 're-enable' : 'disable';
  if (!confirm(`${action === 'disable' ? 'Disable' : 'Re-enable'} ${displayName}'s portal account?`)) return;

  try {
    await updateDoc(doc(db, 'portalAccounts', uid), {
      portalStatus: nextStatus,
      statusChangedAt: serverTimestamp(),
      statusChangedBy: auth.currentUser.uid,
    });
    window.dispatchEvent(new CustomEvent('canela-account-status-changed'));
    renderAccountStatus(true);
  } catch (error) {
    console.error(error);
    alert(`Unable to update account: ${error.code || error.message}`);
  }
}

function openEditor(uid) {
  if (!window.CanelaAccountEditor?.open) {
    alert('The account editor is still loading. Refresh and try again.');
    return;
  }
  window.CanelaAccountEditor.open(uid);
}

async function renderAccountStatus(force = false) {
  if (rendering || !isAdmin()) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('h1')?.textContent?.trim();
  if (!panel || title !== 'Account overview') return;
  if (!force && panel.dataset.accountStatusReady === 'true') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'portalAccounts'));
    const accounts = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    panel.querySelector('.account-status-section')?.remove();

    panel.insertAdjacentHTML('beforeend', `
      <section class="account-status-section">
        <div class="account-admin-heading">
          <div><p>LOGIN ACCESS</p><h2>Portal account access</h2></div>
          <span>${accounts.filter(item => item.portalStatus === 'ACTIVE').length} active</span>
        </div>
        <p class="account-help">Click Edit account to change the person’s organizational rank, system role, permissions, linked staff profile, display name, or access status. Redeemed authorization codes remain locked.</p>
        <div class="account-access-grid">
          ${accounts.map(item => {
            const active = item.portalStatus === 'ACTIVE';
            const protectedOwner = (item.systemRoles || []).includes('SYSTEM_OWNER');
            return `
              <article class="account-access-card ${active ? 'is-enabled' : 'is-disabled'}">
                <div>
                  <span class="account-access-status">${active ? 'ACTIVE' : esc(item.portalStatus || 'DISABLED')}</span>
                  <h3>${esc(item.displayName || item.portalUsername || 'Unnamed account')}</h3>
                  <p>@${esc(item.portalUsername || 'unknown')} · ${esc(item.organizationalRank || 'Staff')}</p>
                </div>
                <div class="account-access-actions">
                  <button class="account-edit" data-uid="${item.id}">Edit account</button>
                  ${item.id === auth.currentUser.uid || protectedOwner
                    ? '<span class="account-protected">Protected</span>'
                    : `<button class="account-toggle" data-uid="${item.id}" data-name="${esc(item.displayName || item.portalUsername || 'this account')}" data-next="${active ? 'DISABLED' : 'ACTIVE'}">${active ? 'Disable account' : 'Re-enable account'}</button>`}
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`);

    panel.querySelectorAll('.account-edit').forEach(button => {
      button.onclick = () => openEditor(button.dataset.uid);
    });
    panel.querySelectorAll('.account-toggle').forEach(button => {
      button.onclick = () => setAccountStatus(button.dataset.uid, button.dataset.next, button.dataset.name);
    });
    panel.dataset.accountStatusReady = 'true';
  } catch (error) {
    console.error('Unable to render account access controls.', error);
  } finally {
    rendering = false;
  }
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => renderAccountStatus(), 120);
}

const observer = new MutationObserver(schedule);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
window.addEventListener('canela-account-status-changed', () => renderAccountStatus(true));
window.addEventListener('canela-account-editor-ready', schedule);
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  await loadCurrentAccount();
  schedule();
});
