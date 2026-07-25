import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

function canDeleteTasks() {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes('internships.manage');
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

function openDeleteTaskModal(taskId, taskTitle, card) {
  const overlay = document.createElement('div');
  overlay.className = 'internship-modal-overlay';
  overlay.innerHTML = `<div class="internship-modal internship-modal-medium" role="dialog" aria-modal="true" aria-labelledby="deleteInternshipTaskTitle">
    <form class="internship-modal-form">
      <header class="internship-modal-header">
        <div class="internship-modal-mark internship-modal-mark-danger">!</div>
        <div class="internship-modal-heading"><p>DESTRUCTIVE ACTION</p><h2 id="deleteInternshipTaskTitle">Delete internship task?</h2><span>This permanently removes the task from the Internship Center.</span></div>
        <button class="internship-modal-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="internship-modal-body">
        <div class="internship-delete-summary"><span>Task to be deleted</span><strong>${esc(taskTitle || 'Internship Task')}</strong></div>
        <div class="internship-callout danger"><strong>This cannot be undone.</strong><span>The intern will no longer see this assignment. Existing submission-history documents are not automatically removed.</span></div>
        <div class="internship-modal-error" hidden></div>
      </div>
      <footer class="internship-modal-footer"><button type="button" class="internship-modal-cancel">Keep task</button><button type="submit" class="internship-modal-submit danger"><span>Delete task</span><i class="internship-spinner" aria-hidden="true"></i></button></footer>
    </form>
  </div>`;
  document.body.appendChild(overlay);

  const form = overlay.querySelector('form');
  const submit = overlay.querySelector('.internship-modal-submit');
  const errorBox = overlay.querySelector('.internship-modal-error');
  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 180);
  };

  overlay.querySelector('.internship-modal-close').onclick = close;
  overlay.querySelector('.internship-modal-cancel').onclick = close;
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay && !submit.disabled) close();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.classList.add('loading');
    errorBox.hidden = true;
    try {
      await deleteDoc(doc(db, 'internshipTasks', taskId));
      close();
      card?.remove();
      showToast(`“${taskTitle || 'Internship Task'}” was deleted.`);
      setTimeout(() => document.querySelector('[data-internship-task-management]')?.click(), 250);
    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || 'The task could not be deleted.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  });

  requestAnimationFrame(() => overlay.classList.add('open'));
}

function installDeleteButtons() {
  if (!canDeleteTasks()) return;
  document.querySelectorAll('.internship-task-admin-card').forEach(card => {
    if (card.querySelector('.internship-delete-task')) return;
    const editButton = card.querySelector('.internship-edit-task');
    const actions = editButton?.closest('.internship-actions');
    if (!actions || !editButton?.dataset.taskId) return;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'internship-btn internship-btn-danger internship-delete-task';
    deleteButton.dataset.taskId = editButton.dataset.taskId;
    deleteButton.textContent = 'Delete task';
    deleteButton.addEventListener('click', () => {
      const title = card.querySelector('h3')?.textContent?.trim() || 'Internship Task';
      openDeleteTaskModal(deleteButton.dataset.taskId, title, card);
    });
    actions.appendChild(deleteButton);
  });
}

const observer = new MutationObserver(installDeleteButtons);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
  installDeleteButtons();
});
