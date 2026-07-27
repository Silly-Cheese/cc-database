import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let currentTab = 'my-reviews';
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
const canCreate = () => has('performance.review.create') || has('performance.review.manage');
const canEvaluate = () => has('performance.review.evaluate') || has('performance.review.manage');
const canApprove = () => has('performance.review.approve') || has('performance.review.manage');
const canFinalize = () => has('performance.review.finalize') || has('performance.review.manage');
const canManage = () => has('performance.review.manage');
const canManageTemplates = () => has('performance.review.manage_templates') || canManage();
const canManageWorkflows = () => has('performance.review.manage_workflows') || canManage();
const canViewAll = () => has('performance.review.view_all') || canManage();

const PERMISSIONS = [
  'performance.access',
  'performance.review.create',
  'performance.review.self_complete',
  'performance.review.evaluate',
  'performance.review.approve',
  'performance.review.finalize',
  'performance.review.reopen',
  'performance.review.delete',
  'performance.review.view_assigned',
  'performance.review.view_all',
  'performance.review.manage_templates',
  'performance.review.manage_workflows',
  'performance.review.manage',
  'performance.notes.private',
  'performance.reports.view',
  'performance.reports.export',
];

async function loadData(force = false) {
  if (cache && !force && Date.now() - cache.loadedAt < 12000) return cache;
  const names = ['performanceReviews', 'performanceTemplates', 'performanceWorkflows', 'portalAccounts', 'staffProfiles'];
  const [reviews, templates, workflows, accounts, staff] = await Promise.all(names.map(async name => {
    try {
      const snap = await getDocs(collection(db, name));
      return snap.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
      console.warn(`Unable to load ${name}`, error);
      return [];
    }
  }));
  cache = { reviews, templates, workflows, accounts, staff, loadedAt: Date.now() };
  return cache;
}

function displayNameFor(data, uid) {
  const portal = data.accounts.find(item => item.id === uid);
  if (portal) return portal.displayName || portal.portalUsername || uid;
  const staff = data.staff.find(item => item.portalUid === uid || item.userUid === uid || item.id === uid);
  return staff?.displayName || staff?.robloxUsername || uid || 'Unassigned';
}

function eligibleAccounts(data, permission) {
  return data.accounts.filter(item => {
    if (String(item.portalStatus || '').toUpperCase() !== 'ACTIVE') return false;
    const roles = item.systemRoles || [];
    const permissions = item.permissions || [];
    return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes(permission);
  });
}

function navButton() {
  const sidebar = document.querySelector('#sidebar nav');
  if (!sidebar || sidebar.querySelector('[data-performance-center]') || !canAccess()) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.performanceCenter = 'true';
  button.innerHTML = '<span>📝</span>Forms Center';
  const training = sidebar.querySelector('[data-view="training"]');
  if (training) sidebar.insertBefore(button, training); else sidebar.appendChild(button);
  button.onclick = () => openPerformanceCenter();
}

function stat(value, label) {
  return `<article class="performance-stat"><strong>${value}</strong><span>${label}</span></article>`;
}
function tab(id, label) {
  return `<button class="performance-tab ${currentTab === id ? 'active' : ''}" data-performance-tab="${id}">${label}</button>`;
}
function badge(status) {
  const normalized = String(status || 'DRAFT').toUpperCase();
  return `<span class="performance-badge ${normalized.toLowerCase().replaceAll('_','-')}">${esc(normalized.replaceAll('_',' '))}</span>`;
}

async function openPerformanceCenter(tabName = currentTab) {
  currentTab = tabName;
  const main = document.querySelector('.layout > main');
  if (!main) return;
  main.innerHTML = '<section class="performance-loading">Loading Forms Center…</section>';
  try {
    const data = await loadData();
    const uid = auth.currentUser?.uid;
    const visible = data.reviews.filter(review => canViewAll() || review.employeeUid === uid || review.createdBy === uid || review.currentAssignedToUid === uid || (review.workflowSteps || []).some(step => step.assignedToUid === uid));
    const assigned = visible.filter(review => review.currentAssignedToUid === uid && !['COMPLETED','ARCHIVED'].includes(String(review.status).toUpperCase())).length;
    const pending = visible.filter(review => ['ASSIGNED','AWAITING_REVIEW','AWAITING_APPROVAL','AWAITING_FINALIZATION'].includes(String(review.status).toUpperCase())).length;
    const completed = visible.filter(review => String(review.status).toUpperCase() === 'COMPLETED').length;
    main.innerHTML = `
      <div class="performance-center">
        <section class="performance-hero">
          <div class="performance-hero-head"><div><p>FORMS & REVIEWS</p><h1>Forms Center</h1><span>Complete assigned forms, review submissions, and manage reusable forms in one place.</span></div>${canCreate() ? '<button class="performance-btn primary" id="createPerformanceReview">+ Assign Form</button>' : ''}</div>
          <div class="performance-stats">${stat(assigned,'Assigned to me')}${stat(pending,'Awaiting action')}${stat(completed,'Completed')}${stat(data.templates.length,'Available forms')}</div>
        </section>
        <nav class="performance-tabs">
          ${tab('my-reviews','My Forms')}
          ${(canEvaluate() || canApprove() || canFinalize()) ? tab('queue','Review Queue') : ''}
          ${canViewAll() ? tab('all','All Forms') : ''}
          ${canManageTemplates() ? tab('templates','Manage Forms') : ''}
        </nav>
        <section class="performance-view" id="performanceView">${renderTab(data, visible)}</section>
      </div>`;
    bindActions(data);
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel"><h1>Forms Center</h1><p class="error">Unable to load: ${esc(error.code || error.message)}</p></section>`;
  }
}

function renderTab(data, visible) {
  if (currentTab === 'queue') return renderQueue(data);
  if (currentTab === 'all') return renderReviews(data, data.reviews, 'All forms');
  if (currentTab === 'templates') return renderTemplates(data);
  return renderReviews(data, visible.filter(review => review.employeeUid === auth.currentUser?.uid || review.createdBy === auth.currentUser?.uid || review.currentAssignedToUid === auth.currentUser?.uid), 'My forms');
}

function renderReviews(data, reviews, title) {
  const sorted = [...reviews].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return `<section class="performance-section"><div class="performance-section-head"><div><p>FORM ASSIGNMENTS</p><h2>${esc(title)}</h2></div><span>${sorted.length} records</span></div><div class="performance-grid">${sorted.map(review => reviewCard(data, review)).join('') || '<div class="performance-empty">No forms are available here yet.</div>'}</div></section>`;
}

function reviewCard(data, review) {
  const employee = review.employeeName || displayNameFor(data, review.employeeUid);
  const assignee = review.currentAssignedToName || displayNameFor(data, review.currentAssignedToUid);
  return `<article class="performance-card"><div class="performance-card-head">${badge(review.status)}<strong>${Number(review.overallScore || 0)}${review.overallScore ? '%' : ''}</strong></div><h3>${esc(review.title || 'Assigned Form')}</h3><p>${esc(employee)}</p><div class="performance-meta"><div><span>Reviewer</span><strong>${esc(assignee || 'Unassigned')}</strong></div><div><span>Due</span><strong>${dateText(review.dueDate)}</strong></div><div><span>Status</span><strong>${esc(review.currentStepName || 'Not started')}</strong></div><div><span>Assigned</span><strong>${dateText(review.createdAt)}</strong></div></div><div class="performance-card-actions"><button class="performance-btn performance-open-review" data-id="${review.id}">Open form</button></div></article>`;
}

function renderQueue(data) {
  const uid = auth.currentUser?.uid;
  const reviews = data.reviews.filter(review => review.currentAssignedToUid === uid || (!review.currentAssignedToUid && userCanHandlePermission(review.currentRequiredPermission)));
  return `<section class="performance-section"><div class="performance-section-head"><div><p>SUBMISSIONS TO REVIEW</p><h2>Review queue</h2></div><span>${reviews.length} awaiting action</span></div><div class="performance-grid">${reviews.map(review => reviewCard(data, review)).join('') || '<div class="performance-empty">Nothing is currently waiting for your review.</div>'}</div></section>`;
}

function userCanHandlePermission(permission) {
  return !permission || has(permission) || canManage();
}

function renderTemplates(data) {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>FORM BUILDER</p><h2>Manage Forms</h2></div><button class="performance-btn primary" id="newPerformanceTemplate">+ New Form</button></div><div class="performance-grid">${data.templates.map(template => `<article class="performance-card"><div class="performance-card-head">${badge(template.status || 'DRAFT')}<strong>${(template.fields || []).length} fields</strong></div><h3>${esc(template.title || 'Untitled form')}</h3><p>${esc(template.description || 'Reusable staff form.')}</p><div class="performance-meta"><div><span>Category</span><strong>${esc(template.category || 'General')}</strong></div></div><div class="performance-card-actions"><button class="performance-btn performance-edit-template" data-id="${template.id}">Edit</button><button class="performance-btn danger performance-delete-template" data-id="${template.id}">Delete</button></div></article>`).join('') || '<div class="performance-empty">Create your first reusable form.</div>'}</div></section>`;
}

function renderWorkflows(data) {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>APPROVAL ROUTING</p><h2>Permission-based workflows</h2></div><button class="performance-btn primary" id="newPerformanceWorkflow">+ New workflow</button></div><div class="performance-grid">${data.workflows.map(workflow => `<article class="performance-card"><div class="performance-card-head">${badge(workflow.status || 'ACTIVE')}<strong>${(workflow.steps || []).length} steps</strong></div><h3>${esc(workflow.title || 'Untitled workflow')}</h3><p>${esc(workflow.description || 'Routes each stage to a user with the required permission.')}</p><ol class="performance-step-list">${(workflow.steps || []).map(step => `<li><strong>${esc(step.name)}</strong><span>${esc(step.requiredPermission)}</span></li>`).join('')}</ol><div class="performance-card-actions"><button class="performance-btn performance-edit-workflow" data-id="${workflow.id}">Edit</button><button class="performance-btn danger performance-delete-workflow" data-id="${workflow.id}">Delete</button></div></article>`).join('') || '<div class="performance-empty">Create a workflow to define the approval chain.</div>'}</div></section>`;
}

function renderPermissions() {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>ACCESS CONTROL</p><h2>Forms Center permissions</h2></div></div><div class="performance-permission-list">${PERMISSIONS.map(permission => `<article><code>${esc(permission)}</code><span>${permissionDescription(permission)}</span></article>`).join('')}</div></section>`;
}

function permissionDescription(permission) {
  const map = {
    'performance.access':'Open the Forms Center.',
    'performance.review.create':'Create and assign forms.',
    'performance.review.self_complete':'Complete an assigned form.',
    'performance.review.evaluate':'Review submitted forms.',
    'performance.review.approve':'Approve submitted forms.',
    'performance.review.finalize':'Finalize a completed form record.',
    'performance.review.reopen':'Reopen a completed form.',
    'performance.review.delete':'Delete form records.',
    'performance.review.view_assigned':'View forms assigned to the account.',
    'performance.review.view_all':'View all form assignments.',
    'performance.review.manage_templates':'Create and edit reusable forms.',
    'performance.review.manage_workflows':'Manage legacy approval workflows.',
    'performance.review.manage':'Full Forms Center management.',
    'performance.notes.private':'View and create private management notes.',
    'performance.reports.view':'View forms analytics and reports.',
    'performance.reports.export':'Export form records.',
  };
  return map[permission] || '';
}

function bindActions(data) {
  document.querySelectorAll('[data-performance-tab]').forEach(button => button.onclick = () => openPerformanceCenter(button.dataset.performanceTab));
  document.getElementById('createPerformanceReview')?.addEventListener('click', () => reviewModal(data));
  document.getElementById('newPerformanceTemplate')?.addEventListener('click', () => templateModal(data));
  document.getElementById('newPerformanceWorkflow')?.addEventListener('click', () => workflowModal(data));
  document.querySelectorAll('.performance-open-review').forEach(button => button.onclick = () => openReviewModal(data, button.dataset.id));
  document.querySelectorAll('.performance-edit-template').forEach(button => button.onclick = () => templateModal(data, data.templates.find(item => item.id === button.dataset.id)));
  document.querySelectorAll('.performance-delete-template').forEach(button => button.onclick = () => deleteTemplate(button.dataset.id));
  document.querySelectorAll('.performance-edit-workflow').forEach(button => button.onclick = () => workflowModal(data, data.workflows.find(item => item.id === button.dataset.id)));
  document.querySelectorAll('.performance-delete-workflow').forEach(button => button.onclick = () => deleteWorkflow(button.dataset.id));
}

function modal(content) {
  document.querySelector('.performance-modal-overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="performance-modal-overlay"><section class="performance-modal">${content}</section></div>`);
  document.querySelector('.performance-modal-overlay').onclick = event => { if (event.target.classList.contains('performance-modal-overlay')) event.currentTarget.remove(); };
  document.querySelectorAll('[data-performance-close]').forEach(button => button.onclick = () => document.querySelector('.performance-modal-overlay')?.remove());
}

function closeModal() { document.querySelector('.performance-modal-overlay')?.remove(); }

function templateModal(data, template = null) {
  const isEdit = Boolean(template);
  modal(`<form id="performanceTemplateForm"><div class="performance-modal-head"><div><p>FORM BUILDER</p><h2>${isEdit ? 'Edit form' : 'Create form'}</h2></div><button type="button" data-performance-close>×</button></div><div class="performance-modal-body"><label>Form title<input name="title" value="${esc(template?.title || '')}" required></label><label>Description<textarea name="description">${esc(template?.description || '')}</textarea></label><label>Category<input name="category" value="${esc(template?.category || 'General')}"></label><label>Status<select name="status"><option>DRAFT</option><option ${template?.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option><option ${template?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label><label>Fields as JSON<textarea name="fields" required>${esc(JSON.stringify(template?.fields || [], null, 2))}</textarea></label></div><div class="performance-modal-actions"><button type="button" class="performance-btn" data-performance-close>Cancel</button><button class="performance-btn primary">${isEdit ? 'Save form' : 'Create form'}</button></div></form>`);
  document.getElementById('performanceTemplateForm').onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let fields;
    try { fields = JSON.parse(String(form.get('fields'))); } catch { alert('Fields must be valid JSON.'); return; }
    const payload = { title:String(form.get('title')).trim(), description:String(form.get('description')).trim(), category:String(form.get('category')).trim(), status:String(form.get('status')), fields, updatedAt:serverTimestamp() };
    if (isEdit) await updateDoc(doc(db,'performanceTemplates',template.id),payload); else await addDoc(collection(db,'performanceTemplates'),{...payload,createdBy:auth.currentUser.uid,createdAt:serverTimestamp()});
    cache = null; closeModal(); openPerformanceCenter('templates');
  };
}

function workflowModal(data, workflow = null) {
  const isEdit = Boolean(workflow);
  modal(`<form id="performanceWorkflowForm"><div class="performance-modal-head"><div><p>WORKFLOW BUILDER</p><h2>${isEdit ? 'Edit workflow' : 'Create workflow'}</h2></div><button type="button" data-performance-close>×</button></div><div class="performance-modal-body"><label>Title<input name="title" value="${esc(workflow?.title || '')}" required></label><label>Description<textarea name="description">${esc(workflow?.description || '')}</textarea></label><label>Status<select name="status"><option>ACTIVE</option><option ${workflow?.status === 'DRAFT' ? 'selected' : ''}>DRAFT</option><option ${workflow?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label><label>Steps as JSON<textarea name="steps" required>${esc(JSON.stringify(workflow?.steps || [], null, 2))}</textarea></label></div><div class="performance-modal-actions"><button type="button" class="performance-btn" data-performance-close>Cancel</button><button class="performance-btn primary">${isEdit ? 'Save workflow' : 'Create workflow'}</button></div></form>`);
  document.getElementById('performanceWorkflowForm').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); let steps;
    try { steps = JSON.parse(String(form.get('steps'))); } catch { alert('Steps must be valid JSON.'); return; }
    const payload = { title:String(form.get('title')).trim(), description:String(form.get('description')).trim(), status:String(form.get('status')), steps, updatedAt:serverTimestamp() };
    if (isEdit) await updateDoc(doc(db,'performanceWorkflows',workflow.id),payload); else await addDoc(collection(db,'performanceWorkflows'),{...payload,createdBy:auth.currentUser.uid,createdAt:serverTimestamp()});
    cache = null; closeModal(); openPerformanceCenter('workflows');
  };
}

function reviewModal(data) {
  const templates = data.templates.filter(item => String(item.status || '').toUpperCase() === 'ACTIVE');
  const employees = data.accounts.filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE');
  modal(`<form id="performanceReviewForm"><div class="performance-modal-head"><div><p>ASSIGN FORM</p><h2>Assign a form</h2></div><button type="button" data-performance-close>×</button></div><div class="performance-modal-body performance-two"><label>Form<select name="templateId" required><option value="">Select…</option>${templates.map(item => `<option value="${item.id}">${esc(item.title)}</option>`).join('')}</select></label><label>Assign to<select name="employeeUid" required><option value="">Select…</option>${employees.map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('')}</select></label><label>Due date<input type="date" name="dueDate"></label><label>Reviewer permission<input name="reviewPermission" value="performance.review.evaluate"></label><label>Title<input name="title" placeholder="Defaults to form title"></label><label>Instructions<textarea name="notes"></textarea></label></div><div class="performance-modal-actions"><button type="button" class="performance-btn" data-performance-close>Cancel</button><button class="performance-btn primary">Assign form</button></div></form>`);
  document.getElementById('performanceReviewForm').onsubmit = async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const template = data.templates.find(item => item.id === form.get('templateId')); const employeeUid = String(form.get('employeeUid')); const employee = data.accounts.find(item => item.id === employeeUid); const permission = String(form.get('reviewPermission')).trim(); const eligible = eligibleAccounts(data, permission); const due = String(form.get('dueDate'));
    const payload = { templateId:template.id, templateSnapshot:{title:template.title,fields:template.fields || [],category:template.category || 'General'}, title:String(form.get('title')).trim() || template.title, employeeUid, employeeName:employee?.displayName || employee?.portalUsername || employeeUid, status:'ASSIGNED', responses:{}, workflowSteps:[], currentStepIndex:0, currentStepName:'Complete form', currentRequiredPermission:'performance.review.self_complete', currentAssignedToUid:employeeUid, currentAssignedToName:employee?.displayName || employee?.portalUsername || employeeUid, reviewerPermission:permission, reviewerCandidates:eligible.map(item => item.id), dueDate:due ? Timestamp.fromDate(new Date(`${due}T12:00:00`)) : null, notes:String(form.get('notes')).trim(), createdBy:auth.currentUser.uid, createdAt:serverTimestamp(), updatedAt:serverTimestamp() };
    await addDoc(collection(db,'performanceReviews'),payload); cache = null; closeModal(); openPerformanceCenter('all');
  };
}

async function openReviewModal(data, id) {
  const review = data.reviews.find(item => item.id === id) || (await getDoc(doc(db,'performanceReviews',id))).data();
  const uid = auth.currentUser.uid;
  const isEmployee = review.employeeUid === uid;
  const canAct = review.currentAssignedToUid === uid || (!review.currentAssignedToUid && userCanHandlePermission(review.currentRequiredPermission));
  const fields = review.templateSnapshot?.fields || [];
  modal(`<form id="performanceOpenReviewForm"><div class="performance-modal-head"><div><p>FORM</p><h2>${esc(review.title || 'Assigned Form')}</h2><span>${esc(review.employeeName || displayNameFor(data,review.employeeUid))}</span></div><button type="button" data-performance-close>×</button></div><div class="performance-modal-body"><div class="performance-review-summary">${badge(review.status)}<span>Due ${dateText(review.dueDate)}</span><span>Current: ${esc(review.currentStepName || 'Not started')}</span></div>${fields.map((field,index) => renderField(field,index,review.responses?.[index],isEmployee && canAct)).join('') || '<div class="performance-empty">This form has no fields.</div>'}<label>Reviewer notes<textarea name="managerNotes" ${!canEvaluate() && !canManage() ? 'disabled' : ''}>${esc(review.managerNotes || '')}</textarea></label></div><div class="performance-modal-actions"><button type="button" class="performance-btn" data-performance-close>Close</button>${isEmployee && canAct ? '<button class="performance-btn" name="action" value="save">Save draft</button><button class="performance-btn primary" name="action" value="submit">Submit form</button>' : ''}${!isEmployee && canAct && (canEvaluate() || canApprove() || canFinalize()) ? '<button class="performance-btn danger" name="action" value="changes">Request changes</button><button class="performance-btn primary" name="action" value="approve">Approve</button>' : ''}</div></form>`);
  document.getElementById('performanceOpenReviewForm').onsubmit = event => saveReviewAction(event,review,fields,data);
}

function renderField(field,index,value,editable) {
  const label = esc(field.label || field.title || `Question ${index+1}`);
  const type = String(field.type || 'text').toLowerCase();
  const required = field.required ? 'required' : '';
  if (type === 'textarea' || type === 'long_text') return `<label>${label}<textarea name="field_${index}" ${editable ? '' : 'disabled'} ${required}>${esc(value || '')}</textarea></label>`;
  if (type === 'select' || type === 'dropdown') return `<label>${label}<select name="field_${index}" ${editable ? '' : 'disabled'} ${required}><option value="">Select…</option>${(field.options || []).map(option => `<option ${String(value)===String(option)?'selected':''}>${esc(option)}</option>`).join('')}</select></label>`;
  if (type === 'number' || type === 'date') return `<label>${label}<input type="${type}" name="field_${index}" value="${esc(value || '')}" ${editable ? '' : 'disabled'} ${required}></label>`;
  return `<label>${label}<input name="field_${index}" value="${esc(value || '')}" ${editable ? '' : 'disabled'} ${required}></label>`;
}

async function saveReviewAction(event, review, fields, data) {
  event.preventDefault(); const action = event.submitter?.value || 'save'; const form = new FormData(event.currentTarget); const responses = {};
  fields.forEach((_,index) => { responses[index] = form.get(`field_${index}`) ?? review.responses?.[index] ?? ''; });
  const managerNotes = String(form.get('managerNotes') || '');
  const payload = { responses, managerNotes, updatedAt:serverTimestamp() };
  if (action === 'save') Object.assign(payload,{status:'IN_PROGRESS'});
  if (action === 'submit') Object.assign(payload,{status:'AWAITING_REVIEW',currentStepName:'Review submission',currentRequiredPermission:review.reviewerPermission || 'performance.review.evaluate',currentAssignedToUid:'',currentAssignedToName:'' ,submittedAt:serverTimestamp()});
  if (action === 'changes') Object.assign(payload,{status:'CHANGES_REQUESTED',currentStepName:'Update form',currentRequiredPermission:'performance.review.self_complete',currentAssignedToUid:review.employeeUid,currentAssignedToName:review.employeeName,reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});
  if (action === 'approve') Object.assign(payload,{status:'COMPLETED',currentStepName:'Completed',currentRequiredPermission:'',currentAssignedToUid:'',currentAssignedToName:'',completedAt:serverTimestamp(),reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid});
  await updateDoc(doc(db,'performanceReviews',review.id),payload); cache=null; closeModal(); openPerformanceCenter(action === 'submit' || action === 'save' ? 'my-reviews' : 'queue');
}

async function deleteTemplate(id) { if (!confirm('Delete this form?')) return; await deleteDoc(doc(db,'performanceTemplates',id)); cache=null; openPerformanceCenter('templates'); }
async function deleteWorkflow(id) { if (!confirm('Delete this workflow?')) return; await deleteDoc(doc(db,'performanceWorkflows',id)); cache=null; openPerformanceCenter('workflows'); }

onAuthStateChanged(auth, async user => {
  if (!user) return;
  try { account = (await getDoc(doc(db,'portalAccounts',user.uid))).data(); } catch { account = null; }
  navButton();
  const observer = new MutationObserver(navButton);
  observer.observe(document.documentElement,{childList:true,subtree:true});
});
