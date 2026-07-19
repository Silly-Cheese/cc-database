import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentUid = '';
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function dateValue(value) {
  if (!value) return '—';
  if (value.toDate) return value.toDate().toLocaleDateString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function submissionCard(submission) {
  const status = String(submission.status || 'PENDING').toUpperCase();
  const statusClass = status === 'PENDING' ? 'pending' : status === 'DENIED' ? 'denied' : '';
  return `<article class="quota-card" data-private-submission="${esc(submission.id)}">
    <div class="quota-card-head"><span class="quota-badge ${statusClass}">${esc(status)}</span><strong>${Number(submission.approvedPoints ?? submission.points ?? 0)} pts</strong></div>
    <h3>${esc(submission.activityType || submission.description || 'Quota activity')}</h3>
    <p>${esc(submission.description || 'No description provided.')}</p>
    <div class="quota-meta"><div><span>Activity date</span><strong>${dateValue(submission.activityDate)}</strong></div><div><span>Submitted</span><strong>${dateValue(submission.createdAt)}</strong></div></div>
    ${submission.proofUrl ? `<a class="quota-proof" href="${esc(submission.proofUrl)}" target="_blank" rel="noopener">Open proof ↗</a>` : ''}
    ${submission.reviewerNotes ? `<p class="quota-review-note">${esc(submission.reviewerNotes)}</p>` : ''}
  </article>`;
}

async function renderPrivateSubmissions() {
  if (rendering || !currentUid) return;
  const view = document.getElementById('quotaView');
  const heading = view?.querySelector('.quota-section-head p')?.textContent?.trim();
  if (!view || heading !== 'HISTORY') return;

  const grid = view.querySelector('.quota-grid');
  if (!grid || grid.dataset.privateUid === currentUid) return;

  rendering = true;
  grid.dataset.privateUid = currentUid;
  grid.innerHTML = '<div class="quota-empty">Loading your submissions…</div>';

  try {
    const snapshot = await getDocs(collection(db, 'quotaSubmissions'));
    const submissions = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(submission => String(submission.submittedBy || '') === currentUid)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    grid.innerHTML = submissions.length
      ? submissions.map(submissionCard).join('')
      : '<div class="quota-empty">You have not submitted any quota activity yet.</div>';
  } catch (error) {
    console.error('Unable to privately load quota submissions.', error);
    grid.innerHTML = '<div class="quota-empty">Your submissions could not be loaded.</div>';
  } finally {
    rendering = false;
  }
}

let timer;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(renderPrivateSubmissions, 50);
}

new MutationObserver(schedule).observe(document.getElementById('app'), { childList: true, subtree: true });
document.addEventListener('click', event => {
  if (event.target.closest('[data-quota-tab="submissions"]')) setTimeout(renderPrivateSubmissions, 75);
}, true);

onAuthStateChanged(auth, user => {
  currentUid = user && !user.isAnonymous ? user.uid : '';
  schedule();
});
