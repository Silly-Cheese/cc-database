import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentAccount = null;
let appeals = [];
let selectedStatus = 'ALL';
let activeAppealId = null;
let centerOpen = false;

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

function reference(appeal) {
  return appeal.appealId || `APL-${appeal.id.slice(0, 8).toUpperCase()}`;
}

async function loadAppeals() {
  const appealsRef = collection(db, 'deactivationAppeals');
  const source = canReview()
    ? appealsRef
    : query(appealsRef, where('accountUid', '==', auth.currentUser.uid));
  const snapshot = await getDocs(source);
  appeals = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
}

function statusClass(status) {
  return `appeal-status appeal-${String(status || 'PENDING').toLowerCase().replaceAll('_', '-')}`;
}

function injectNavigation() {
  if (!auth.currentUser || auth.currentUser.isAnonymous || !currentAccount || currentAccount.portalStatus !== 'ACTIVE') return;
  const nav = document.querySelector('#sidebar nav');
  if (!nav || nav.querySelector('[data-appeal-center]')) return;
  const button = document.createElement('button');
  button.className = `nav-item${centerOpen ? ' active' : ''}`;
  button.dataset.appealCenter = 'true';
  button.innerHTML = '<span>⚖</span>Appeal Center';
  const systemButton = [...nav.querySelectorAll('.nav-item')].find(item => item.textContent.includes('System Admin'));
  if (systemButton) nav.insertBefore(button, systemButton); else nav.appendChild(button);
  button.onclick = event => {
    event.preventDefault();
    centerOpen = true;
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    renderCenter();
  };
}

function appealRows(items) {
  if (!items.length) return '<div class="appeal-empty">No appeals match this view.</div>';
  return `<div class="appeal-table-wrap"><table class="appeal-table">
    <thead><tr><th>Appeal</th><th>Type</th><th>Submitted by</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(reference(item))}</strong><span>${esc(item.appealTitle || 'Account deactivation appeal')}</span></td>
      <td>Account Deactivation</td>
      <td>${esc(item.displayName || item.portalUsername || 'Unknown')}</td>
      <td><span class="${statusClass(item.status)}">${esc(String(item.status || 'PENDING').replaceAll('_', ' '))}</span></td>
      <td>${esc(formatDate(item.submittedAt))}</td>
      <td><button class="appeal-view" data-appeal-id="${item.id}">View</button></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function timeline(appeal) {
  const events = [
    { title: 'Appeal submitted', detail: formatDate(appeal.submittedAt), complete: true },
    { title: appeal.assignedReviewerName ? `Assigned to ${appeal.assignedReviewerName}` : 'Awaiting reviewer assignment', detail: appeal.assignedAt ? formatDate(appeal.assignedAt) : '', complete: Boolean(appeal.assignedReviewerName) },
    { title: appeal.status === 'NEEDS_INFORMATION' ? 'More information requested' : 'Administrative review', detail: appeal.reviewedAt ? formatDate(appeal.reviewedAt) : '', complete: ['APPROVED','DENIED','NEEDS_INFORMATION'].includes(appeal.status) },
    { title: appeal.status === 'APPROVED' ? 'Appeal approved' : appeal.status === 'DENIED' ? 'Appeal denied' : 'Decision pending', detail: appeal.decisionReason || appeal.reviewNotes || '', complete: ['APPROVED','DENIED'].includes(appeal.status) },
  ];
  return `<div class="appeal-timeline">${events.map(event => `<div class="appeal-timeline-item ${event.complete ? 'complete' : ''}"><i></i><div><strong>${esc(event.title)}</strong>${event.detail ? `<span>${esc(event.detail)}</span>` : ''}</div></div>`).join('')}</div>`;
}

function detailPanel(appeal) {
  const reviewer = canReview();
  return `<div class="appeal-detail-backdrop" id="appealDetailModal" role="dialog" aria-modal="true">
    <section class="appeal-detail-modal">
      <div class="appeal-detail-head"><div><p>APPEAL RECORD</p><h2>${esc(reference(appeal))}</h2></div><button id="closeAppealDetail" aria-label="Close">×</button></div>
      <div class="appeal-detail-grid">
        <div><span>Status</span><strong class="${statusClass(appeal.status)}">${esc(String(appeal.status || 'PENDING').replaceAll('_',' '))}</strong></div>
        <div><span>Type</span><strong>Account Deactivation</strong></div>
        <div><span>Submitted by</span><strong>${esc(appeal.displayName || appeal.portalUsername)}</strong></div>
        <div><span>Submitted</span><strong>${esc(formatDate(appeal.submittedAt))}</strong></div>
        <div class="full"><span>Original deactivation reason</span><p>${esc(appeal.deactivationReason || 'Not recorded')}</p></div>
        <div class="full"><span>Appeal title</span><p>${esc(appeal.appealTitle || 'Account deactivation appeal')}</p></div>
        <div class="full"><span>Appeal statement</span><p>${esc(appeal.appealReason || 'No statement provided')}</p></div>
        ${appeal.additionalContext ? `<div class="full"><span>Supporting information</span><p>${esc(appeal.additionalContext)}</p></div>` : ''}
        <div class="full"><span>Preferred contact</span><p>${esc(appeal.contactMethod || 'Not supplied')}</p></div>
        ${appeal.reviewNotes ? `<div class="full"><span>Review notes</span><p>${esc(appeal.reviewNotes)}</p></div>` : ''}
      </div>
      <h3>Appeal timeline</h3>${timeline(appeal)}
      ${reviewer && !['APPROVED','DENIED'].includes(appeal.status) ? `<form id="appealReviewForm" class="appeal-review-form">
        <label>Assigned reviewer<input name="assignedReviewerName" value="${esc(appeal.assignedReviewerName || currentAccount.displayName || currentAccount.portalUsername || '')}" required></label>
        <label>Review notes<textarea name="reviewNotes" required placeholder="Record the basis for the decision or request.">${esc(appeal.reviewNotes || '')}</textarea></label>
        <div class="appeal-review-actions">
          <button type="submit" name="decision" value="NEEDS_INFORMATION" class="secondary">Request Information</button>
          <button type="submit" name="decision" value="DENIED" class="danger">Deny</button>
          <button type="submit" name="decision" value="APPROVED">Approve & Reactivate</button>
        </div>
      </form>` : ''}
    </section>
  </div>`;
}

async function submitDecision(event, appeal) {
  event.preventDefault();
  const decision = event.submitter?.value;
  if (!decision) return;
  const form = new FormData(event.currentTarget);
  const notes = String(form.get('reviewNotes') || '').trim();
  const reviewerName = String(form.get('assignedReviewerName') || '').trim();
  if (!notes || !reviewerName) return;
  if (!confirm(decision === 'APPROVED' ? 'Approve this appeal and reactivate the account?' : `Set this appeal to ${decision.replaceAll('_',' ')}?`)) return;

  try {
    if (decision === 'APPROVED') {
      await updateDoc(doc(db, 'portalAccounts', appeal.accountUid), {
        portalStatus: 'ACTIVE',
        reactivatedAt: serverTimestamp(),
        reactivatedBy: auth.currentUser.uid,
        reactivatedByName: currentAccount.displayName || currentAccount.portalUsername || 'Appeal Reviewer',
        statusChangedAt: serverTimestamp(),
        statusChangedBy: auth.currentUser.uid,
      });
    }
    await updateDoc(doc(db, 'deactivationAppeals', appeal.id), {
      status: decision,
      assignedReviewer: auth.currentUser.uid,
      assignedReviewerName: reviewerName,
      assignedAt: appeal.assignedAt || serverTimestamp(),
      reviewNotes: notes,
      decisionReason: notes,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser.uid,
      reviewedByName: currentAccount.displayName || currentAccount.portalUsername || 'Appeal Reviewer',
      updatedAt: serverTimestamp(),
    });
    document.getElementById('appealDetailModal')?.remove();
    await renderCenter();
    window.dispatchEvent(new CustomEvent('canela-account-status-changed'));
  } catch (error) {
    console.error(error);
    alert(`Unable to update appeal: ${error.code || error.message}`);
  }
}

function bindCenterEvents() {
  document.querySelectorAll('[data-appeal-filter]').forEach(button => {
    button.onclick = () => {
      selectedStatus = button.dataset.appealFilter;
      renderCenter();
    };
  });
  document.querySelectorAll('[data-appeal-id]').forEach(button => {
    button.onclick = () => {
      const appeal = appeals.find(item => item.id === button.dataset.appealId);
      if (!appeal) return;
      activeAppealId = appeal.id;
      document.body.insertAdjacentHTML('beforeend', detailPanel(appeal));
      document.getElementById('closeAppealDetail').onclick = () => document.getElementById('appealDetailModal').remove();
      document.getElementById('appealReviewForm')?.addEventListener('submit', event => submitDecision(event, appeal));
    };
  });
}

async function renderCenter() {
  const main = document.querySelector('main');
  if (!main || !auth.currentUser || !currentAccount) return;
  main.innerHTML = '<section class="panel appeal-center"><p>APPEAL CENTER</p><h1>Loading appeals…</h1></section>';
  try {
    await loadAppeals();
    const visible = appeals.filter(item => selectedStatus === 'ALL' || item.status === selectedStatus);
    const myAppeals = visible.filter(item => item.accountUid === auth.currentUser.uid);
    const queue = canReview() ? visible : [];
    const pending = appeals.filter(item => item.status === 'PENDING').length;
    main.innerHTML = `<section class="panel appeal-center">
      <div class="section-head"><div><p>CASE REVIEW MODULE</p><h1>Appeal Center</h1></div><span>${pending} pending</span></div>
      <p class="appeal-intro">Track submitted appeals, review decisions, and manage requests for restored portal access.</p>
      <div class="appeal-summary-cards">
        <article><span>My appeals</span><strong>${appeals.filter(item => item.accountUid === auth.currentUser.uid).length}</strong></article>
        <article><span>Pending review</span><strong>${pending}</strong></article>
        <article><span>Approved</span><strong>${appeals.filter(item => item.status === 'APPROVED').length}</strong></article>
        <article><span>Denied</span><strong>${appeals.filter(item => item.status === 'DENIED').length}</strong></article>
      </div>
      <div class="appeal-filters">${['ALL','PENDING','NEEDS_INFORMATION','APPROVED','DENIED'].map(status => `<button data-appeal-filter="${status}" class="${selectedStatus === status ? 'active' : ''}">${status.replaceAll('_',' ')}</button>`).join('')}</div>
      <section class="appeal-section"><div class="appeal-section-head"><h2>My Appeals</h2><span>${myAppeals.length}</span></div>${appealRows(myAppeals)}</section>
      ${canReview() ? `<section class="appeal-section"><div class="appeal-section-head"><h2>Administrative Appeal Queue</h2><span>${queue.length}</span></div>${appealRows(queue)}</section>` : ''}
    </section>`;
    bindCenterEvents();
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel appeal-center"><p>APPEAL CENTER</p><h1>Appeal Center</h1><div class="alert">Unable to load appeals: ${esc(error.code || error.message)}</div></section>`;
  }
}

const observer = new MutationObserver(() => {
  if (centerOpen && !document.querySelector('.appeal-center')) centerOpen = false;
  injectNavigation();
});
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  currentAccount = snapshot.exists() ? snapshot.data() : null;
  injectNavigation();
});