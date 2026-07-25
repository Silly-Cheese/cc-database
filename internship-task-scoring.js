import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let activeReviewTaskId = null;
let taskCache = [];
let taskCacheAt = 0;
let decorating = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

async function loadTasks(force = false) {
  if (!force && taskCache.length && Date.now() - taskCacheAt < 8000) return taskCache;
  const snapshot = await getDocs(collection(db, 'internshipTasks'));
  taskCache = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  taskCacheAt = Date.now();
  return taskCache;
}

function pointsValue(task) {
  const value = Number(task?.points);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function statusText(status) {
  return String(status || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

function reviewMarkup(task) {
  const feedback = String(task?.supervisorFeedback || '').trim();
  const maxPoints = pointsValue(task);
  const score = task?.score;
  const hasScore = maxPoints !== null && score !== undefined && score !== null && score !== '' && Number.isFinite(Number(score));
  if (!feedback && !hasScore) return '';

  return `<section class="internship-intern-review" data-task-review="${esc(task.id)}">
    <div class="internship-intern-review-head">
      <div><span>SUPERVISOR REVIEW</span><strong>${esc(statusText(task.status) || 'Reviewed')}</strong></div>
      ${hasScore ? `<div class="internship-score-pill"><strong>${esc(Number(score))}</strong><span>out of ${esc(maxPoints)}</span></div>` : ''}
    </div>
    ${feedback ? `<div class="internship-review-notes"><span>Review notes</span><p>${esc(feedback)}</p></div>` : ''}
  </section>`;
}

function taskMatchesCard(task, card) {
  const title = card.querySelector('h3')?.textContent?.trim() || '';
  const description = card.querySelector(':scope > p')?.textContent?.trim() || '';
  return String(task.title || 'Internship Task').trim() === title
    && String(task.description || 'No description provided.').trim() === description;
}

async function decorateInternTasks() {
  if (decorating) return;
  const heading = [...document.querySelectorAll('.internship-section-head h2')].find(item => item.textContent.trim() === 'My tasks');
  if (!heading) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  decorating = true;
  try {
    const tasks = (await loadTasks()).filter(task => task.internUid === uid);
    const cards = [...heading.closest('.internship-section')?.querySelectorAll('.internship-card') || []];
    const usedIds = new Set();

    cards.forEach(card => {
      if (card.querySelector('.internship-intern-review')) return;
      const task = tasks.find(item => !usedIds.has(item.id) && taskMatchesCard(item, card));
      if (!task) return;
      usedIds.add(task.id);
      const markup = reviewMarkup(task);
      if (!markup) return;
      const actions = card.querySelector('.internship-actions');
      if (actions) actions.insertAdjacentHTML('beforebegin', markup);
      else card.insertAdjacentHTML('beforeend', markup);
    });
  } catch (error) {
    console.warn('Unable to display internship review details.', error);
  } finally {
    decorating = false;
  }
}

async function configureReviewScore(modal) {
  if (!activeReviewTaskId || modal.dataset.scoreConfigured === 'true') return;
  modal.dataset.scoreConfigured = 'true';
  try {
    const task = (await loadTasks(true)).find(item => item.id === activeReviewTaskId);
    if (!task) return;
    const scoreInput = modal.querySelector('input[name="score"]');
    const scoreField = scoreInput?.closest('.internship-field');
    if (!scoreInput || !scoreField) return;

    const maxPoints = pointsValue(task);
    if (maxPoints === null) {
      scoreField.remove();
      return;
    }

    const label = scoreField.querySelector(':scope > span');
    if (label) label.innerHTML = `Score <b>Optional</b>`;
    scoreInput.min = '0';
    scoreInput.max = String(maxPoints);
    scoreInput.step = '0.01';
    scoreInput.placeholder = 'Enter score';

    const scoreWrap = document.createElement('div');
    scoreWrap.className = 'internship-score-input-wrap';
    scoreInput.parentNode.insertBefore(scoreWrap, scoreInput);
    scoreWrap.appendChild(scoreInput);
    scoreWrap.insertAdjacentHTML('beforeend', `<span class="internship-score-max">out of <strong>${esc(maxPoints)}</strong> points</span>`);
    scoreField.insertAdjacentHTML('beforeend', `<small>Optional. Enter a score from 0 to ${esc(maxPoints)}.</small>`);

    const summary = modal.querySelector('.internship-modal-summary');
    summary?.insertAdjacentHTML('beforeend', `<div class="internship-review-max-points"><span>Task value</span><strong>${esc(maxPoints)} points</strong></div>`);
  } catch (error) {
    console.warn('Unable to configure task score.', error);
  }
}

document.addEventListener('click', event => {
  const reviewButton = event.target.closest('.approve-task');
  if (reviewButton) activeReviewTaskId = reviewButton.dataset.id || null;
});

const observer = new MutationObserver(() => {
  const reviewModal = [...document.querySelectorAll('.internship-modal-overlay')].find(item => item.querySelector('.internship-modal-heading p')?.textContent.trim() === 'SUPERVISOR REVIEW');
  if (reviewModal) configureReviewScore(reviewModal);
  decorateInternTasks();
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

window.addEventListener('internship-task-updated', () => {
  taskCacheAt = 0;
  decorateInternTasks();
});