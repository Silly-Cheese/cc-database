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
  document.getElementById('formsAssignModal')?.remove();
  document.documentElement.classList.remove('forms-modal-open');
}

async function loadOptions() {
  const [templateSnap, accountSnap] = await Promise.all([
    getDocs(collection(db, 'performanceTemplates')),
    getDocs(collection(db, 'portalAccounts')),
  ]);

  const templates = templateSnap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => String(item.status || '').toUpperCase() === 'ACTIVE');

  const accounts = accountSnap.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE')
    .sort((a, b) => String(a.displayName || a.portalUsername || '').localeCompare(String(b.displayName || b.portalUsername || '')));

  return { templates, accounts };
}

async function openAssignModal() {
  closeAssignModal();
  document.documentElement.classList.add('forms-modal-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="performance-modal-overlay" id="formsAssignModal" role="dialog" aria-modal="true" aria-labelledby="formsAssignTitle">
      <section class="performance-modal">
        <div class="performance-modal-head">
          <div><p>FORMS CENTER</p><h2 id="formsAssignTitle">Assign a form</h2><span>Choose a form, recipient, and due date.</span></div>
          <button type="button" data-forms-assign-close aria-label="Close">×</button>
        </div>
        <div class="performance-modal-body"><div class="performance-loading">Loading available forms and accounts…</div></div>
      </section>
    </div>`);

  const modal = document.getElementById('formsAssignModal');
  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-forms-assign-close]')) closeAssignModal();
  });

  try {
    const { templates, accounts } = await loadOptions();
    const body = modal.querySelector('.performance-modal-body');
    if (!templates.length) {
      body.innerHTML = '<div class="performance-empty">There are no active forms to assign. Activate a form in Manage Forms first.</div>';
      return;
    }

    body.outerHTML = `
      <form id="formsAssignForm">
        <div class="performance-modal-body performance-two">
          <label>Form
            <select name="templateId" required>
              <option value="">Select a form…</option>
              ${templates.map(item => `<option value="${item.id}">${esc(item.title || 'Untitled form')}</option>`).join('')}
            </select>
          </label>
          <label>Assign to
            <select name="employeeUid" required>
              <option value="">Select a person…</option>
              ${accounts.map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('')}
            </select>
          </label>
          <label>Due date <small>(optional)</small>
            <input type="date" name="dueDate">
          </label>
          <label>Custom title <small>(optional)</small>
            <input name="title" placeholder="Defaults to the form title">
          </label>
          <label class="full">Assignment instructions <small>(optional)</small>
            <textarea name="notes" placeholder="Add context, expectations, or special instructions."></textarea>
          </label>
        </div>
        <div class="performance-modal-actions">
          <button type="button" class="performance-btn" data-forms-assign-close>Cancel</button>
          <button type="submit" class="performance-btn primary">Assign form</button>
        </div>
      </form>`;

    const form = document.getElementById('formsAssignForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const values = new FormData(form);
      const template = templates.find(item => item.id === String(values.get('templateId')));
      const employeeUid = String(values.get('employeeUid'));
      const employee = accounts.find(item => item.id === employeeUid);
      if (!template || !employee) return;

      submit.disabled = true;
      submit.textContent = 'Assigning…';
      try {
        const due = String(values.get('dueDate') || '');
        await addDoc(collection(db, 'performanceReviews'), {
          templateId: template.id,
          templateSnapshot: {
            title: template.title || 'Untitled form',
            fields: template.fields || [],
            category: template.category || 'General',
          },
          title: String(values.get('title') || '').trim() || template.title || 'Assigned Form',
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
          reviewerCandidates: accounts.filter(item => {
            const roles = item.systemRoles || [];
            const permissions = item.permissions || [];
            return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes('performance.review.evaluate') || permissions.includes('performance.review.manage');
          }).map(item => item.id),
          dueDate: due ? Timestamp.fromDate(new Date(`${due}T12:00:00`)) : null,
          notes: String(values.get('notes') || '').trim(),
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        closeAssignModal();
        document.querySelector('[data-performance-tab="all"]')?.click();
      } catch (error) {
        console.error(error);
        alert(`Unable to assign form: ${error.code || error.message}`);
        submit.disabled = false;
        submit.textContent = 'Assign form';
      }
    });
  } catch (error) {
    console.error(error);
    modal.querySelector('.performance-modal-body').innerHTML = `<div class="performance-empty">Unable to load assignment options: ${esc(error.code || error.message)}</div>`;
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
  if (event.key === 'Escape' && document.getElementById('formsAssignModal')) closeAssignModal();
});
