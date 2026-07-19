import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentAccount = null;
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function canReview() {
  const roles = currentAccount?.systemRoles || [];
  const permissions = currentAccount?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes('appeals.review');
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

async function reviewAppeal(appeal, decision) {
  const approved = decision === 'APPROVED';
  const notes = String(prompt(`${approved ? 'Approval' : 'Denial'} notes for ${appeal.displayName || appeal.portalUsername}:`) || '').trim();
  if (!notes) {
    alert('Review notes are required.');
    return;
  }
  if (!confirm(`${approved ? 'Approve this appeal and reactivate the account' : 'Deny this appeal'}?`)) return;

  try {
    if (approved) {
      await updateDoc(doc(db, 'portalAccounts', appeal.accountUid), {
        portalStatus: 'ACTIVE',
        reactivatedAt: serverTimestamp(),
        reactivatedBy: auth.currentUser.uid,
        reactivatedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'Appeal Reviewer',
        statusChangedAt: serverTimestamp(),
        statusChangedBy: auth.currentUser.uid,
      });
    }

    await updateDoc(doc(db, 'deactivationAppeals', appeal.id), {
      status: decision,
      reviewNotes: notes,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
      reviewedByName: currentAccount?.displayName || currentAccount?.portalUsername || 'Appeal Reviewer',
    });

    window.dispatchEvent(new CustomEvent('canela-account-status-changed'));
    await renderAppeals(true);
  } catch (error) {
    console.error(error);
    alert(`Unable to review appeal: ${error.code || error.message}`);
  }
}

async function renderAppeals(force = false) {
  if (rendering || !canReview()) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('h1')?.textContent?.trim();
  if (!panel || title !== 'Account overview') return;
  if (!force && panel.dataset.deactivationAppealsReady === 'true') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'deactivationAppeals'));
    const appeals = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));

    panel.querySelector('.deactivation-appeals-section')?.remove();
    panel.insertAdjacentHTML('beforeend', `
      <section class="account-admin-section deactivation-appeals-section">
        <div class="account-admin-heading">
          <div><p>ACCOUNT ACCESS APPEALS</p><h2>Deactivation appeals</h2></div>
          <span>${appeals.filter(item => item.status === 'PENDING').length} pending</span>
        </div>
        <p class="account-help">Review requests from people whose portal access was deactivated. Approving an appeal automatically reactivates the account.</p>
        <div class="account-access-grid">
          ${appeals.length ? appeals.map(appeal => `
            <article class="account-access-card ${appeal.status === 'PENDING' ? 'is-disabled' : 'is-enabled'}">
              <div>
                <span class="account-access-status">${esc(appeal.status || 'PENDING')}</span>
                <h3>${esc(appeal.displayName || appeal.portalUsername || 'Unnamed account')}</h3>
                <p>@${esc(appeal.portalUsername || 'unknown')} · ${esc(appeal.organizationalRank || 'Staff')}</p>
                <p><strong>Original reason:</strong> ${esc(appeal.deactivationReason || 'Not recorded')}</p>
                <p><strong>Appeal:</strong> ${esc(appeal.appealReason || 'No explanation supplied')}</p>
                ${appeal.additionalContext ? `<p><strong>Additional context:</strong> ${esc(appeal.additionalContext)}</p>` : ''}
                <p><strong>Contact:</strong> ${esc(appeal.contactMethod || 'Not supplied')}</p>
                <p><small>Submitted ${esc(formatDate(appeal.submittedAt))}</small></p>
                ${appeal.reviewNotes ? `<p><strong>Review notes:</strong> ${esc(appeal.reviewNotes)}</p>` : ''}
              </div>
              ${appeal.status === 'PENDING' ? `
                <div class="account-access-actions">
                  <button class="appeal-approve" data-id="${appeal.id}">Approve & reactivate</button>
                  <button class="appeal-deny" data-id="${appeal.id}">Deny appeal</button>
                </div>` : ''}
            </article>`).join('') : '<div class="empty">No deactivation appeals have been submitted.</div>'}
        </div>
      </section>`);

    const byId = new Map(appeals.map(item => [item.id, item]));
    panel.querySelectorAll('.appeal-approve').forEach(button => {
      button.onclick = () => reviewAppeal(byId.get(button.dataset.id), 'APPROVED');
    });
    panel.querySelectorAll('.appeal-deny').forEach(button => {
      button.onclick = () => reviewAppeal(byId.get(button.dataset.id), 'DENIED');
    });
    panel.dataset.deactivationAppealsReady = 'true';
  } catch (error) {
    console.error('Unable to render deactivation appeals.', error);
  } finally {
    rendering = false;
  }
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => renderAppeals(), 140);
}

const observer = new MutationObserver(schedule);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
window.addEventListener('canela-account-status-changed', () => renderAppeals(true));
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  currentAccount = snapshot.exists() ? snapshot.data() : null;
  schedule();
});