import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

function hasPermission(permission) {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes(permission)
    || permissions.includes('internships.manage');
}

function canMarkComplete() {
  return hasPermission('internships.assign')
    || hasPermission('internships.manage_people')
    || hasPermission('internships.supervise');
}

function showToast(message, type = 'success') {
  let stack = document.querySelector('.internship-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'internship-toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `internship-toast ${type}`;
  toast.innerHTML = `<span class="internship-toast-icon">${type === 'success' ? '✓' : '!'}</span><div><strong>${type === 'success' ? 'Success' : 'Something went wrong'}</strong><p>${esc(message)}</p></div><button type="button" aria-label="Dismiss">×</button>`;
  stack.appendChild(toast);
  const dismiss = () => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 180);
  };
  toast.querySelector('button').onclick = dismiss;
  setTimeout(dismiss, 4200);
}

function openCompletionModal(task) {
  const overlay = document.createElement('div');
  overlay.className = 'internship-modal-overlay internship-completion-overlay';
  overlay.innerHTML = `<div class="internship-modal" role="dialog" aria-modal="true" aria-labelledby="completionModalTitle">
    <form class="internship-modal-form">
      <header class="internship-modal-header">
        <div class="internship-modal-mark internship-completion-mark">✓</div>
        <div class="internship-modal-heading">
          <p>MANAGEMENT COMPLETION</p>
          <h2 id="completionModalTitle">Mark task complete for review</h2>
          <span>This moves the task into the Review Queue without requiring the intern to submit it first.</span>
        </div>
        <button class="internship-modal-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="internship-modal-body">
        <div class="internship-modal-summary">
          <span>${esc(task.internName || 'Intern')}</span>
          <strong>${esc(task.title || 'Internship Task')}</strong>
          <p>${esc(task.programTitle || 'Internship Program')}</p>
        </div>
        <label class="internship-field">
          <span>Completion note <small>Optional</small></span>
          <textarea name="completionNote" rows="5" placeholder="Explain why this task is being marked complete on the intern’s behalf, or note what was observed…"></textarea>
          <small>This note will be visible during the supervisor review and can be replaced by final review feedback.</small>
        </label>
        <div class="internship-completion-callout">
          <strong>What happens next?</strong>
          <span>The task status changes to Submitted and appears in the assigned supervisor’s Review Queue.</span>
        </div>
        <div class="internship-modal-error" hidden></div>
      </div>
      <footer class="internship-modal-footer">
        <button type="button" class="internship-modal-cancel">Cancel</button>
        <button type="submit" class="internship-modal-submit"><span>Mark complete for review</span><i class="internship-spinner" aria-hidden="true"></i></button>
      </footer>
    </form>
  </div>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('form');
  const submit = overlay.querySelector('.internship-modal-submit');
  const errorBox = overlay.querySelector('.internship-modal-error');
  const close = () => {
    overlay.classList.add('closing');
    document.removeEventListener('keydown', keyHandler);
    setTimeout(() => overlay.remove(), 180);
  };
  const keyHandler = event => {
    if (event.key === 'Escape' && !submit.disabled) close();
  };
  overlay.querySelector('.internship-modal-close').onclick = close;
  overlay.querySelector('.internship-modal-cancel').onclick = close;
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay && !submit.disabled) close();
  });
  document.addEventListener('keydown', keyHandler);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.classList.add('loading');
    errorBox.hidden = true;
    try {
      const note = String(new FormData(form).get('completionNote') || '').trim();
      await updateDoc(doc(db, 'internshipTasks', task.id), {
        status: 'SUBMITTED',
        supervisorFeedback: note || 'Marked complete for review by internship management.',
        updatedAt: serverTimestamp()
      });
      close();
      showToast(`“${task.title || 'The task'}” was marked complete and sent to the Review Queue.`);
      setTimeout(() => document.querySelector('[data-internship-task-management]')?.click(), 220);
    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || 'The task could not be marked complete.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  });

  requestAnimationFrame(() => overlay.classList.add('open'));
  setTimeout(() => overlay.querySelector('textarea')?.focus(), 100);
}

async function handleCompletion(taskId) {
  try {
    const snapshot = await getDoc(doc(db, 'internshipTasks', taskId));
    if (!snapshot.exists()) throw new Error('This task no longer exists.');
    const task = { id: snapshot.id, ...snapshot.data() };
    if (hasPermission('internships.supervise')
      && !hasPermission('internships.assign')
      && !hasPermission('internships.manage_people')
      && task.supervisorUid !== auth.currentUser?.uid) {
      throw new Error('You can only mark tasks complete for interns assigned to you.');
    }
    if (['SUBMITTED', 'APPROVED', 'WAIVED'].includes(String(task.status || '').toUpperCase())) {
      throw new Error('This task is already submitted or completed.');
    }
    openCompletionModal(task);
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Unable to open this task.', 'error');
  }
}

function installCompletionButtons() {
  if (!account || !canMarkComplete()) return;
  document.querySelectorAll('.internship-task-admin-card').forEach(card => {
    if (card.querySelector('.internship-mark-complete')) return;
    const sourceButton = card.querySelector('[data-task-id]');
    const taskId = sourceButton?.dataset.taskId;
    if (!taskId) return;
    const status = card.querySelector('.internship-badge')?.textContent?.trim().toUpperCase() || '';
    if (['SUBMITTED', 'APPROVED', 'WAIVED'].includes(status)) return;
    let actions = card.querySelector('.internship-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'internship-actions';
      card.appendChild(actions);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'internship-btn internship-mark-complete';
    button.dataset.taskId = taskId;
    button.innerHTML = '<span aria-hidden="true">✓</span> Mark complete';
    button.addEventListener('click', () => handleCompletion(taskId));
    actions.prepend(button);
  });
}

const observer = new MutationObserver(installCompletionButtons);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
  installCompletionButtons();
});
