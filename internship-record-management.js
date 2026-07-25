import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, doc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let records = { programs: [], enrollments: [], accounts: [] };
let decorateTimer = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes(permission)
    || permissions.includes('internships.manage');
};

const canEditPrograms = () => has('internships.manage_programs');
const canDeleteRecords = () => has('internships.manage');
const canEditEnrollments = () => has('internships.assign') || has('internships.manage_people');

const dateValue = value => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;

async function refreshRecords() {
  const [programs, enrollments, accounts] = await Promise.all([
    getDocs(collection(db, 'internshipPrograms')),
    getDocs(collection(db, 'internshipEnrollments')),
    getDocs(collection(db, 'portalAccounts')),
  ]);
  records = {
    programs: programs.docs.map(item => ({ id: item.id, ...item.data() })),
    enrollments: enrollments.docs.map(item => ({ id: item.id, ...item.data() })),
    accounts: accounts.docs.map(item => ({ id: item.id, ...item.data() })),
  };
}

function notify(message, type = 'success') {
  let stack = document.querySelector('.internship-record-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'internship-record-toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `internship-record-toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '!'}</span><div><strong>${type === 'success' ? 'Saved' : 'Unable to complete'}</strong><p>${esc(message)}</p></div>`;
  stack.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 180);
  }, 4200);
}

function field(label, name, options = {}) {
  const { type = 'text', value = '', required = false, rows = 4, min = '', max = '' } = options;
  const input = type === 'textarea'
    ? `<textarea name="${name}" rows="${rows}" ${required ? 'required' : ''}>${esc(value)}</textarea>`
    : `<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${min !== '' ? `min="${esc(min)}"` : ''} ${max !== '' ? `max="${esc(max)}"` : ''}>`;
  return `<label class="record-modal-field"><span>${esc(label)}${required ? '<b>Required</b>' : ''}</span>${input}</label>`;
}

function selectField(label, name, options, selected = '', required = false) {
  return `<label class="record-modal-field"><span>${esc(label)}${required ? '<b>Required</b>' : ''}</span><select name="${name}" ${required ? 'required' : ''}>${options.map(option => `<option value="${esc(option.value)}" ${String(option.value) === String(selected) ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></label>`;
}

function openRecordModal({ eyebrow, title, description, body, submitLabel = 'Save changes', destructive = false, onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'record-modal-overlay';
  overlay.innerHTML = `<div class="record-modal" role="dialog" aria-modal="true">
    <form>
      <header><div class="record-modal-icon">${destructive ? '!' : '✦'}</div><div><p>${esc(eyebrow)}</p><h2>${esc(title)}</h2><span>${esc(description || '')}</span></div><button type="button" class="record-modal-close">×</button></header>
      <main>${body}<div class="record-modal-error" hidden></div></main>
      <footer><button type="button" class="record-modal-cancel">Cancel</button><button type="submit" class="record-modal-submit ${destructive ? 'danger' : ''}"><span>${esc(submitLabel)}</span><i></i></button></footer>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  const submit = overlay.querySelector('.record-modal-submit');
  const errorBox = overlay.querySelector('.record-modal-error');
  const close = () => {
    overlay.classList.add('closing');
    window.setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector('.record-modal-close').onclick = close;
  overlay.querySelector('.record-modal-cancel').onclick = close;
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay && !submit.disabled) close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.classList.add('loading');
    errorBox.hidden = true;
    try {
      await onSubmit(new FormData(form));
      close();
    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || 'The request could not be completed.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  });
  requestAnimationFrame(() => overlay.classList.add('open'));
  window.setTimeout(() => overlay.querySelector('input, select, textarea')?.focus(), 80);
}

function editProgram(program) {
  openRecordModal({
    eyebrow: 'PROGRAM DESIGN',
    title: 'Edit internship program',
    description: 'Update the program information shown throughout the Internship Center.',
    body: `<div class="record-form-grid two">${field('Program title', 'title', { value: program.title, required: true })}${field('Program code', 'code', { value: program.code || '' })}</div>${field('Description', 'description', { type: 'textarea', rows: 5, value: program.description || '', required: true })}<div class="record-form-grid two">${field('Department', 'departmentName', { value: program.departmentName || 'General' })}${field('Duration in weeks', 'durationWeeks', { type: 'number', value: program.durationWeeks || 6, min: 1, max: 52, required: true })}</div><div class="record-form-grid two">${selectField('Status', 'status', [{ value: 'DRAFT', label: 'Draft' }, { value: 'ACTIVE', label: 'Active' }, { value: 'ARCHIVED', label: 'Archived' }], program.status || 'DRAFT', true)}${field('Version', 'version', { value: program.version || '1.0', required: true })}</div>`,
    onSubmit: async data => {
      const title = String(data.get('title') || '').trim();
      const description = String(data.get('description') || '').trim();
      if (!title || !description) throw new Error('Program title and description are required.');
      await updateDoc(doc(db, 'internshipPrograms', program.id), {
        title,
        code: String(data.get('code') || '').trim(),
        description,
        departmentName: String(data.get('departmentName') || 'General').trim() || 'General',
        durationWeeks: Number(data.get('durationWeeks') || 6),
        status: String(data.get('status') || 'DRAFT'),
        version: String(data.get('version') || '1.0').trim() || '1.0',
        updatedAt: serverTimestamp(),
      });
      await refreshRecords();
      scheduleDecoration();
      notify(`“${title}” was updated.`);
      document.querySelector('[data-internship-tab="programs"]')?.click();
    },
  });
}

function deleteProgram(program) {
  const linkedEnrollments = records.enrollments.filter(item => item.programId === program.id).length;
  openRecordModal({
    eyebrow: 'DELETE PROGRAM',
    title: `Delete ${program.title || 'this program'}?`,
    description: 'This permanently removes the program record and cannot be undone.',
    destructive: true,
    submitLabel: 'Delete program',
    body: `<div class="record-delete-warning"><strong>This action is permanent.</strong><p>${linkedEnrollments ? `${linkedEnrollments} enrollment record(s) currently reference this program. Those enrollment records will remain, but the program itself will be removed.` : 'No enrollment records currently reference this program.'}</p></div>`,
    onSubmit: async () => {
      await deleteDoc(doc(db, 'internshipPrograms', program.id));
      await refreshRecords();
      notify(`${program.title || 'The program'} was deleted.`);
      document.querySelector('[data-internship-tab="programs"]')?.click();
    },
  });
}

function editEnrollment(enrollment) {
  const accountOptions = records.accounts
    .filter(item => String(item.portalStatus || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .sort((a, b) => String(a.displayName || a.portalUsername || '').localeCompare(String(b.displayName || b.portalUsername || '')))
    .map(item => ({ value: item.id, label: item.displayName || item.portalUsername || item.id }));
  const programOptions = records.programs.map(item => ({ value: item.id, label: item.title || 'Untitled program' }));
  openRecordModal({
    eyebrow: 'PEOPLE & ASSIGNMENTS',
    title: 'Edit internship enrollment',
    description: 'Change the intern, program, supervisor, timeline, status, or standing.',
    body: `<div class="record-form-grid two">${selectField('Intern', 'internUid', accountOptions, enrollment.internUid, true)}${selectField('Program', 'programId', programOptions, enrollment.programId, true)}</div><div class="record-form-grid two">${selectField('Supervisor', 'supervisorUid', accountOptions, enrollment.supervisorUid, true)}${selectField('Standing', 'standing', [{ value: 'On Track', label: 'On Track' }, { value: 'Monitor', label: 'Monitor' }, { value: 'Attention Needed', label: 'Attention Needed' }, { value: 'Improvement Plan', label: 'Improvement Plan' }], enrollment.standing || 'On Track', true)}</div><div class="record-form-grid two">${field('Start date', 'startDate', { type: 'date', value: dateValue(enrollment.startDate), required: true })}${field('Expected completion', 'expectedCompletionDate', { type: 'date', value: dateValue(enrollment.expectedCompletionDate), required: true })}</div><div class="record-form-grid two">${selectField('Status', 'status', [{ value: 'PENDING', label: 'Pending' }, { value: 'ACTIVE', label: 'Active' }, { value: 'PAUSED', label: 'Paused' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'WITHDRAWN', label: 'Withdrawn' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'UNSUCCESSFUL', label: 'Unsuccessful' }], enrollment.status || 'ACTIVE', true)}${field('Current phase', 'currentPhase', { value: enrollment.currentPhase || 'Orientation' })}</div>${field('Coordinator notes', 'coordinatorNotes', { type: 'textarea', rows: 4, value: enrollment.coordinatorNotes || enrollment.supervisorNotes || '' })}`,
    onSubmit: async data => {
      const intern = records.accounts.find(item => item.id === String(data.get('internUid')));
      const supervisor = records.accounts.find(item => item.id === String(data.get('supervisorUid')));
      const program = records.programs.find(item => item.id === String(data.get('programId')));
      const startDate = String(data.get('startDate') || '');
      const expectedCompletionDate = String(data.get('expectedCompletionDate') || '');
      if (!intern || !supervisor || !program) throw new Error('Select a valid intern, program, and supervisor.');
      if (new Date(`${expectedCompletionDate}T12:00:00`) < new Date(`${startDate}T12:00:00`)) throw new Error('Expected completion must be after the start date.');
      await updateDoc(doc(db, 'internshipEnrollments', enrollment.id), {
        internUid: intern.id,
        internName: intern.displayName || intern.portalUsername || 'Intern',
        internUsername: intern.portalUsername || '',
        programId: program.id,
        programTitle: program.title || 'Internship Program',
        programVersion: program.version || '1.0',
        departmentName: program.departmentName || 'General',
        supervisorUid: supervisor.id,
        supervisorName: supervisor.displayName || supervisor.portalUsername || 'Supervisor',
        startDate: toTimestamp(startDate),
        expectedCompletionDate: toTimestamp(expectedCompletionDate),
        status: String(data.get('status') || 'ACTIVE'),
        standing: String(data.get('standing') || 'On Track'),
        currentPhase: String(data.get('currentPhase') || 'Orientation').trim() || 'Orientation',
        coordinatorNotes: String(data.get('coordinatorNotes') || '').trim(),
        updatedAt: serverTimestamp(),
      });
      await refreshRecords();
      notify(`${intern.displayName || intern.portalUsername}'s enrollment was updated.`);
      document.querySelector('[data-internship-tab="interns"]')?.click();
    },
  });
}

function deleteEnrollment(enrollment) {
  openRecordModal({
    eyebrow: 'DELETE ENROLLMENT',
    title: `Remove ${enrollment.internName || 'this intern'} from the program?`,
    description: 'This permanently deletes the enrollment record. Existing task records are not automatically removed.',
    destructive: true,
    submitLabel: 'Delete enrollment',
    body: `<div class="record-delete-warning"><strong>${esc(enrollment.programTitle || 'Internship Program')}</strong><p>Deleting this record removes the intern’s enrollment, timeline, standing, and progress record from the Internship Center.</p></div>`,
    onSubmit: async () => {
      await deleteDoc(doc(db, 'internshipEnrollments', enrollment.id));
      await refreshRecords();
      notify(`${enrollment.internName || 'The intern'} was removed from the internship.`);
      document.querySelector('[data-internship-tab="interns"]')?.click();
    },
  });
}

function actionButtons(type, record) {
  const wrapper = document.createElement('div');
  wrapper.className = 'internship-record-actions';
  if ((type === 'program' && canEditPrograms()) || (type === 'enrollment' && canEditEnrollments())) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'internship-record-action edit';
    edit.innerHTML = '<span>✎</span>Edit';
    edit.onclick = event => {
      event.stopPropagation();
      type === 'program' ? editProgram(record) : editEnrollment(record);
    };
    wrapper.appendChild(edit);
  }
  if (canDeleteRecords()) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'internship-record-action delete';
    remove.innerHTML = '<span>⌫</span>Delete';
    remove.onclick = event => {
      event.stopPropagation();
      type === 'program' ? deleteProgram(record) : deleteEnrollment(record);
    };
    wrapper.appendChild(remove);
  }
  return wrapper;
}

function decoratePrograms() {
  const heading = [...document.querySelectorAll('.internship-section-head h2')].find(item => item.textContent.trim() === 'Internship programs');
  const section = heading?.closest('.internship-section');
  if (!section) return;
  section.querySelectorAll('.internship-card').forEach(card => {
    if (card.dataset.recordManaged === 'true') return;
    const title = card.querySelector('h3')?.textContent.trim();
    const description = card.querySelector('p')?.textContent.trim();
    const program = records.programs.find(item => String(item.title || '').trim() === title && String(item.description || '').trim() === description)
      || records.programs.find(item => String(item.title || '').trim() === title);
    if (!program) return;
    card.dataset.recordManaged = 'true';
    card.appendChild(actionButtons('program', program));
  });
}

function decorateEnrollments() {
  const heading = [...document.querySelectorAll('.internship-section-head h2')].find(item => item.textContent.trim() === 'Internship enrollments');
  const section = heading?.closest('.internship-section');
  if (!section) return;
  section.querySelectorAll('.internship-card').forEach(card => {
    if (card.dataset.recordManaged === 'true') return;
    const internName = card.querySelector('h3')?.textContent.trim();
    const programTitle = card.querySelector('p')?.textContent.trim();
    const enrollment = records.enrollments.find(item => String(item.internName || '').trim() === internName && String(item.programTitle || '').trim() === programTitle);
    if (!enrollment) return;
    card.dataset.recordManaged = 'true';
    card.appendChild(actionButtons('enrollment', enrollment));
  });
}

function scheduleDecoration() {
  window.clearTimeout(decorateTimer);
  decorateTimer = window.setTimeout(() => {
    decoratePrograms();
    decorateEnrollments();
  }, 80);
}

const observer = new MutationObserver(scheduleDecoration);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const accountSnapshot = await getDocs(collection(db, 'portalAccounts'));
  const accountDoc = accountSnapshot.docs.find(item => item.id === user.uid);
  account = accountDoc?.data() || null;
  if (!canEditPrograms() && !canEditEnrollments() && !canDeleteRecords()) return;
  await refreshRecords();
  scheduleDecoration();
});
