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

function closeAccountStatusModal() {
  document.getElementById('accountStatusModal')?.remove();
  document.documentElement.classList.remove('account-status-modal-open');
}

function openDeactivationModal(uid, displayName) {
  closeAccountStatusModal();
  document.documentElement.classList.add('account-status-modal-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="account-status-backdrop" id="accountStatusModal" role="dialog" aria-modal="true" aria-labelledby="accountStatusModalTitle">
      <section class="account-status-modal">
        <div class="account-status-modal-heading">
          <div>
            <p>PORTAL ACCESS CONTROL</p>
            <h2 id="accountStatusModalTitle">Deactivate account</h2>
          </div>
          <button type="button" class="account-status-close" id="cancelAccountStatusModal" aria-label="Close">×</button>
        </div>
        <div class="account-status-subject">
          <span>Account</span>
          <strong>${esc(displayName)}</strong>
        </div>
        <form id="deactivateAccountForm" class="account-status-form">
          <label>
            Reason for deactivation <span aria-hidden="true">*</span>
            <textarea name="reason" minlength="10" maxlength="1000" required placeholder="Explain why this portal account is being deactivated."></textarea>
            <small>This reason will be shown to the account holder and included with any appeal.</small>
          </label>
          <label>
            Internal administrative notes
            <textarea name="notes" maxlength="1500" placeholder="Optional notes for administrators. These are not shown to the account holder."></textarea>
          </label>
          <div class="account-status-warning">
            <strong>Immediate access removal</strong>
            <p>The account holder will be blocked from the portal as soon as this action is completed.</p>
          </div>
          <div class="account-status-modal-actions">
            <button type="button" class="secondary" id="cancelDeactivateAccount">Cancel</button>
            <button type="submit" class="danger">Deactivate account</button>
          </div>
        </form>
      </section>
    </div>`);

  const form = document.getElementById('deactivateAccountForm');
  const cancel = () => closeAccountStatusModal();
  document.getElementById('cancelAccountStatusModal').onclick = cancel;
  document.getElementById('cancelDeactivateAccount').onclick = cancel;

  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const reason = String(data.get('reason') || '').trim();
    const notes = String(data.get('notes') || '').trim();

    if (!reason) {
      form.querySelector('[name="reason"]').focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Deactivating…';

    try {
      await updateDoc(doc(db, 'portalAccounts', uid), {
        portalStatus: 'DEACTIVATED',
        statusChangedAt: serverTimestamp(),
        statusChangedBy: auth.currentUser.uid,
        statusChangedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'System Administrator',
        deactivationReason: reason,
        deactivationNotes: notes,
        deactivatedAt: serverTimestamp(),
        deactivatedBy: auth.currentUser.uid,
        deactivatedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'System Administrator',
      });
      closeAccountStatusModal();
      window.dispatchEvent(new CustomEvent('canela-account-status-changed'));
      renderAccountStatus(true);
    } catch (error) {
      console.error(error);
      submit.disabled = false;
      submit.textContent = 'Deactivate account';
      const existing = form.querySelector('.account-status-error');
      existing?.remove();
      form.insertAdjacentHTML('afterbegin', `<div class="account-status-error">Unable to deactivate account: ${esc(error.code || error.message)}</div>`);
    }
  };
}

async function setAccountStatus(uid, nextStatus, displayName) {
  if (uid === auth.currentUser.uid && nextStatus !== 'ACTIVE') {
    alert('You cannot disable your own account while signed in.');
    return;
  }

  if (nextStatus !== 'ACTIVE') {
    openDeactivationModal(uid, displayName);
    return;
  }

  if (!confirm(`Re-enable ${displayName}'s portal account?`)) return;

  try {
    await updateDoc(doc(db, 'portalAccounts', uid), {
      portalStatus: 'ACTIVE',
      statusChangedAt: serverTimestamp(),
      statusChangedBy: auth.currentUser.uid,
      statusChangedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'System Administrator',
      reactivatedAt: serverTimestamp(),
      reactivatedBy: auth.currentUser.uid,
      reactivatedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'System Administrator',
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
        <p class="account-help">Deactivating an account requires a reason. That reason is shown to the user and may be appealed.</p>
        <div class="account-access-grid">
          ${accounts.map(item => {
            const active = item.portalStatus === 'ACTIVE';
            const protectedOwner = (item.systemRoles || []).includes('SYSTEM_OWNER');
            return `
              <article class="account-access-card ${active ? 'is-enabled' : 'is-disabled'}">
                <div>
                  <span class="account-access-status">${active ? 'ACTIVE' : esc(item.portalStatus || 'DEACTIVATED')}</span>
                  <h3>${esc(item.displayName || item.portalUsername || 'Unnamed account')}</h3>
                  <p>@${esc(item.portalUsername || 'unknown')} · ${esc(item.organizationalRank || 'Staff')}</p>
                  ${!active && item.deactivationReason ? `<p><strong>Reason:</strong> ${esc(item.deactivationReason)}</p>` : ''}
                </div>
                <div class="account-access-actions">
                  <button class="account-edit" data-uid="${item.id}">Edit account</button>
                  ${item.id === auth.currentUser.uid || protectedOwner
                    ? '<span class="account-protected">Protected</span>'
                    : `<button class="account-toggle" data-uid="${item.id}" data-name="${esc(item.displayName || item.portalUsername || 'this account')}" data-next="${active ? 'DEACTIVATED' : 'ACTIVE'}">${active ? 'Deactivate account' : 'Re-enable account'}</button>`}
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