import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
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

async function hasPendingAppeal(uid) {
  const snapshot = await getDocs(query(
    collection(db, 'deactivationAppeals'),
    where('accountUid', '==', uid),
    where('status', '==', 'PENDING'),
  ));
  return !snapshot.empty;
}

function showDeactivatedModal(account, pendingAppeal = false, message = '') {
  document.getElementById('deactivatedAccountModal')?.remove();
  document.documentElement.classList.add('deactivated-account-open');

  document.body.insertAdjacentHTML('beforeend', `
    <div class="deactivated-account-backdrop" id="deactivatedAccountModal" role="dialog" aria-modal="true" aria-labelledby="deactivatedAccountTitle">
      <section class="deactivated-account-modal">
        <div class="brand-mark large">CC</div>
        <p class="deactivated-eyebrow">ACCOUNT ACCESS NOTICE</p>
        <h1 id="deactivatedAccountTitle">THIS ACCOUNT HAS BEEN DEACTIVATED</h1>
        <div class="deactivation-reason-card">
          <span>Reason for deactivation</span>
          <p>${esc(account.deactivationReason || 'No reason was recorded. Contact a System Administrator for assistance.')}</p>
          <small>Deactivated ${esc(formatDate(account.deactivatedAt))}${account.deactivatedByName ? ` by ${esc(account.deactivatedByName)}` : ''}</small>
        </div>
        ${message ? `<div class="alert">${esc(message)}</div>` : ''}
        ${pendingAppeal ? `
          <div class="deactivation-appeal-status">
            <strong>Appeal pending</strong>
            <p>Your deactivation appeal has already been submitted and is awaiting administrative review.</p>
          </div>` : `
          <button type="button" id="appealDeactivation" class="crud-add">Appeal Deactivation</button>`}
        <button type="button" id="signOutDeactivated" class="secondary">Return to sign in</button>
      </section>
    </div>`);

  document.getElementById('signOutDeactivated').onclick = async () => {
    document.documentElement.classList.remove('deactivated-account-open');
    document.getElementById('deactivatedAccountModal')?.remove();
    await signOut(auth);
  };

  document.getElementById('appealDeactivation')?.addEventListener('click', () => openAppealForm(account));
}

function openAppealForm(account) {
  document.getElementById('deactivationAppealModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="deactivationAppealModal">
      <section class="crud-modal">
        <div class="crud-heading">
          <div><p>ACCOUNT ACCESS APPEAL</p><h2>Appeal deactivation</h2></div>
          <button type="button" id="closeDeactivationAppeal">×</button>
        </div>
        <form id="deactivationAppealForm" class="crud-form">
          <label>Why should your account be reactivated?
            <textarea name="appealReason" minlength="25" required placeholder="Explain why the deactivation should be reconsidered."></textarea>
          </label>
          <label>Additional context or supporting information
            <textarea name="additionalContext" placeholder="Include any relevant details, corrections, or commitments."></textarea>
          </label>
          <label>Preferred contact method
            <input name="contactMethod" placeholder="Discord username, email, or another contact method" required>
          </label>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelDeactivationAppeal">Cancel</button>
            <button type="submit">Submit appeal</button>
          </div>
        </form>
      </section>
    </div>`);

  const close = () => document.getElementById('deactivationAppealModal')?.remove();
  document.getElementById('closeDeactivationAppeal').onclick = close;
  document.getElementById('cancelDeactivationAppeal').onclick = close;
  document.getElementById('deactivationAppealForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const form = new FormData(event.currentTarget);
    button.disabled = true;
    button.textContent = 'Submitting…';

    try {
      await addDoc(collection(db, 'deactivationAppeals'), {
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
        submittedBy: auth.currentUser.uid,
      });
      close();
      showDeactivatedModal(account, true, 'Your appeal was submitted successfully.');
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = 'Submit appeal';
      alert(`Unable to submit appeal: ${error.code || error.message}`);
    }
  };
}

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
    let pending = false;
    try { pending = await hasPendingAppeal(user.uid); } catch (error) { console.warn('Unable to check appeal status.', error); }
    showDeactivatedModal(account, pending);
  } catch (error) {
    console.error('Unable to verify account activation status.', error);
  } finally {
    handling = false;
  }
});