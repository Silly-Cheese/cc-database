import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let currentTab = 'my-forms';
let cache = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dateText = value => {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};
const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes(permission);
};

const canAccess = () => has('performance.access') || has('performance.review.create') || has('performance.review.evaluate') || has('performance.review.approve') || has('performance.review.view_all') || has('performance.review.manage');
const canAssign = () => has('performance.review.create') || has('performance.review.manage');
const canReview = () => has('performance.review.evaluate') || has('performance.review.approve') || has('performance.review.finalize') || has('performance.review.manage');
const canManageForms = () => has('performance.review.manage_templates') || has('performance.review.manage');
const canViewAll = () => has('performance.review.view_all') || has('performance.review.manage');
const canDelete = () => has('performance.review.delete') || has('performance.review.manage');

async function loadData(force = false) {
  if (cache && !force && Date.now() - cache.loadedAt < 12000) return cache;
  const names = ['performanceReviews', 'performanceTemplates', 'portalAccounts', 'staffProfiles'];
  const [reviews, templates, accounts, staff] = await Promise.all(names.map(async name => {
    try {
      const snap = await getDocs(collection(db, name));
      return snap.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
      console.warn(`Unable to load ${name}`, error);
      return [];
    }
  }));
  cache = { reviews, templates, accounts, staff, loadedAt: Date.now() };
  return cache;
}

function displayNameFor(data, uid) {
  const portal = data.accounts.find(item => item.id === uid);
  if (portal) return portal.displayName || portal.portalUsername || uid;
  const staff = data.staff.find(item => item.portalUid === uid || item.userUid === uid || item.id === uid);
  return staff?.displayName || staff?.robloxUsername || uid || 'Unassigned';
}

function statusOf(record) {
  const raw = String(record.status || 'ASSIGNED').toUpperCase();
  const map = {
    DRAFT: 'ASSIGNED', ASSIGNED: 'ASSIGNED', IN_PROGRESS: 'IN_PROGRESS',
    AWAITING_REVIEW: 'SUBMITTED', SUBMITTED: 'SUBMITTED',
    AWAITING_APPROVAL: 'SUBMITTED', AWAITING_FINALIZATION: 'SUBMITTED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED', COMPLETED: 'APPROVED', APPROVED: 'APPROVED',
    ARCHIVED: 'CLOSED', CLOSED: 'CLOSED',
  };
  return map[raw] || raw;
}

function badge(status) {
  const normalized = String(status || 'ASSIGNED').toUpperCase();
  return `<span class="forms-badge ${normalized.toLowerCase().replaceAll('_','-')}">${esc(normalized.replaceAll('_',' '))}</span>`;
}

function tab(id, label) {
  return `<button class="forms-tab ${currentTab === id ? 'active' : ''}" data-forms-tab="${id}">${label}</button>`;
}

function navButton() {
  const sidebar = document.querySelector('#sidebar nav');
  if (!sidebar || !canAccess()) return;
  const old = sidebar.querySelector('[data-performance-center]');
  if (old) {
    old.innerHTML = '<span>📝</span>Forms Center';
    old.onclick = () => openFormsCenter();
    old.dataset.formsCenter = 'true';
    return;
  }
  if (sidebar.querySelector('[data-forms-center]')) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.formsCenter = 'true';
  button.innerHTML = '<span>📝</span>Forms Center';
  const training = sidebar.querySelector('[data-view="training"]');
  if (training) sidebar.insertBefore(button, training); else sidebar.appendChild(button);
  button.onclick = () => openFormsCenter();
}

function stat(value, label) {
  return `<article class="forms-stat"><strong>${value}</strong><span>${label}</span></article>`;
}

function card(data, record, mode = 'mine') {
  const employee = record.employeeName || displayNameFor(data, record.employeeUid);
  const reviewer = record.currentAssignedToName || displayNameFor(data, record.currentAssignedToUid);
  const status = statusOf(record);
  const title = record.title || data.templates.find(item => item.id === record.templateId)?.title || 'Assigned form';
  const action = mode === 'review' ? 'Review submission' : (status === 'CHANGES_REQUESTED' ? 'Update response' : status === 'APPROVED' || status === 'CLOSED' ? 'View response' : 'Open form');
  return `<article class="forms-card">
    <div class="forms-card-top">${badge(status)}<span>${dateText(record.dueDate)}</span></div>
    <h3>${esc(title)}</h3>
    <p>${mode === 'review' ? esc(employee) : esc(record.description || 'Complete this assigned form.')}</p>
    <div class="forms-card-meta">
      ${mode === 'review' ? `<div><span>Submitted by</span><strong>${esc(employee)}</strong></div>` : `<div><span>Assigned by</span><strong>${esc(record.createdByName || displayNameFor(data, record.createdBy))}</strong></div>`}
      <div><span>Reviewer</span><strong>${esc(reviewer || 'Permission-based queue')}</strong></div>
      <div><span>Status</span><strong>${esc(status.replaceAll('_',' '))}</strong></div>
    </div>
    <div class="forms-card-actions"><button class="forms-btn forms-open-record" data-id="${record.id}">${action}</button>${canDelete() && mode === 'all' ? `<button class="forms-btn danger forms-delete-record" data-id="${record.id}">Delete</button>` : ''}</div>
  </article>`;
}

async function openFormsCenter(tabName = currentTab) {
  currentTab = tabName;
  const main = document.querySelector('.layout > main');
  if (!main) return;
  main.innerHTML = '<section class="forms-loading">Loading Forms Center…</section>';
  try {
    const data = await loadData();
    const uid = auth.currentUser?.uid;
    const mine = data.reviews.filter(item => item.employeeUid === uid);
    const reviewQueue = data.reviews.filter(item => {
      const status = statusOf(item);
      if (!['SUBMITTED','CHANGES_REQUESTED'].includes(status)) return false;
      return item.currentAssignedToUid === uid || (!item.currentAssignedToUid && canReview());
    });
    const assignedToMe = mine.filter(item => !['APPROVED','CLOSED'].includes(statusOf(item))).length;
    const dueSoon = mine.filter(item => {
      const date = item.dueDate?.toDate ? item.dueDate.toDate() : new Date(item.dueDate || 0);
      const days = (date.getTime() - Date.now()) / 86400000;
      return days >= 0 && days <= 7 && !['APPROVED','CLOSED'].includes(statusOf(item));
    }).length;
    const changes = mine.filter(item => statusOf(item) === 'CHANGES_REQUESTED').length;
    main.innerHTML = `
      <div class="forms-center">
        <section class="forms-hero">
          <div><p>FORMS & RESPONSES</p><h1>Forms Center</h1><span>Build forms, assign them, complete them, and review submissions in one simple place.</span></div>
          ${canAssign() ? '<button class="forms-btn primary" id="assignFormButton">+ Assign form</button>' : ''}
        </section>
        <section class="forms-stats">${stat(assignedToMe,'Assigned to me')}${stat(dueSoon,'Due soon')}${stat(reviewQueue.length,'Awaiting my review')}${stat(changes,'Changes requested')}</section>
        <nav class="forms-tabs">
          ${tab('my-forms','My Forms')}
          ${canReview() ? tab('review-queue','Review Queue') : ''}
          ${canViewAll() ? tab('all-forms','All Forms') : ''}
          ${canManageForms() ? tab('manage-forms','Manage Forms') : ''}
        </nav>
        <section class="forms-view" id="formsView">${renderTab(data, mine, reviewQueue)}</section>
      </div>`;
    bindActions(data);
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel"><h1>Forms Center</h1><p class="error">Unable to load: ${esc(error.code || error.message)}</p></section>`;
  }
}

function renderTab(data, mine, reviewQueue) {
  if (currentTab === 'review-queue') {
    return `<section class="forms-section"><div class="forms-section-head"><div><p>SUBMISSIONS</p><h2>Waiting for your review</h2></div><span>${reviewQueue.length} item(s)</span></div><div class="forms-grid">${reviewQueue.map(item => card(data, item, 'review')).join('') || '<div class="forms-empty">Nothing is waiting for your review.</div>'}</div></section>`;
  }
  if (currentTab === 'all-forms') {
    return `<section class="forms-section"><div class="forms-section-head"><div><p>ASSIGNMENT HISTORY</p><h2>All assigned forms</h2></div><span>${data.reviews.length} record(s)</span></div><div class="forms-grid">${data.reviews.map(item => card(data, item, 'all')).join('') || '<div class="forms-empty">No forms have been assigned yet.</div>'}</div></section>`;
  }
  if (currentTab === 'manage-forms') {
    return `<section class="forms-section"><div class="forms-section-head"><div><p>FORM LIBRARY</p><h2>Manage forms</h2></div><button class="forms-btn primary" id="newFormTemplate">+ New form</button></div><div class="forms-grid">${data.templates.map(template => `<article class="forms-card"><div class="forms-card-top">${badge(template.status || 'DRAFT')}<span>${(template.fields || []).length} question(s)</span></div><h3>${esc(template.title || 'Untitled form')}</h3><p>${esc(template.description || 'Reusable form template.')}</p><div class="forms-card-meta"><div><span>Category</span><strong>${esc(template.category || 'General')}</strong></div><div><span>Scoring</span><strong>${template.scoringEnabled ? 'Enabled' : 'Optional'}</strong></div></div><div class="forms-card-actions"><button class="forms-btn forms-edit-template" data-id="${template.id}">Edit</button><button class="forms-btn forms-duplicate-template" data-id="${template.id}">Duplicate</button>${canDelete() ? `<button class="forms-btn danger forms-delete-template" data-id="${template.id}">Delete</button>` : ''}</div></article>`).join('') || '<div class="forms-empty">Create your first reusable form.</div>'}</div></section>`;
  }
  const active = mine.filter(item => !['APPROVED','CLOSED'].includes(statusOf(item)));
  const complete = mine.filter(item => ['APPROVED','CLOSED'].includes(statusOf(item)));
  return `<section class="forms-section"><div class="forms-section-head"><div><p>YOUR WORK</p><h2>What you need to do</h2></div><span>${active.length} active</span></div><div class="forms-grid">${active.map(item => card(data, item, 'mine')).join('') || '<div class="forms-empty">You have no forms waiting for you.</div>'}</div>${complete.length ? `<div class="forms-subsection"><h3>Completed forms</h3><div class="forms-grid">${complete.map(item => card(data, item, 'mine')).join('')}</div></div>` : ''}</section>`;
}

function bindActions(data) {
  document.querySelectorAll('[data-forms-tab]').forEach(button => button.onclick = () => openFormsCenter(button.dataset.formsTab));
  document.getElementById('assignFormButton')?.addEventListener('click', () => assignModal(data));
  document.getElementById('newFormTemplate')?.addEventListener('click', () => formTemplateModal());
  document.querySelectorAll('.forms-open-record').forEach(button => button.onclick = () => recordModal(data, button.dataset.id));
  document.querySelectorAll('.forms-edit-template').forEach(button => button.onclick = async () => {
    const template = data.templates.find(item => item.id === button.dataset.id);
    formTemplateModal(template);
  });
  document.querySelectorAll('.forms-duplicate-template').forEach(button => button.onclick = async () => {
    const template = data.templates.find(item => item.id === button.dataset.id);
    if (!template) return;
    const copy = { ...template };
    delete copy.id;
    copy.title = `${copy.title || 'Form'} Copy`;
    copy.status = 'DRAFT';
    copy.createdAt = serverTimestamp();
    await addDoc(collection(db, 'performanceTemplates'), copy);
    cache = null;
    openFormsCenter('manage-forms');
  });
  document.querySelectorAll('.forms-delete-template').forEach(button => button.onclick = async () => {
    if (!confirm('Delete this form template?')) return;
    await deleteDoc(doc(db, 'performanceTemplates', button.dataset.id));
    cache = null;
    openFormsCenter('manage-forms');
  });
  document.querySelectorAll('.forms-delete-record').forEach(button => button.onclick = async () => {
    if (!confirm('Delete this assigned form record?')) return;
    await deleteDoc(doc(db, 'performanceReviews', button.dataset.id));
    cache = null;
    openFormsCenter('all-forms');
  });
}

function modalShell(title, subtitle, body, footer = '') {
  document.getElementById('formsModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="forms-modal-overlay" id="formsModal"><section class="forms-modal"><div class="forms-modal-head"><div><p>FORMS CENTER</p><h2>${esc(title)}</h2><span>${esc(subtitle)}</span></div><button type="button" id="closeFormsModal">×</button></div><div class="forms-modal-body">${body}</div>${footer ? `<div class="forms-modal-footer">${footer}</div>` : ''}</section></div>`);
  document.getElementById('closeFormsModal').onclick = () => document.getElementById('formsModal').remove();
}

function formTemplateModal(template = null) {
  const fields = (template?.fields || []).map(field => `${field.label || ''}|${field.type || 'short'}|${field.required ? 'required' : 'optional'}`).join('\n');
  modalShell(template ? 'Edit form' : 'Create form', 'Build a reusable form without workflow setup.', `<form id="formTemplateForm" class="forms-form"><label>Form title<input name="title" value="${esc(template?.title || '')}" required></label><label>Description<textarea name="description">${esc(template?.description || '')}</textarea></label><label>Category<input name="category" value="${esc(template?.category || 'General')}"></label><label>Questions<textarea name="questions" rows="10" placeholder="Question|short|required\nDetails|long|optional">${esc(fields)}</textarea><small>Use one question per line: Question text | short/long/yesno/number/date/rating | required/optional</small></label><label class="forms-check"><input type="checkbox" name="scoringEnabled" ${template?.scoringEnabled ? 'checked' : ''}> Enable optional scoring</label></form>`, `<button class="forms-btn" id="cancelFormTemplate">Cancel</button><button class="forms-btn primary" id="saveFormTemplate">Save form</button>`);
  document.getElementById('cancelFormTemplate').onclick = () => document.getElementById('formsModal').remove();
  document.getElementById('saveFormTemplate').onclick = async () => {
    const form = document.getElementById('formTemplateForm');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const parsed = String(fd.get('questions') || '').split('\n').map(line => line.trim()).filter(Boolean).map((line, index) => {
      const [label, type = 'short', required = 'optional'] = line.split('|').map(item => item.trim());
      return { id: `field-${Date.now()}-${index}`, label, type, required: required.toLowerCase() === 'required' };
    });
    const payload = {
      title: String(fd.get('title')).trim(),
      description: String(fd.get('description')).trim(),
      category: String(fd.get('category')).trim() || 'General',
      fields: parsed,
      scoringEnabled: fd.get('scoringEnabled') === 'on',
      status: template?.status || 'ACTIVE',
      updatedAt: serverTimestamp(),
    };
    if (template) await updateDoc(doc(db, 'performanceTemplates', template.id), payload);
    else await addDoc(collection(db, 'performanceTemplates'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
    document.getElementById('formsModal').remove();
    cache = null;
    openFormsCenter('manage-forms');
  };
}

function assignModal(data) {
  const templates = data.templates.filter(item => String(item.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED');
  const accounts = data.accounts.filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE');
  modalShell('Assign form', 'Choose a form, recipient, reviewer, and due date.', `<form id="assignForm" class="forms-form"><label>Form<select name="templateId" required><option value="">Choose a form</option>${templates.map(item => `<option value="${item.id}">${esc(item.title || 'Untitled form')}</option>`).join('')}</select></label><label>Assigned person<select name="employeeUid" required><option value="">Choose a person</option>${accounts.map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('')}</select></label><label>Reviewer<select name="reviewerUid"><option value="">Permission-based review queue</option>${accounts.filter(item => {
    const roles = item.systemRoles || [];
    const permissions = item.permissions || [];
    return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes('performance.review.evaluate') || permissions.includes('performance.review.manage');
  }).map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('')}</select></label><label>Due date<input type="date" name="dueDate"></label><label>Assignment note<textarea name="instructions"></textarea></label></form>`, `<button class="forms-btn" id="cancelAssignForm">Cancel</button><button class="forms-btn primary" id="saveAssignForm">Assign form</button>`);
  document.getElementById('cancelAssignForm').onclick = () => document.getElementById('formsModal').remove();
  document.getElementById('saveAssignForm').onclick = async () => {
    const form = document.getElementById('assignForm');
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const template = templates.find(item => item.id === fd.get('templateId'));
    const employee = accounts.find(item => item.id === fd.get('employeeUid'));
    const reviewer = accounts.find(item => item.id === fd.get('reviewerUid'));
    await addDoc(collection(db, 'performanceReviews'), {
      templateId: template.id,
      title: template.title || 'Assigned form',
      description: template.description || '',
      employeeUid: employee.id,
      employeeName: employee.displayName || employee.portalUsername || employee.id,
      currentAssignedToUid: reviewer?.id || '',
      currentAssignedToName: reviewer ? (reviewer.displayName || reviewer.portalUsername || reviewer.id) : '',
      currentRequiredPermission: reviewer ? '' : 'performance.review.evaluate',
      dueDate: fd.get('dueDate') ? Timestamp.fromDate(new Date(`${fd.get('dueDate')}T12:00:00`)) : null,
      instructions: String(fd.get('instructions') || '').trim(),
      fields: template.fields || [],
      answers: {},
      status: 'ASSIGNED',
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    document.getElementById('formsModal').remove();
    cache = null;
    openFormsCenter('all-forms');
  };
}

function renderQuestion(field, answer = '', readonly = false) {
  const label = esc(field.label || 'Question');
  const required = field.required ? 'required' : '';
  const name = esc(field.id || field.label || `field-${Math.random()}`);
  if (readonly) return `<div class="forms-response-item"><span>${label}</span><strong>${esc(answer || 'No response')}</strong></div>`;
  if (field.type === 'long') return `<label>${label}<textarea name="${name}" ${required}>${esc(answer)}</textarea></label>`;
  if (field.type === 'yesno') return `<label>${label}<select name="${name}" ${required}><option value="">Choose</option><option ${answer === 'Yes' ? 'selected' : ''}>Yes</option><option ${answer === 'No' ? 'selected' : ''}>No</option></select></label>`;
  const type = ['number','date'].includes(field.type) ? field.type : 'text';
  return `<label>${label}<input type="${type}" name="${name}" value="${esc(answer)}" ${required}></label>`;
}

async function recordModal(data, id) {
  const record = data.reviews.find(item => item.id === id);
  if (!record) return;
  const uid = auth.currentUser?.uid;
  const isEmployee = record.employeeUid === uid;
  const reviewerMode = !isEmployee && canReview();
  const status = statusOf(record);
  const fields = record.fields || data.templates.find(item => item.id === record.templateId)?.fields || [];
  const answers = record.answers || {};
  const readonly = !isEmployee || ['SUBMITTED','APPROVED','CLOSED'].includes(status);
  const body = `<div class="forms-record-summary"><div><span>Assigned to</span><strong>${esc(record.employeeName || displayNameFor(data, record.employeeUid))}</strong></div><div><span>Due</span><strong>${dateText(record.dueDate)}</strong></div><div><span>Status</span><strong>${esc(status.replaceAll('_',' '))}</strong></div></div>${record.instructions ? `<div class="forms-note">${esc(record.instructions)}</div>` : ''}<form id="recordForm" class="forms-form">${fields.map(field => renderQuestion(field, answers[field.id] ?? answers[field.label] ?? '', readonly || reviewerMode)).join('') || '<div class="forms-empty">This form has no questions.</div>'}</form>${record.supervisorFeedback ? `<div class="forms-review-note"><span>Reviewer notes</span><p>${esc(record.supervisorFeedback)}</p>${record.overallScore !== undefined && record.overallScore !== null && record.overallScore !== '' ? `<strong>Score: ${esc(record.overallScore)}</strong>` : ''}</div>` : ''}`;
  let footer = '<button class="forms-btn" id="closeRecordModal">Close</button>';
  if (isEmployee && !readonly) footer += '<button class="forms-btn" id="saveDraftRecord">Save draft</button><button class="forms-btn primary" id="submitRecord">Submit</button>';
  if (reviewerMode && ['SUBMITTED','CHANGES_REQUESTED'].includes(status)) footer += '<button class="forms-btn" id="requestChanges">Request changes</button><button class="forms-btn primary" id="approveRecord">Approve</button>';
  modalShell(record.title || 'Assigned form', reviewerMode ? 'Review the submitted response.' : 'Complete or review this form.', body, footer);
  document.getElementById('closeRecordModal').onclick = () => document.getElementById('formsModal').remove();
  const collectAnswers = () => {
    const fd = new FormData(document.getElementById('recordForm'));
    const next = {};
    fields.forEach(field => { next[field.id] = String(fd.get(field.id) || ''); });
    return next;
  };
  document.getElementById('saveDraftRecord')?.addEventListener('click', async () => {
    await updateDoc(doc(db, 'performanceReviews', id), { answers: collectAnswers(), status: 'IN_PROGRESS', updatedAt: serverTimestamp() });
    document.getElementById('formsModal').remove();
    cache = null;
    openFormsCenter('my-forms');
  });
  document.getElementById('submitRecord')?.addEventListener('click', async () => {
    const form = document.getElementById('recordForm');
    if (!form.reportValidity()) return;
    await updateDoc(doc(db, 'performanceReviews', id), { answers: collectAnswers(), status: 'AWAITING_REVIEW', submittedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    document.getElementById('formsModal').remove();
    cache = null;
    openFormsCenter('my-forms');
  });
  const review = async decision => {
    const notes = prompt(decision === 'COMPLETED' ? 'Optional review notes:' : 'Explain what needs to be changed:') ?? '';
    await updateDoc(doc(db, 'performanceReviews', id), { status: decision, supervisorFeedback: notes.trim(), reviewedBy: uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    document.getElementById('formsModal').remove();
    cache = null;
    openFormsCenter('review-queue');
  };
  document.getElementById('requestChanges')?.addEventListener('click', () => review('CHANGES_REQUESTED'));
  document.getElementById('approveRecord')?.addEventListener('click', () => review('COMPLETED'));
}

const observer = new MutationObserver(() => navButton());
observer.observe(document.documentElement, { childList: true, subtree: true });
onAuthStateChanged(auth, async user => {
  account = null;
  cache = null;
  if (!user || user.isAnonymous) return;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;
    account = { id: snapshot.id, ...snapshot.data() };
    navButton();
  } catch (error) {
    console.warn('Unable to initialize Forms Center.', error);
  }
});
