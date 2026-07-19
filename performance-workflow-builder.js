import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const PERFORMANCE_PERMISSIONS = [
  'performance.review.self_complete',
  'performance.review.evaluate',
  'performance.review.approve',
  'performance.review.finalize',
  'performance.review.reopen',
  'performance.review.view_assigned',
  'performance.review.view_all',
  'performance.review.manage',
  'performance.notes.private',
];

let state = null;
const stepId = () => `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function normalizeStep(step = {}, index = 0) {
  return {
    id: step.id || stepId(),
    order: index + 1,
    name: step.name || '',
    description: step.description || '',
    requiredPermission: step.requiredPermission || 'performance.review.evaluate',
    assignmentMode: step.assignmentMode || 'MANUAL_OR_SINGLE_ELIGIBLE',
    dueDays: Number(step.dueDays || 0),
    escalationPermission: step.escalationPermission || '',
    required: step.required !== false,
    enabled: step.enabled !== false,
  };
}

async function loadWorkflow(workflowId = '') {
  let workflow = null;
  if (workflowId) {
    const snapshot = await getDoc(doc(db, 'performanceWorkflows', workflowId));
    if (snapshot.exists()) workflow = { id: snapshot.id, ...snapshot.data() };
  }
  const accounts = (await getDocs(collection(db, 'portalAccounts'))).docs.map(item => item.data());
  const permissionSet = new Set(PERFORMANCE_PERMISSIONS);
  accounts.forEach(item => (item.permissions || []).forEach(permission => {
    if (String(permission).startsWith('performance.')) permissionSet.add(permission);
  }));
  return { workflow, permissions: [...permissionSet].sort() };
}

function closeBuilder() {
  document.getElementById('performanceWorkflowBuilder')?.remove();
  state = null;
}

function permissionOptions(selected = '', allowNone = false) {
  return `${allowNone ? '<option value="">No escalation</option>' : ''}${state.permissions.map(permission => `<option value="${esc(permission)}" ${selected === permission ? 'selected' : ''}>${esc(permission)}</option>`).join('')}`;
}

function openShell(data) {
  const workflow = data.workflow;
  state = {
    ...data,
    steps: (workflow?.steps || []).map(normalizeStep),
  };
  document.getElementById('performanceWorkflowBuilder')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="workflow-builder-backdrop" id="performanceWorkflowBuilder">
      <section class="workflow-builder-modal">
        <header class="workflow-builder-head">
          <div><p>PERFORMANCE CENTER</p><h2>${workflow ? 'Edit approval workflow' : 'Create approval workflow'}</h2></div>
          <button type="button" id="closeWorkflowBuilder" aria-label="Close">×</button>
        </header>
        <div class="workflow-builder-meta">
          <label>Workflow title<input id="workflowBuilderTitle" value="${esc(workflow?.title || '')}" placeholder="Quarterly Review Approval" required></label>
          <label>Status<select id="workflowBuilderStatus"><option ${workflow?.status === 'ACTIVE' ? 'selected' : ''}>ACTIVE</option><option ${workflow?.status === 'DRAFT' ? 'selected' : ''}>DRAFT</option><option ${workflow?.status === 'ARCHIVED' ? 'selected' : ''}>ARCHIVED</option></select></label>
          <label class="full">Description<textarea id="workflowBuilderDescription" placeholder="Explain when this approval workflow should be used.">${esc(workflow?.description || '')}</textarea></label>
        </div>
        <div class="workflow-builder-layout">
          <main class="workflow-builder-canvas">
            <div class="workflow-builder-title"><div><p>APPROVAL CHAIN</p><h3>Workflow steps</h3><span>Add stages and drag them into the required approval order.</span></div></div>
            <div id="workflowStepList" class="workflow-step-list"></div>
            <button type="button" id="workflowAddStep" class="workflow-add-step">＋ Add workflow step</button>
            <footer class="workflow-summary"><span id="workflowStepCount"></span><span id="workflowPermissionCount"></span></footer>
          </main>
          <aside class="workflow-builder-sidebar">
            <p>HOW ROUTING WORKS</p>
            <h3>Permission-based approval</h3>
            <span>Each stage may only be assigned to an active account holding the selected permission.</span>
            <div class="workflow-routing-note"><strong>Permissions</strong><p>Determine who is eligible.</p><strong>Assignments</strong><p>Determine who owns the current step.</p><strong>Step order</strong><p>Determines the approval sequence.</p></div>
          </aside>
        </div>
        <div class="workflow-builder-actions">
          <button type="button" class="performance-btn" id="workflowBuilderCancel">Cancel</button>
          <button type="button" class="performance-btn primary" id="workflowBuilderSave">Save Workflow</button>
        </div>
      </section>
    </div>`);

  document.getElementById('closeWorkflowBuilder').onclick = closeBuilder;
  document.getElementById('workflowBuilderCancel').onclick = closeBuilder;
  document.getElementById('workflowAddStep').onclick = () => editStep(null);
  document.getElementById('workflowBuilderSave').onclick = saveWorkflow;
  renderSteps();
}

function renderSteps() {
  state.steps = state.steps.map(normalizeStep);
  const list = document.getElementById('workflowStepList');
  if (!list) return;
  list.innerHTML = state.steps.map((step, index) => `
    <article class="workflow-step-card ${step.enabled ? '' : 'disabled'}" draggable="true" data-index="${index}">
      <div class="workflow-step-drag" title="Drag to reorder">⋮⋮</div>
      <div class="workflow-step-number">${index + 1}</div>
      <div class="workflow-step-content">
        <small>${step.enabled ? 'ACTIVE STEP' : 'DISABLED STEP'}</small>
        <h4>${esc(step.name || `Step ${index + 1}`)}${step.required ? ' <em>*</em>' : ''}</h4>
        ${step.description ? `<p>${esc(step.description)}</p>` : ''}
        <div class="workflow-step-details"><span><b>Permission</b>${esc(step.requiredPermission)}</span><span><b>Assignment</b>${esc(step.assignmentMode.replaceAll('_', ' '))}</span>${step.dueDays ? `<span><b>Target</b>${step.dueDays} day${step.dueDays === 1 ? '' : 's'}</span>` : ''}${step.escalationPermission ? `<span><b>Escalation</b>${esc(step.escalationPermission)}</span>` : ''}</div>
      </div>
      <div class="workflow-step-actions"><button type="button" data-edit-step="${index}" title="Edit">✎</button><button type="button" data-duplicate-step="${index}" title="Duplicate">▣</button><button type="button" data-delete-step="${index}" title="Delete">⌫</button></div>
    </article>${index < state.steps.length - 1 ? '<div class="workflow-connector">↓</div>' : ''}`).join('') || '<div class="workflow-builder-empty">No workflow steps yet. Click “Add workflow step” to begin.</div>';

  document.getElementById('workflowStepCount').textContent = `${state.steps.length} step${state.steps.length === 1 ? '' : 's'}`;
  document.getElementById('workflowPermissionCount').textContent = `${new Set(state.steps.map(step => step.requiredPermission)).size} permission${new Set(state.steps.map(step => step.requiredPermission)).size === 1 ? '' : 's'} used`;

  list.querySelectorAll('[data-edit-step]').forEach(button => button.onclick = () => editStep(Number(button.dataset.editStep)));
  list.querySelectorAll('[data-delete-step]').forEach(button => button.onclick = () => { state.steps.splice(Number(button.dataset.deleteStep), 1); renderSteps(); });
  list.querySelectorAll('[data-duplicate-step]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.duplicateStep);
    state.steps.splice(index + 1, 0, { ...structuredClone(state.steps[index]), id: stepId(), name: `${state.steps[index].name} (Copy)` });
    renderSteps();
  });
  list.querySelectorAll('.workflow-step-card').forEach(card => {
    card.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', card.dataset.index); card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', event => event.preventDefault());
    card.addEventListener('drop', event => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData('text/plain'));
      const to = Number(card.dataset.index);
      if (from === to || Number.isNaN(from) || Number.isNaN(to)) return;
      const [moved] = state.steps.splice(from, 1);
      state.steps.splice(to, 0, moved);
      renderSteps();
    });
  });
}

function editStep(index) {
  const step = normalizeStep(index === null ? {} : state.steps[index], index ?? state.steps.length);
  document.getElementById('workflowStepEditor')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="workflow-step-editor-backdrop" id="workflowStepEditor"><section class="workflow-step-editor">
      <header><div><p>${index === null ? 'ADD STEP' : 'EDIT STEP'}</p><h3>Workflow stage</h3></div><button type="button" id="closeWorkflowStepEditor">×</button></header>
      <form id="workflowStepForm">
        <label>Step name<input name="name" value="${esc(step.name)}" placeholder="Reviewer Evaluation" required></label>
        <label>Required permission<select name="requiredPermission" required>${permissionOptions(step.requiredPermission)}</select></label>
        <label class="full">Description <small>(optional)</small><textarea name="description" placeholder="Explain what the reviewer must complete during this stage.">${esc(step.description)}</textarea></label>
        <label>Assignment method<select name="assignmentMode"><option value="MANUAL_OR_SINGLE_ELIGIBLE" ${step.assignmentMode === 'MANUAL_OR_SINGLE_ELIGIBLE' ? 'selected' : ''}>Manual or single eligible user</option><option value="MANUAL" ${step.assignmentMode === 'MANUAL' ? 'selected' : ''}>Manual assignment only</option><option value="CLAIMABLE" ${step.assignmentMode === 'CLAIMABLE' ? 'selected' : ''}>Claimable queue</option></select></label>
        <label>Target completion days<input name="dueDays" type="number" min="0" max="365" value="${step.dueDays}"></label>
        <label>Escalate to permission<select name="escalationPermission">${permissionOptions(step.escalationPermission, true)}</select></label>
        <div class="workflow-step-toggles"><label><input name="required" type="checkbox" ${step.required ? 'checked' : ''}> Required before advancing</label><label><input name="enabled" type="checkbox" ${step.enabled ? 'checked' : ''}> Step enabled</label></div>
        <div class="workflow-step-editor-actions"><button type="button" class="performance-btn" id="cancelWorkflowStepEditor">Cancel</button><button type="submit" class="performance-btn primary">${index === null ? 'Add Step' : 'Save Step'}</button></div>
      </form>
    </section></div>`);
  const close = () => document.getElementById('workflowStepEditor')?.remove();
  document.getElementById('closeWorkflowStepEditor').onclick = close;
  document.getElementById('cancelWorkflowStepEditor').onclick = close;
  document.getElementById('workflowStepForm').onsubmit = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const updated = {
      ...step,
      name: String(form.get('name')).trim(),
      description: String(form.get('description') || '').trim(),
      requiredPermission: String(form.get('requiredPermission')),
      assignmentMode: String(form.get('assignmentMode')),
      dueDays: Number(form.get('dueDays') || 0),
      escalationPermission: String(form.get('escalationPermission') || ''),
      required: form.get('required') === 'on',
      enabled: form.get('enabled') === 'on',
    };
    if (index === null) state.steps.push(updated); else state.steps[index] = updated;
    close();
    renderSteps();
  };
}

async function saveWorkflow() {
  const button = document.getElementById('workflowBuilderSave');
  const title = document.getElementById('workflowBuilderTitle').value.trim();
  if (!title) return alert('Enter a workflow title.');
  if (!state.steps.length) return alert('Add at least one workflow step.');
  if (!state.steps.some(step => step.enabled)) return alert('At least one workflow step must be enabled.');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const payload = {
      title,
      status: document.getElementById('workflowBuilderStatus').value,
      description: document.getElementById('workflowBuilderDescription').value.trim(),
      steps: state.steps.map((step, index) => ({ ...normalizeStep(step, index), order: index + 1 })),
      updatedAt: serverTimestamp(),
    };
    if (state.workflow) await updateDoc(doc(db, 'performanceWorkflows', state.workflow.id), payload);
    else await addDoc(collection(db, 'performanceWorkflows'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
    closeBuilder();
    document.querySelector('[data-performance-tab="workflows"]')?.click();
  } catch (error) {
    console.error(error);
    alert(`Unable to save workflow: ${error.code || error.message}`);
    button.disabled = false;
    button.textContent = 'Save Workflow';
  }
}

async function openBuilder(workflowId = '') {
  try { openShell(await loadWorkflow(workflowId)); }
  catch (error) { console.error(error); alert(`Unable to open workflow builder: ${error.code || error.message}`); }
}

document.addEventListener('click', event => {
  const create = event.target.closest('#newPerformanceWorkflow');
  const edit = event.target.closest('.performance-edit-workflow');
  if (!create && !edit) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openBuilder(edit?.dataset.id || '');
}, true);
