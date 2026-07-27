import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function closeAssignModal() {
  document.getElementById('assignFormModal')?.remove();
  document.documentElement.classList.remove('assign-form-open');
}

async function loadAssignData() {
  const [templateSnapshot, accountSnapshot] = await Promise.all([
    getDocs(collection(db, 'performanceTemplates')),
    getDocs(collection(db, 'portalAccounts')),
  ]);

  return {
    templates: templateSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => String(item.status || '').toUpperCase() === 'ACTIVE'),
    accounts: accountSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE'),
  };
}

async function openAssignModal() {
  closeAssignModal();
  document.documentElement.classList.add('assign-form-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="assign-form-overlay" id="assignFormModal" role="dialog" aria-modal="true" aria-labelledby="assignFormTitle">
      <section class="assign-form-modal">
        <div class="assign-form-loading">Loading assignment options…</div>
      </section>
    </div>`);

  const overlay = document.getElementById('assignFormModal');
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeAssignModal();
  });

  try {
    const data = await loadAssignData();
    const modal = overlay.querySelector('.assign-form-modal');
    modal.innerHTML = `
      <form id="assignFormModalForm">
        <header class="assign-form-head">
          <div>
            <p>FORMS CENTER</p>
            <h2 id="assignFormTitle">Assign a form</h2>
            <span>Choose a form, recipient, due date, and instructions.</span>
          </div>
          <button type="button" class="assign-form-close" aria-label="Close">×</button>
        </header>

        <div class="assign-form-body">
          <label class="assign-form-field full">
            <span>Form <b>Required</b></span>
            <select name="templateId" required>
              <option value="">Select a form</option>
              ${data.templates.map(item => `<option value="${item.id}">${esc(item.title || 'Untitled form')}</option>`).join('')}
            </select>
            ${data.templates.length ? '' : '<small>No active forms are available. Activate a form under Manage Forms first.</small>'}
          </label>

          <label class="assign-form-field full">
            <span>Assign to <b>Required</b></span>
            <select name="employeeUid" required>
              <option value="">Select a staff account</option>
              ${data.accounts.map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('')}
            </select>
          </label>

          <label class="assign-form-field">
            <span>Due date <b>Optional</b></span>
            <input type="date" name="dueDate">
          </label>

          <label class="assign-form-field">
            <span>Custom title <b>Optional</b></span>
            <input name="title" placeholder="Uses the form title by default">
          </label>

          <label class="assign-form-field full">
            <span>Instructions <b>Optional</b></span>
            <textarea name="notes" placeholder="Add context or instructions for the person completing this form."></textarea>
          </label>

          <div class="assign-form-error" id="assignFormError" hidden></div>
        </div>

        <footer class="assign-form-actions">
          <button type="button" class="assign-form-cancel">Cancel</button>
          <button type="submit" class="assign-form-submit" ${!data.templates.length || !data.accounts.length ? 'disabled' : ''}>
            <span>Assign form</span>
          </button>
        </footer>
      </form>`;

    modal.querySelector('.assign-form-close').onclick = closeAssignModal;
    modal.querySelector('.assign-form-cancel').onclick = closeAssignModal;
    modal.querySelector('select[name="templateId"]')?.focus();

    modal.querySelector('#assignFormModalForm').onsubmit = async event => {
      event.preventDefault();
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const template = data.templates.find(item => item.id === String(form.get('templateId')));
      const employeeUid = String(form.get('employeeUid'));
      const employee = data.accounts.find(item => item.id === employeeUid);
      const due = String(form.get('dueDate') || '');
      const submit = formElement.querySelector('.assign-form-submit');
      const errorBox = formElement.querySelector('#assignFormError');

      if (!template || !employee) {
        errorBox.hidden = false;
        errorBox.textContent = 'Select both a form and a staff account.';
        return;
      }

      submit.disabled = true;
      submit.classList.add('loading');
      submit.querySelector('span').textContent = 'Assigning…';
      errorBox.hidden = true;

      try {
        await addDoc(collection(db, 'performanceReviews'), {
          templateId: template.id,
          templateSnapshot: {
            title: template.title,
            fields: template.fields || [],
            category: template.category || 'General',
          },
          title: String(form.get('title') || '').trim() || template.title,
          employeeUid,
          employeeName: employee.displayName || employee.portalUsername || employeeUid,
          status: 'ASSIGNED',
          responses: {},
          workflowSteps: [],
          currentStepIndex: 0,
          currentStepName: 'Complete form',
          currentRequiredPermission: 'performance.review.self_complete',
          currentAssignedToUid: employeeUid,
          currentAssignedToName: employee.displayName || employee.portalUsername || employeeUid,
          reviewerPermission: 'performance.review.evaluate',
          reviewerCandidates: [],
          dueDate: due ? Timestamp.fromDate(new Date(`${due}T12:00:00`)) : null,
          notes: String(form.get('notes') || '').trim(),
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        closeAssignModal();
        document.querySelector('[data-performance-tab="all"]')?.click();
      } catch (error) {
        console.error(error);
        errorBox.hidden = false;
        errorBox.textContent = `Unable to assign form: ${error.code || error.message}`;
        submit.disabled = false;
        submit.classList.remove('loading');
        submit.querySelector('span').textContent = 'Assign form';
      }
    };
  } catch (error) {
    console.error(error);
    overlay.querySelector('.assign-form-modal').innerHTML = `
      <div class="assign-form-failure">
        <h2>Unable to open Assign Form</h2>
        <p>${esc(error.code || error.message)}</p>
        <button type="button" class="assign-form-cancel">Close</button>
      </div>`;
    overlay.querySelector('.assign-form-cancel').onclick = closeAssignModal;
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('#createPerformanceReview');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openAssignModal();
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('assignFormModal')) closeAssignModal();
});
