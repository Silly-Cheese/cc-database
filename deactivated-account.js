import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let handling = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

async function getPendingAppeal(uid) {
  const snapshot = await getDocs(query(
    collection(db, 'deactivationAppeals'),
    where('accountUid', '==', uid),
    where('status', '==', 'PENDING'),
  ));
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

function modalShell(content) {
  document.getElementById('deactivatedAccountModal')?.remove();
  document.documentElement.classList.add('deactivated-account-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="deactivated-account-backdrop" id="deactivatedAccountModal" role="dialog" aria-modal="true" aria-labelledby="deactivatedAccountTitle">
      <section class="deactivated-account-modal">${content}</section>
    </div>`);
}

function bindSignOut() {
  document.getElementById('signOutDeactivated')?.addEventListener('click', async () => {
    document.documentElement.classList.remove('deactivated-account-open');
    document.getElementById('deactivatedAccountModal')?.remove();
    await signOut(auth);
  });
}

function showDeactivatedModal(account, pendingAppeal = null, message = '') {
  modalShell(`
    <div class="brand-mark large">CC</div>
    <p class="deactivated-eyebrow">ACCOUNT ACCESS NOTICE</p>
    <h1 id="deactivatedAccountTitle">Account Deactivated</h1>
    <p class="deactivated-summary">Your access to the Canela Portal has been suspended.</p>
    <div class="deactivation-details">
      <div><span>Status</span><strong>Deactivated</strong></div>
      <div><span>Date</span><strong>${esc(formatDate(account.deactivatedAt || account.statusChangedAt))}</strong></div>
      <div class="full"><span>Reason</span><p>${esc(account.deactivationReason || 'No reason was recorded. Contact a System Administrator for assistance.')}</p></div>
      ${account.deactivatedByName ? `<div class="full"><span>Deactivated by</span><strong>${esc(account.deactivatedByName)}</strong></div>` : ''}
    </div>
    ${message ? `<div class="alert">${esc(message)}</div>` : ''}
    ${pendingAppeal ? `
      <div class="deactivation-appeal-status">
        <strong>Appeal pending review</strong>
        <p>Your appeal has been received. You will regain access only if an authorized reviewer approves it.</p>
      </div>` : `
      <button type="button" id="appealDeactivation" class="deactivation-primary">Appeal Deactivation</button>`}
    <button type="button" id="signOutDeactivated" class="deactivation-secondary">Sign Out</button>`);

  bindSignOut();
  document.getElementById('appealDeactivation')?.addEventListener('click', () => showAppealForm(account));
}

function showAppealForm(account, errorMessage = '') {
  modalShell(`
    <div class="deactivated-modal-heading">
      <div><p class="deactivated-eyebrow">ACCOUNT ACCESS APPEAL</p><h1 id="deactivatedAccountTitle">Appeal Deactivation</h1></div>
    </div>
    <p class="deactivated-summary">Explain why your portal access should be restored. Your submission becomes part of the permanent appeal record.</p>
    ${errorMessage ? `<div class="alert">${esc(errorMessage)}</div>` : ''}
    <form id="deactivationAppealForm" class="deactivation-form">
      <label>Appeal title
        <input name="appealTitle" maxlength="100" required placeholder="Brief summary of your appeal">
      </label>
      <label>Why should your account be reactivated?
        <textarea name="appealReason" minlength="25" required placeholder="Explain why the deactivation should be reconsidered."></textarea>
      </label>
      <label>Supporting information <small>(optional)</small>
        <textarea name="additionalContext" placeholder="Include corrections, evidence, context, or commitments."></textarea>
      </label>
      <label>Preferred contact method
        <input name="contactMethod" required placeholder="Discord username, email, or another contact method">
      </label>
      <div class="deactivation-actions">
        <button type="button" id="backToDeactivation" class="deactivation-secondary">Back</button>
        <button type="submit" class="deactivation-primary">Submit Appeal</button>
      </div>
    </form>`);

  document.getElementById('backToDeactivation').onclick = () => showDeactivatedModal(account);
  document.getElementById('deactivationAppealForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Submitting…';

    try {
      const documentRef = await addDoc(collection(db, 'deactivationAppeals'), {
        appealType: 'ACCOUNT_DEACTIVATION',
        appealTitle: String(form.get('appealTitle')).trim(),
        accountUid: auth.currentUser.uid,
        displayName: account.displayName || account.portalUsername || 'Unnamed account',
        portalUsername: account.portalUsername || '',
        organizationalRank: account.organizationalRank || '',
        deactivationReason: account.deactivationReason || '',
        appealReason: String(form.get('appealReason')).trim(),
        additionalContext: String(form.get('additionalContext') || '').trim(),
        contactMethod: String(form.get('contactMethod')).trim(),
        status: 'PENDING',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        submittedBy: auth.currentUser.uid,
      });
      showAppealSubmitted(documentRef.id);
    } catch (error) {
      console.error(error);
      showAppealForm(account, `Unable to submit appeal: ${error.code || error.message}`);
    }
  };
}

function showAppealSubmitted(referenceId) {
  modalShell(`
    <div class="brand-mark large">CC</div>
    <p class="deactivated-eyebrow">APPEAL CENTER</p>
    <h1 id="deactivatedAccountTitle">Appeal Submitted</h1>
    <p class="deactivated-summary">Your appeal has been received and is awaiting administrative review.</p>
    <div class="deactivation-details">
      <div><span>Status</span><strong>Pending Review</strong></div>
      <div><span>Reference</span><strong>${esc(referenceId)}</strong></div>
    </div>
    <button type="button" id="signOutDeactivated" class="deactivation-primary">Sign Out</button>`);
  bindSignOut();
}

document.addEventListener('keydown', event => {
  if (document.documentElement.classList.contains('deactivated-account-open') && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

onAuthStateChanged(auth, async user => {
  if (handling || !user || user.isAnonymous) return;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;
    const account = snapshot.data();
    const status = String(account.portalStatus || '').trim().toUpperCase();
    if (status === 'ACTIVE') {
      document.documentElement.classList.remove('deactivated-account-open');
      document.getElementById('deactivatedAccountModal')?.remove();
      return;
    }

    handling = true;
    let pending = null;
    try { pending = await getPendingAppeal(user.uid); } catch (error) { console.warn('Unable to check appeal status.', error); }
    showDeactivatedModal(account, pending);
  } catch (error) {
    console.error('Unable to verify account activation status.', error);
  } finally {
    handling = false;
  }
});