import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let taskData = null;
let taskFilters = { search: '', status: 'ALL', priority: 'ALL', intern: 'ALL', program: 'ALL', due: 'ALL' };

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const hasPermission = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes(permission)
    || permissions.includes('internships.manage');
};

const canAssign = () => hasPermission('internships.assign') || hasPermission('internships.manage_people');
const canSupervise = () => hasPermission('internships.supervise');
const dateText = value => {
  if (!value) return 'No due date';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'No due date' : date.toLocaleDateString();
};
const dateValue = value => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;
const statusLabel = status => String(status || 'NOT_STARTED').replaceAll('_', ' ');

async function loadTaskData() {
  const names = ['internshipTasks', 'internshipEnrollments'];
  const [tasks, enrollments] = await Promise.all(names.map(async name => {
    const snapshot = await getDocs(collection(db, name));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  }));
  taskData = { tasks, enrollments };
  return taskData;
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

function selectField(label, name, options, value = '', required = false) {
  return `<label class="internship-field"><span>${esc(label)}${required ? '<b>Required</b>' : ''}</span><div class="internship-select-wrap"><select name="${esc(name)}" ${required ? 'required' : ''}><option value="">Select an option</option>${options.map(option => `<option value="${esc(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select></div></label>`;
}

function inputField(label, name, options = {}) {
  const { type = 'text', value = '', required = false, placeholder = '', rows = 4, min = '', max = '', help = '' } = options;
  const control = type === 'textarea'
    ? `<textarea name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}>${esc(value)}</textarea>`
    : `<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${min !== '' ? `min="${esc(min)}"` : ''} ${max !== '' ? `max="${esc(max)}"` : ''}>`;
  return `<label class="internship-field"><span>${esc(label)}${required ? '<b>Required</b>' : ''}</span>${control}${help ? `<small>${esc(help)}</small>` : ''}</label>`;
}

function openTaskModal(task = null) {
  const activeEnrollments = taskData.enrollments.filter(enrollment => !['COMPLETED', 'WITHDRAWN', 'CANCELLED', 'UNSUCCESSFUL'].includes(String(enrollment.status || '').toUpperCase()));
  const enrollmentOptions = activeEnrollments.map(enrollment => ({
    value: enrollment.id,
    label: `${enrollment.internName || 'Unnamed intern'} — ${enrollment.programTitle || 'Internship Program'}`
  }));
  const overlay = document.createElement('div');
  overlay.className = 'internship-modal-overlay';
  overlay.innerHTML = `<div class="internship-modal internship-modal-large" role="dialog" aria-modal="true">
    <form class="internship-modal-form">
      <header class="internship-modal-header">
        <div class="internship-modal-mark">✓</div>
        <div class="internship-modal-heading"><p>TASK MANAGEMENT</p><h2>${task ? 'Edit internship task' : 'Create internship task'}</h2><span>${task ? 'Update assignment details, schedule, or priority.' : 'Assign structured work to an enrolled intern.'}</span></div>
        <button class="internship-modal-close" type="button">×</button>
      </header>
      <div class="internship-modal-body">
        ${enrollmentOptions.length ? '' : '<div class="internship-callout warning"><strong>No active enrollments exist.</strong><span>Enroll an intern before creating a task.</span></div>'}
        ${selectField('Intern enrollment', 'enrollmentId', enrollmentOptions, task?.enrollmentId || '', true)}
        <div class="internship-form-grid two">
          ${inputField('Task title', 'title', { required: true, value: task?.title || '', placeholder: 'Complete orientation reflection' })}
          ${selectField('Priority', 'priority', [{ value: 'LOW', label: 'Low' }, { value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'High' }, { value: 'URGENT', label: 'Urgent' }], task?.priority || 'NORMAL', true)}
        </div>
        ${inputField('Instructions', 'description', { type: 'textarea', rows: 5, required: true, value: task?.description || '', placeholder: 'Explain exactly what the intern needs to complete…' })}
        <div class="internship-form-grid two">
          ${inputField('Phase', 'phase', { required: true, value: task?.phase || 'Orientation' })}
          ${inputField('Due date', 'dueDate', { type: 'date', required: true, value: dateValue(task?.dueDate) })}
        </div>
        <div class="internship-form-grid two">
          ${selectField('Status', 'status', [{ value: 'NOT_STARTED', label: 'Not started' }, { value: 'IN_PROGRESS', label: 'In progress' }], task?.status || 'NOT_STARTED', true)}
          ${inputField('Points', 'points', { type: 'number', min: 0, max: 1000, value: task?.points ?? 100, help: 'Optional weighting for progress tracking.' })}
        </div>
        ${inputField('Resources or evidence expectations', 'resources', { type: 'textarea', rows: 3, value: task?.resources || '', placeholder: 'Links, documents, examples, or required evidence…' })}
        <div class="internship-modal-error" hidden></div>
      </div>
      <footer class="internship-modal-footer"><button type="button" class="internship-modal-cancel">Cancel</button><button type="submit" class="internship-modal-submit"><span>${task ? 'Save changes' : 'Create task'}</span><i class="internship-spinner"></i></button></footer>
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
  overlay.addEventListener('mousedown', event => { if (event.target === overlay && !submit.disabled) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    submit.classList.add('loading');
    errorBox.hidden = true;
    try {
      const values = new FormData(form);
      const enrollment = taskData.enrollments.find(item => item.id === String(values.get('enrollmentId') || ''));
      const title = String(values.get('title') || '').trim();
      const description = String(values.get('description') || '').trim();
      const dueDate = String(values.get('dueDate') || '');
      if (!enrollment || !title || !description || !dueDate) throw new Error('Enrollment, title, instructions, and due date are required.');
      const payload = {
        enrollmentId: enrollment.id,
        internUid: enrollment.internUid,
        internName: enrollment.internName || 'Intern',
        programId: enrollment.programId,
        programTitle: enrollment.programTitle || 'Internship Program',
        supervisorUid: enrollment.supervisorUid,
        supervisorName: enrollment.supervisorName || 'Supervisor',
        title,
        description,
        phase: String(values.get('phase') || 'General').trim() || 'General',
        priority: String(values.get('priority') || 'NORMAL'),
        status: String(values.get('status') || 'NOT_STARTED'),
        dueDate: toTimestamp(dueDate),
        points: Number(values.get('points') || 0),
        resources: String(values.get('resources') || '').trim(),
        updatedAt: serverTimestamp()
      };
      if (task) {
        await updateDoc(doc(db, 'internshipTasks', task.id), payload);
      } else {
        await addDoc(collection(db, 'internshipTasks'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });
      }
      close();
      await renderTaskWorkspace(true);
      showToast(task ? 'The internship task was updated.' : `“${title}” was assigned to ${enrollment.internName || 'the intern'}.`);
    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || 'The task could not be saved.';
      errorBox.hidden = false;
      submit.disabled = false;
      submit.classList.remove('loading');
    }
  });
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function taskCard(task) {
  return `<article class="internship-card internship-task-admin-card">
    <div class="internship-card-head"><span class="internship-badge ${String(task.status || 'NOT_STARTED').toLowerCase().replaceAll('_', '-')}">${esc(statusLabel(task.status))}</span><strong>${esc(dateText(task.dueDate))}</strong></div>
    <h3>${esc(task.title || 'Internship Task')}</h3>
    <p>${esc(task.description || 'No instructions provided.')}</p>
    <div class="internship-task-assignee"><strong>${esc(task.internName || 'Intern')}</strong><span>${esc(task.programTitle || 'Internship Program')}</span></div>
    <div class="internship-meta"><span>${esc(task.phase || 'General')}</span><span>${esc(task.priority || 'Normal')}</span></div>
    ${canAssign() ? `<div class="internship-actions"><button type="button" class="internship-btn secondary internship-edit-task" data-task-id="${task.id}">Edit task</button></div>` : ''}
  </article>`;
}

function dueBucket(task) {
  if (!task.dueDate) return 'NO_DATE';
  const due = task.dueDate?.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return 'NO_DATE';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dueDay - today) / 86400000);
  if (diff < 0) return 'OVERDUE';
  if (diff === 0) return 'TODAY';
  if (diff <= 7) return 'NEXT_7_DAYS';
  return 'LATER';
}

function filteredTasks(tasks) {
  const search = taskFilters.search.trim().toLowerCase();
  return tasks.filter(task => {
    const haystack = [task.title, task.description, task.internName, task.programTitle, task.phase, task.supervisorName].join(' ').toLowerCase();
    return (!search || haystack.includes(search))
      && (taskFilters.status === 'ALL' || String(task.status || 'NOT_STARTED') === taskFilters.status)
      && (taskFilters.priority === 'ALL' || String(task.priority || 'NORMAL') === taskFilters.priority)
      && (taskFilters.intern === 'ALL' || String(task.internUid || '') === taskFilters.intern)
      && (taskFilters.program === 'ALL' || String(task.programId || '') === taskFilters.program)
      && (taskFilters.due === 'ALL' || dueBucket(task) === taskFilters.due);
  });
}

function optionList(items, valueKey, labelKey) {
  const unique = new Map();
  items.forEach(item => {
    const value = item[valueKey];
    const label = item[labelKey];
    if (value && label && !unique.has(value)) unique.set(value, label);
  });
  return [...unique.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
}

function renderFilterControls(tasks) {
  const interns = optionList(tasks, 'internUid', 'internName');
  const programs = optionList(tasks, 'programId', 'programTitle');
  return `<div class="internship-task-filters">
    <label class="internship-task-search"><span>Search tasks</span><input id="taskFilterSearch" type="search" value="${esc(taskFilters.search)}" placeholder="Search title, intern, program, phase…"></label>
    <label><span>Status</span><select id="taskFilterStatus"><option value="ALL">All statuses</option>${['NOT_STARTED','IN_PROGRESS','SUBMITTED','CHANGES_REQUESTED','APPROVED','REJECTED','WAIVED'].map(value => `<option value="${value}" ${taskFilters.status === value ? 'selected' : ''}>${esc(statusLabel(value))}</option>`).join('')}</select></label>
    <label><span>Priority</span><select id="taskFilterPriority"><option value="ALL">All priorities</option>${['LOW','NORMAL','HIGH','URGENT'].map(value => `<option value="${value}" ${taskFilters.priority === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
    <label><span>Intern</span><select id="taskFilterIntern"><option value="ALL">All interns</option>${interns.map(([value,label]) => `<option value="${esc(value)}" ${taskFilters.intern === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
    <label><span>Program</span><select id="taskFilterProgram"><option value="ALL">All programs</option>${programs.map(([value,label]) => `<option value="${esc(value)}" ${taskFilters.program === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
    <label><span>Due date</span><select id="taskFilterDue"><option value="ALL">Any due date</option><option value="OVERDUE" ${taskFilters.due === 'OVERDUE' ? 'selected' : ''}>Overdue</option><option value="TODAY" ${taskFilters.due === 'TODAY' ? 'selected' : ''}>Due today</option><option value="NEXT_7_DAYS" ${taskFilters.due === 'NEXT_7_DAYS' ? 'selected' : ''}>Next 7 days</option><option value="LATER" ${taskFilters.due === 'LATER' ? 'selected' : ''}>Later</option><option value="NO_DATE" ${taskFilters.due === 'NO_DATE' ? 'selected' : ''}>No due date</option></select></label>
    <button type="button" class="internship-task-clear" id="taskFilterClear">Clear filters</button>
  </div>`;
}

function bindFilterControls(allTasks) {
  const apply = () => {
    taskFilters = {
      search: document.getElementById('taskFilterSearch')?.value || '',
      status: document.getElementById('taskFilterStatus')?.value || 'ALL',
      priority: document.getElementById('taskFilterPriority')?.value || 'ALL',
      intern: document.getElementById('taskFilterIntern')?.value || 'ALL',
      program: document.getElementById('taskFilterProgram')?.value || 'ALL',
      due: document.getElementById('taskFilterDue')?.value || 'ALL'
    };
    renderFilteredGrid(allTasks);
  };
  let timer;
  document.getElementById('taskFilterSearch')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(apply, 140);
  });
  ['taskFilterStatus','taskFilterPriority','taskFilterIntern','taskFilterProgram','taskFilterDue'].forEach(id => document.getElementById(id)?.addEventListener('change', apply));
  document.getElementById('taskFilterClear')?.addEventListener('click', () => {
    taskFilters = { search: '', status: 'ALL', priority: 'ALL', intern: 'ALL', program: 'ALL', due: 'ALL' };
    renderTaskWorkspace(false);
  });
}

function renderFilteredGrid(allTasks) {
  const results = filteredTasks(allTasks);
  const grid = document.getElementById('internshipTaskGrid');
  const count = document.getElementById('internshipTaskResultCount');
  if (count) count.textContent = `${results.length} of ${allTasks.length} tasks shown`;
  if (!grid) return;
  grid.innerHTML = results.map(taskCard).join('') || '<div class="internship-empty">No tasks match the selected filters.</div>';
  document.querySelectorAll('.internship-edit-task').forEach(button => button.addEventListener('click', () => openTaskModal(taskData.tasks.find(task => task.id === button.dataset.taskId))));
}

async function renderTaskWorkspace(force = false) {
  const view = document.querySelector('.internship-view');
  if (!view) return;
  view.innerHTML = '<section class="internship-loading">Loading internship tasks…</section>';
  try {
    const data = force || !taskData ? await loadTaskData() : taskData;
    const uid = auth.currentUser?.uid;
    const visibleTasks = canAssign() ? data.tasks : data.tasks.filter(task => task.supervisorUid === uid);
    const openCount = visibleTasks.filter(task => !['APPROVED', 'WAIVED'].includes(task.status)).length;
    view.innerHTML = `<section class="internship-section internship-task-workspace">
      <div class="internship-section-head"><div><p>ASSIGNMENTS</p><h2>Internship task management</h2><span class="internship-section-subtitle">Create, assign, schedule, and monitor work for every active intern.</span></div>${canAssign() ? '<button class="internship-btn" id="internshipNewTask">+ Create task</button>' : ''}</div>
      <div class="internship-task-toolbar"><span><strong>${visibleTasks.length}</strong>Total tasks</span><span><strong>${openCount}</strong>Open</span><span><strong>${visibleTasks.filter(task => task.status === 'SUBMITTED').length}</strong>Submitted</span><span><strong>${visibleTasks.filter(task => task.status === 'APPROVED').length}</strong>Approved</span></div>
      ${renderFilterControls(visibleTasks)}
      <div class="internship-task-filter-summary"><span id="internshipTaskResultCount">${filteredTasks(visibleTasks).length} of ${visibleTasks.length} tasks shown</span></div>
      <div class="internship-grid" id="internshipTaskGrid">${filteredTasks(visibleTasks).map(taskCard).join('') || '<div class="internship-empty">No tasks match the selected filters.</div>'}</div>
    </section>`;
    document.getElementById('internshipNewTask')?.addEventListener('click', () => openTaskModal());
    document.querySelectorAll('.internship-edit-task').forEach(button => button.addEventListener('click', () => openTaskModal(data.tasks.find(task => task.id === button.dataset.taskId))));
    bindFilterControls(visibleTasks);
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="internship-empty">Unable to load internship tasks: ${esc(error?.message || 'Unknown error')}</div>`;
  }
}

function installTaskTab() {
  const tabs = document.querySelector('.internship-tabs');
  if (!tabs || tabs.querySelector('[data-internship-task-management]') || !(canAssign() || canSupervise())) return;
  const button = document.createElement('button');
  button.className = 'internship-tab';
  button.dataset.internshipTaskManagement = 'true';
  button.textContent = 'Task Management';
  const reviewButton = tabs.querySelector('[data-internship-tab="review-queue"]');
  if (reviewButton) tabs.insertBefore(button, reviewButton); else tabs.appendChild(button);
  button.addEventListener('click', () => {
    tabs.querySelectorAll('.internship-tab').forEach(tab => tab.classList.remove('active'));
    button.classList.add('active');
    renderTaskWorkspace(true);
  });
}

const observer = new MutationObserver(installTaskTab);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
  installTaskTab();
});