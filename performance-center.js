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
  button.innerHTML = '<span>📈</span>Performance Center';
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
  main.innerHTML = '<section class="performance-loading">Loading Performance Center…</section>';
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
          <div class="performance-hero-head"><div><p>WORKFORCE DEVELOPMENT</p><h1>Performance Center</h1><span>Create structured reviews, route approvals by permission, and maintain an auditable performance history.</span></div>${canCreate() ? '<button class="performance-btn primary" id="createPerformanceReview">+ New review</button>' : ''}</div>
          <div class="performance-stats">${stat(assigned,'Assigned to me')}${stat(pending,'In progress')}${stat(completed,'Completed')}${stat(data.templates.length,'Templates')}</div>
        </section>
        <nav class="performance-tabs">
          ${tab('my-reviews','My Reviews')}
          ${(canEvaluate() || canApprove() || canFinalize()) ? tab('queue','Review Queue') : ''}
          ${canViewAll() ? tab('all','All Reviews') : ''}
          ${canManageTemplates() ? tab('templates','Templates') : ''}
          ${canManageWorkflows() ? tab('workflows','Workflows') : ''}
          ${canManage() ? tab('permissions','Permission Guide') : ''}
        </nav>
        <section class="performance-view" id="performanceView">${renderTab(data, visible)}</section>
      </div>`;
    bindActions(data);
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel"><h1>Performance Center</h1><p class="error">Unable to load: ${esc(error.code || error.message)}</p></section>`;
  }
}

function renderTab(data, visible) {
  if (currentTab === 'queue') return renderQueue(data);
  if (currentTab === 'all') return renderReviews(data, data.reviews, 'All performance reviews');
  if (currentTab === 'templates') return renderTemplates(data);
  if (currentTab === 'workflows') return renderWorkflows(data);
  if (currentTab === 'permissions') return renderPermissions();
  return renderReviews(data, visible.filter(review => review.employeeUid === auth.currentUser?.uid || review.createdBy === auth.currentUser?.uid || review.currentAssignedToUid === auth.currentUser?.uid), 'My performance reviews');
}

function renderReviews(data, reviews, title) {
  const sorted = [...reviews].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  return `<section class="performance-section"><div class="performance-section-head"><div><p>REVIEW RECORDS</p><h2>${esc(title)}</h2></div><span>${sorted.length} records</span></div><div class="performance-grid">${sorted.map(review => reviewCard(data, review)).join('') || '<div class="performance-empty">No performance reviews are available here yet.</div>'}</div></section>`;
}

function reviewCard(data, review) {
  const employee = review.employeeName || displayNameFor(data, review.employeeUid);
  const assignee = review.currentAssignedToName || displayNameFor(data, review.currentAssignedToUid);
  return `<article class="performance-card"><div class="performance-card-head">${badge(review.status)}<strong>${Number(review.overallScore || 0)}${review.overallScore ? '%' : ''}</strong></div><h3>${esc(review.title || 'Performance Review')}</h3><p>${esc(employee)}</p><div class="performance-meta"><div><span>Current owner</span><strong>${esc(assignee || 'Unassigned')}</strong></div><div><span>Due</span><strong>${dateText(review.dueDate)}</strong></div><div><span>Current step</span><strong>${esc(review.currentStepName || 'Not started')}</strong></div><div><span>Created</span><strong>${dateText(review.createdAt)}</strong></div></div><div class="performance-card-actions"><button class="performance-btn performance-open-review" data-id="${review.id}">Open review</button></div></article>`;
}

function renderQueue(data) {
  const uid = auth.currentUser?.uid;
  const reviews = data.reviews.filter(review => review.currentAssignedToUid === uid || (!review.currentAssignedToUid && userCanHandlePermission(review.currentRequiredPermission)));
  return `<section class="performance-section"><div class="performance-section-head"><div><p>ASSIGNED WORK</p><h2>Review queue</h2></div><span>${reviews.length} awaiting action</span></div><div class="performance-grid">${reviews.map(review => reviewCard(data, review)).join('') || '<div class="performance-empty">Nothing is currently assigned to you.</div>'}</div></section>`;
}

function userCanHandlePermission(permission) {
  return !permission || has(permission) || canManage();
}

function renderTemplates(data) {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>FORM BUILDER</p><h2>Review templates</h2></div><button class="performance-btn primary" id="newPerformanceTemplate">+ New template</button></div><div class="performance-grid">${data.templates.map(template => `<article class="performance-card"><div class="performance-card-head">${badge(template.status || 'DRAFT')}<strong>${(template.fields || []).length} fields</strong></div><h3>${esc(template.title || 'Untitled template')}</h3><p>${esc(template.description || 'Reusable performance-review form.')}</p><div class="performance-meta"><div><span>Category</span><strong>${esc(template.category || 'General')}</strong></div><div><span>Workflow</span><strong>${esc(data.workflows.find(item => item.id === template.workflowId)?.title || 'None')}</strong></div></div><div class="performance-card-actions"><button class="performance-btn performance-edit-template" data-id="${template.id}">Edit</button><button class="performance-btn danger performance-delete-template" data-id="${template.id}">Delete</button></div></article>`).join('') || '<div class="performance-empty">Create your first reusable review template.</div>'}</div></section>`;
}

function renderWorkflows(data) {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>APPROVAL ROUTING</p><h2>Permission-based workflows</h2></div><button class="performance-btn primary" id="newPerformanceWorkflow">+ New workflow</button></div><div class="performance-grid">${data.workflows.map(workflow => `<article class="performance-card"><div class="performance-card-head">${badge(workflow.status || 'ACTIVE')}<strong>${(workflow.steps || []).length} steps</strong></div><h3>${esc(workflow.title || 'Untitled workflow')}</h3><p>${esc(workflow.description || 'Routes each stage to a user with the required permission.')}</p><ol class="performance-step-list">${(workflow.steps || []).map(step => `<li><strong>${esc(step.name)}</strong><span>${esc(step.requiredPermission)}</span></li>`).join('')}</ol><div class="performance-card-actions"><button class="performance-btn performance-edit-workflow" data-id="${workflow.id}">Edit</button><button class="performance-btn danger performance-delete-workflow" data-id="${workflow.id}">Delete</button></div></article>`).join('') || '<div class="performance-empty">Create a workflow to define the approval chain.</div>'}</div></section>`;
}

function renderPermissions() {
  return `<section class="performance-section"><div class="performance-section-head"><div><p>ACCESS CONTROL</p><h2>Performance permissions</h2></div></div><div class="performance-permission-list">${PERMISSIONS.map(permission => `<article><code>${esc(permission)}</code><span>${permissionDescription(permission)}</span></article>`).join('')}</div></section>`;
}

function permissionDescription(permission) {
  const map = {
    'performance.access':'Open the Performance Center.',
    'performance.review.create':'Create and assign performance reviews.',
    'performance.review.self_complete':'Complete an assigned self-evaluation.',
    'performance.review.evaluate':'Complete reviewer evaluation stages.',
    'performance.review.approve':'Approve completed evaluations.',
    'performance.review.finalize':'Finalize the permanent review record.',
    'performance.review.reopen':'Reopen a completed review.',
    'performance.review.delete':'Delete review records.',
    'performance.review.view_assigned':'View reviews assigned to the account.',
    'performance.review.view_all':'View all performance reviews.',
    'performance.review.manage_templates':'Create and edit form templates.',
    'performance.review.manage_workflows':'Create and edit approval workflows.',
    'performance.review.manage':'Full Performance Center management.',
    'performance.notes.private':'View and create private management notes.',
    'performance.reports.view':'View performance analytics and reports.',
    'performance.reports.export':'Export performance records.',
  };
  return map[permission] || '';
}

function bindActions(data) {
  document.querySelectorAll('[data-performance-tab]').forEach(button => button.onclick = () => openPerformanceCenter(button.dataset.performanceTab));
  document.getElementById('createPerformanceReview')?.addEventListener('click', () => reviewModal(data));
  document.getElementById('newPerformanceTemplate')?.addEventListener('click', () => templateModal(data));
  document.getElementById('newPerformanceWorkflow')?.addEventListener('click', () => workflowModal(data));
  document.querySelectorAll('.performance-open-review').forEach(button => button.onclick = () => reviewDetailModal(data, data.reviews.find(item => item.id === button.dataset.id)));
  document.querySelectorAll('.performance-edit-template').forEach(button => button.onclick = () => templateModal(data, data.templates.find(item => item.id === button.dataset.id)));
  document.querySelectorAll('.performance-edit-workflow').forEach(button => button.onclick = () => workflowModal(data, data.workflows.find(item => item.id === button.dataset.id)));
  document.querySelectorAll('.performance-delete-template').forEach(button => button.onclick = () => removeRecord('performanceTemplates', button.dataset.id, 'template'));
  document.querySelectorAll('.performance-delete-workflow').forEach(button => button.onclick = () => removeRecord('performanceWorkflows', button.dataset.id, 'workflow'));
}

function modal(title, body, onSubmit, wide = false) {
  document.getElementById('performanceModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="performance-modal-backdrop" id="performanceModal"><section class="performance-modal ${wide ? 'wide' : ''}"><div class="performance-modal-head"><div><p>PERFORMANCE CENTER</p><h2>${esc(title)}</h2></div><button type="button" id="closePerformanceModal">×</button></div><form id="performanceModalForm">${body}<div class="performance-modal-actions"><button type="button" class="performance-btn" id="cancelPerformanceModal">Cancel</button><button type="submit" class="performance-btn primary">Save</button></div></form></section></div>`);
  const close = () => document.getElementById('performanceModal')?.remove();
  document.getElementById('closePerformanceModal').onclick = close;
  document.getElementById('cancelPerformanceModal').onclick = close;
  document.getElementById('performanceModalForm').onsubmit = async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await onSubmit(new FormData(event.currentTarget));
      cache = null;
      close();
      await openPerformanceCenter(currentTab);
    } catch (error) {
      console.error(error);
      alert(`Unable to save: ${error.code || error.message}`);
      submit.disabled = false;
    }
  };
}

function reviewModal(data) {
  const employeeOptions = data.accounts.filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE').map(item => `<option value="${item.id}">${esc(item.displayName || item.portalUsername || item.id)}</option>`).join('');
  const templateOptions = data.templates.filter(item => String(item.status || 'ACTIVE').toUpperCase() !== 'ARCHIVED').map(item => `<option value="${item.id}">${esc(item.title || item.id)}</option>`).join('');
  modal('Create performance review', `<label>Review title<input name="title" required placeholder="Quarterly Performance Review"></label><label>Employee<select name="employeeUid" required><option value="">Select employee</option>${employeeOptions}</select></label><label>Template<select name="templateId" required><option value="">Select template</option>${templateOptions}</select></label><label>Due date<input name="dueDate" type="date" required></label><label class="full">Instructions<textarea name="instructions" placeholder="Instructions for the employee and reviewers"></textarea></label>`, async form => {
    const template = data.templates.find(item => item.id === form.get('templateId'));
    const workflow = data.workflows.find(item => item.id === template?.workflowId);
    if (!template) throw new Error('Select a valid template.');
    if (!workflow || !(workflow.steps || []).length) throw new Error('The selected template must have a workflow with at least one step.');
    const steps = workflow.steps.map((step, index) => ({ ...step, order: index + 1, status: index === 0 ? 'PENDING' : 'LOCKED', assignedToUid: '' }));
    const first = steps[0];
    const eligible = eligibleAccounts(data, first.requiredPermission);
    const assigned = eligible.length === 1 ? eligible[0] : null;
    const employeeUid = String(form.get('employeeUid'));
    await addDoc(collection(db, 'performanceReviews'), {
      title: String(form.get('title')).trim(), employeeUid,
      employeeName: displayNameFor(data, employeeUid), templateId: template.id, templateTitle: template.title || '',
      workflowId: workflow.id, workflowTitle: workflow.title || '', workflowSteps: steps,
      currentStepIndex: 0, currentStepName: first.name, currentRequiredPermission: first.requiredPermission,
      currentAssignedToUid: assigned?.id || '', currentAssignedToName: assigned ? displayNameFor(data, assigned.id) : '',
      status: assigned ? 'ASSIGNED' : 'AWAITING_ASSIGNMENT', instructions: String(form.get('instructions') || '').trim(),
      responses: {}, overallScore: null, dueDate: Timestamp.fromDate(new Date(`${form.get('dueDate')}T12:00:00`)),
      createdBy: auth.currentUser.uid, createdByName: account?.displayName || account?.portalUsername || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }, true);
}

function templateModal(data, template = null) {
  const workflowOptions = data.workflows.map(item => `<option value="${item.id}" ${template?.workflowId === item.id ? 'selected' : ''}>${esc(item.title || item.id)}</option>`).join('');
  const fieldLines = (template?.fields || []).map(field => `${field.type}|${field.label}|${field.required ? 'required' : 'optional'}|${field.weight || 0}`).join('\n');
  modal(template ? 'Edit review template' : 'Create review template', `<label>Template title<input name="title" value="${esc(template?.title || '')}" required></label><label>Category<input name="category" value="${esc(template?.category || 'Performance Review')}" required></label><label>Workflow<select name="workflowId" required><option value="">Select workflow</option>${workflowOptions}</select></label><label>Status<select name="status"><option ${template?.status === 'DRAFT' ? 'selected' : ''}>DRAFT</option><option ${template?.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option><option ${template?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label><label class="full">Description<textarea name="description">${esc(template?.description || '')}</textarea></label><label class="full">Form fields <small>One per line: type|label|required/optional|weight. Types: text, paragraph, rating, number, choice, checkbox, date.</small><textarea name="fields" required placeholder="rating|Professionalism|required|20\nparagraph|Reviewer comments|required|0">${esc(fieldLines)}</textarea></label>`, async form => {
    const fields = String(form.get('fields')).split('\n').map((line, index) => {
      const [type, label, requirement, weight] = line.split('|').map(value => value?.trim());
      return { id: `field_${index + 1}`, type: type || 'text', label: label || `Field ${index + 1}`, required: String(requirement).toLowerCase() === 'required', weight: Number(weight || 0) };
    }).filter(field => field.label);
    const payload = { title: String(form.get('title')).trim(), category: String(form.get('category')).trim(), workflowId: String(form.get('workflowId')), status: String(form.get('status')), description: String(form.get('description') || '').trim(), fields, updatedAt: serverTimestamp() };
    if (template) await updateDoc(doc(db, 'performanceTemplates', template.id), payload);
    else await addDoc(collection(db, 'performanceTemplates'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
  }, true);
}

function workflowModal(data, workflow = null) {
  const stepLines = (workflow?.steps || []).map(step => `${step.name}|${step.requiredPermission}`).join('\n');
  modal(workflow ? 'Edit approval workflow' : 'Create approval workflow', `<label>Workflow title<input name="title" value="${esc(workflow?.title || '')}" required></label><label>Status<select name="status"><option ${workflow?.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option><option ${workflow?.status === 'DRAFT' ? 'selected' : ''}>DRAFT</option><option ${workflow?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label><label class="full">Description<textarea name="description">${esc(workflow?.description || '')}</textarea></label><label class="full">Workflow steps <small>One per line: step name|required permission</small><textarea name="steps" required placeholder="Reviewer Evaluation|performance.review.evaluate\nAdministrative Approval|performance.review.approve\nFinalization|performance.review.finalize">${esc(stepLines)}</textarea></label>`, async form => {
    const steps = String(form.get('steps')).split('\n').map((line, index) => {
      const [name, requiredPermission] = line.split('|').map(value => value?.trim());
      if (!name || !requiredPermission) return null;
      return { id: `step_${index + 1}`, order: index + 1, name, requiredPermission };
    }).filter(Boolean);
    if (!steps.length) throw new Error('Add at least one valid workflow step.');
    const payload = { title: String(form.get('title')).trim(), status: String(form.get('status')), description: String(form.get('description') || '').trim(), steps, updatedAt: serverTimestamp() };
    if (workflow) await updateDoc(doc(db, 'performanceWorkflows', workflow.id), payload);
    else await addDoc(collection(db, 'performanceWorkflows'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
  }, true);
}

function reviewDetailModal(data, review) {
  if (!review) return;
  const step = (review.workflowSteps || [])[review.currentStepIndex || 0];
  const eligible = eligibleAccounts(data, review.currentRequiredPermission || step?.requiredPermission || '');
  const assignmentOptions = eligible.map(item => `<option value="${item.id}" ${review.currentAssignedToUid === item.id ? 'selected' : ''}>${esc(displayNameFor(data, item.id))}</option>`).join('');
  const template = data.templates.find(item => item.id === review.templateId);
  const fields = template?.fields || [];
  const responseFields = fields.map(field => renderResponseField(field, review.responses?.[field.id])).join('');
  const mayAct = review.currentAssignedToUid === auth.currentUser?.uid && userCanHandlePermission(review.currentRequiredPermission);
  const mayAssign = canManage() || canCreate();
  modal(review.title || 'Performance Review', `<div class="performance-review-summary"><div>${badge(review.status)}<h3>${esc(review.employeeName || displayNameFor(data, review.employeeUid))}</h3><p>${esc(review.instructions || 'Complete the assigned review stage.')}</p></div></div><div class="performance-workflow-track">${(review.workflowSteps || []).map((item,index) => `<div class="${index === review.currentStepIndex ? 'current' : ''} ${item.status === 'COMPLETED' ? 'done' : ''}"><strong>${index + 1}. ${esc(item.name)}</strong><span>${esc(item.requiredPermission)}</span></div>`).join('')}</div>${mayAssign ? `<label>Assigned reviewer<select name="assignedToUid"><option value="">Unassigned</option>${assignmentOptions}</select></label>` : ''}<div class="performance-form-fields">${responseFields || '<p class="performance-empty">This template has no fields.</p>'}</div>${mayAct ? '<label class="full">Stage notes<textarea name="stageNotes" placeholder="Document your findings or decision"></textarea></label>' : ''}<input type="hidden" name="reviewAction" value="save">`, async form => {
    const responses = { ...(review.responses || {}) };
    fields.forEach(field => {
      const value = form.get(`field_${field.id}`);
      if (value !== null) responses[field.id] = value;
    });
    const updates = { responses, updatedAt: serverTimestamp() };
    const assignedToUid = String(form.get('assignedToUid') || review.currentAssignedToUid || '');
    if (mayAssign && assignedToUid !== review.currentAssignedToUid) {
      updates.currentAssignedToUid = assignedToUid;
      updates.currentAssignedToName = displayNameFor(data, assignedToUid);
      updates.status = assignedToUid ? 'ASSIGNED' : 'AWAITING_ASSIGNMENT';
    }
    if (mayAct && confirm('Complete this workflow stage and advance the review?')) {
      const steps = [...(review.workflowSteps || [])];
      const index = review.currentStepIndex || 0;
      steps[index] = { ...steps[index], status: 'COMPLETED', completedBy: auth.currentUser.uid, completedByName: account?.displayName || account?.portalUsername || '', completedAt: new Date().toISOString(), notes: String(form.get('stageNotes') || '').trim() };
      const next = steps[index + 1];
      if (next) {
        steps[index + 1] = { ...next, status: 'PENDING' };
        const nextEligible = eligibleAccounts(data, next.requiredPermission);
        const nextAssigned = nextEligible.length === 1 ? nextEligible[0] : null;
        Object.assign(updates, { workflowSteps: steps, currentStepIndex: index + 1, currentStepName: next.name, currentRequiredPermission: next.requiredPermission, currentAssignedToUid: nextAssigned?.id || '', currentAssignedToName: nextAssigned ? displayNameFor(data, nextAssigned.id) : '', status: nextAssigned ? 'ASSIGNED' : 'AWAITING_ASSIGNMENT' });
      } else {
        const scores = fields.filter(field => ['rating','number'].includes(field.type)).map(field => Number(responses[field.id] || 0)).filter(Number.isFinite);
        Object.assign(updates, { workflowSteps: steps, status: 'COMPLETED', completedAt: serverTimestamp(), completedBy: auth.currentUser.uid, currentAssignedToUid: '', currentAssignedToName: '', currentStepName: 'Completed', currentRequiredPermission: '', overallScore: scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null });
      }
    }
    await updateDoc(doc(db, 'performanceReviews', review.id), updates);
  }, true);
}

function renderResponseField(field, value = '') {
  const required = field.required ? 'required' : '';
  const name = `field_${field.id}`;
  if (field.type === 'paragraph') return `<label class="full">${esc(field.label)}<textarea name="${name}" ${required}>${esc(value)}</textarea></label>`;
  if (field.type === 'rating' || field.type === 'number') return `<label>${esc(field.label)}<input name="${name}" type="number" min="0" max="100" value="${esc(value)}" ${required}></label>`;
  if (field.type === 'date') return `<label>${esc(field.label)}<input name="${name}" type="date" value="${esc(value)}" ${required}></label>`;
  if (field.type === 'checkbox') return `<label class="performance-checkbox"><input name="${name}" type="checkbox" value="true" ${String(value) === 'true' ? 'checked' : ''}>${esc(field.label)}</label>`;
  return `<label>${esc(field.label)}<input name="${name}" value="${esc(value)}" ${required}></label>`;
}

async function removeRecord(collectionName, id, label) {
  if (!confirm(`Permanently delete this ${label}?`)) return;
  try {
    await deleteDoc(doc(db, collectionName, id));
    cache = null;
    await openPerformanceCenter(currentTab);
  } catch (error) {
    console.error(error);
    alert(`Unable to delete: ${error.code || error.message}`);
  }
}

let navTimer;
function scheduleNav() { clearTimeout(navTimer); navTimer = setTimeout(navButton, 80); }
new MutationObserver(scheduleNav).observe(document.getElementById('app'), { childList: true, subtree: true });
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  try {
    const snap = await getDoc(doc(db, 'portalAccounts', user.uid));
    account = snap.exists() ? snap.data() : null;
    scheduleNav();
  } catch (error) {
    console.error('Unable to initialize Performance Center', error);
  }
});
