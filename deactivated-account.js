import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let handling = false;
let stopAppealWatcher = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function latestAppeal(snapshot) {
  if (snapshot.empty) return null;
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => {
      const aTime = a.updatedAt?.seconds || a.submittedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || b.submittedAt?.seconds || 0;
      return bTime - aTime;
    })[0];
}

function appealStatusDetails(appeal) {
  const status = String(appeal?.status || 'PENDING').toUpperCase();
  const details = {
    PENDING: {
      label: 'Pending Review',
      className: 'pending',
      message: 'Your appeal has been received and is waiting for an authorized reviewer.',
    },
    NEEDS_INFORMATION: {
      label: 'More Information Requested',
      className: 'needs-information',
      message: 'A reviewer needs additional information before a decision can be made.',
    },
    APPROVED: {
      label: 'Approved',
      className: 'approved',
      message: 'Your appeal was approved. Portal access should be restored shortly.',
    },
    DENIED: {
      label: 'Denied',
      className: 'denied',
      message: 'Your appeal was reviewed and denied. Review the decision notes below.',
    },
  };
  return details[status] || {
    label: status.replaceAll('_', ' '),
    className: 'pending',
    message: 'Your appeal status has been updated.',
  };
}

function reference(appeal) {
  return appeal?.appealId || (appeal?.id ? `APL-${appeal.id.slice(0, 8).toUpperCase()}` : 'Not assigned');
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
    stopAppealWatcher?.();
    stopAppealWatcher = null;
    document.documentElement.classList.remove('deactivated-account-open');
    document.getElementById('deactivatedAccountModal')?.remove();
    await signOut(auth);
  });
}

function appealStatusCard(appeal) {
  if (!appeal) return '';
  const status = appealStatusDetails(appeal);
  const notes = appeal.decisionReason || appeal.reviewNotes || '';
  const updated = appeal.reviewedAt || appeal.updatedAt || appeal.submittedAt;
  return `
    <div class="deactivation-appeal-status ${status.className}">
      <div class="appeal-status-heading">
        <div>
          <span>APPEAL STATUS</span>
          <strong>${esc(status.label)}</strong>
        </div>
        <b>${esc(reference(appeal))}</b>
      </div>
      <p>${esc(status.message)}</p>
      <div class="appeal-status-meta">
        <div><span>Submitted</span><strong>${esc(formatDate(appeal.submittedAt))}</strong></div>
        <div><span>Last updated</span><strong>${esc(formatDate(updated))}</strong></div>
      </div>
      ${appeal.assignedReviewerName ? `<div class="appeal-status-note"><span>Assigned reviewer</span><p>${esc(appeal.assignedReviewerName)}</p></div>` : ''}
      ${notes ? `<div class="appeal-status-note"><span>Reviewer notes</span><p>${esc(notes)}</p></div>` : ''}
    </div>`;
}

function showDeactivatedModal(account, appeal = null, message = '') {
  const appealStatus = String(appeal?.status || '').toUpperCase();
  const canSubmit = !appeal || appealStatus === 'DENIED';

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
    ${appealStatusCard(appeal)}
    ${canSubmit ? `<button type="button" id="appealDeactivation" class="deactivation-primary">${appeal ? 'Submit New Appeal' : 'Appeal Deactivation'}</button>` : ''}
    <button type="button" id="signOutDeactivated" class="deactivation-secondary">Sign Out</button>`);

  bindSignOut();
  document.getElementById('appealDeactivation')?.addEventListener('click', () => showAppealForm(account, appeal));
}

function showAppealForm(account, previousAppeal = null, errorMessage = '') {
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

  document.getElementById('backToDeactivation').onclick = () => showDeactivatedModal(account, previousAppeal);
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
      showAppealForm(account, previousAppeal, `Unable to submit appeal: ${error.code || error.message}`);
    }
  };
}

function showAppealSubmitted(referenceId) {
  modalShell(`
    <div class="brand-mark large">CC</div>
    <p class="deactivated-eyebrow">APPEAL CENTER</p>
    <h1 id="deactivatedAccountTitle">Appeal Submitted</h1>
    <p class="deactivated-summary">Your appeal has been received and is awaiting administrative review. This screen will update automatically when its status changes.</p>
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
  stopAppealWatcher?.();
  stopAppealWatcher = null;
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
    const appealsQuery = query(
      collection(db, 'deactivationAppeals'),
      where('accountUid', '==', user.uid),
    );

    stopAppealWatcher = onSnapshot(appealsQuery, appealSnapshot => {
      showDeactivatedModal(account, latestAppeal(appealSnapshot));
    }, error => {
      console.warn('Unable to watch appeal status.', error);
      showDeactivatedModal(account, null, `Unable to load appeal status: ${error.code || error.message}`);
    });
  } catch (error) {
    console.error('Unable to verify account activation status.', error);
  } finally {
    handling = false;
  }
});