import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let cache = null;
let cacheAt = 0;
let installing = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes(permission) || permissions.includes('internships.manage');
};
const canViewAll = () => has('internships.manage_people') || has('internships.view_reports') || has('internships.assign') || has('internships.manage');

async function loadData(force = false) {
  if (!force && cache && Date.now() - cacheAt < 10000) return cache;
  const names = ['internshipEnrollments', 'internshipTasks'];
  const [enrollments, tasks] = await Promise.all(names.map(async name => {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(item => ({ id: item.id, ...item.data() }));
  }));
  cache = { enrollments, tasks };
  cacheAt = Date.now();
  return cache;
}

function dateText(value) {
  if (!value) return '—';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function statusLabel(value) {
  return String(value || 'ACTIVE').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function buildRows(data) {
  const now = Date.now();
  return data.enrollments.map(enrollment => {
    const tasks = data.tasks.filter(task => task.enrollmentId === enrollment.id || (enrollment.internUid && task.internUid === enrollment.internUid));
    const approved = tasks.filter(task => ['APPROVED', 'WAIVED'].includes(String(task.status || '').toUpperCase())).length;
    const submitted = tasks.filter(task => String(task.status || '').toUpperCase() === 'SUBMITTED').length;
    const overdue = tasks.filter(task => {
      const status = String(task.status || '').toUpperCase();
      const due = task.dueDate?.toDate ? task.dueDate.toDate().getTime() : new Date(task.dueDate || 0).getTime();
      return due > 0 && due < now && !['APPROVED', 'WAIVED'].includes(status);
    }).length;
    const progress = tasks.length ? Math.round((approved / tasks.length) * 100) : 0;
    const standing = String(enrollment.standing || 'ON_TRACK').toUpperCase().replaceAll(' ', '_');
    const status = String(enrollment.status || 'ACTIVE').toUpperCase();
    return {
      id: enrollment.id,
      internName: enrollment.internName || 'Unnamed intern',
      programTitle: enrollment.programTitle || 'Internship Program',
      department: enrollment.departmentName || enrollment.department || 'Unassigned',
      supervisorName: enrollment.supervisorName || 'Unassigned',
      standing,
      status,
      currentPhase: enrollment.currentPhase || 'Orientation',
      expectedCompletionDate: enrollment.expectedCompletionDate,
      totalTasks: tasks.length,
      approved,
      submitted,
      overdue,
      progress,
    };
  }).sort((a, b) => a.internName.localeCompare(b.internName));
}

function rowMarkup(row) {
  const dueMs = row.expectedCompletionDate?.toDate?.()?.getTime() ?? new Date(row.expectedCompletionDate || '2999-01-01').getTime();
  const search = `${row.internName} ${row.programTitle} ${row.department} ${row.supervisorName} ${row.currentPhase}`.toLowerCase();
  return `<tr data-search="${esc(search)}" data-department="${esc(row.department)}" data-program="${esc(row.programTitle)}" data-standing="${esc(row.standing)}" data-status="${esc(row.status)}" data-progress="${row.progress}" data-overdue="${row.overdue}" data-due="${dueMs}">
    <td><div class="internship-status-person"><strong>${esc(row.internName)}</strong><span>${esc(row.programTitle)}</span></div></td>
    <td>${esc(row.department)}</td>
    <td>${esc(row.supervisorName)}</td>
    <td><div class="internship-status-progress"><div><strong>${row.approved}</strong><span>/ ${row.totalTasks} tasks</span></div><div class="internship-status-bar"><i style="width:${row.progress}%"></i></div><small>${row.progress}% complete</small></div></td>
    <td>${row.submitted}</td>
    <td><span class="internship-overdue-count ${row.overdue ? 'has-overdue' : ''}">${row.overdue}</span></td>
    <td>${esc(row.currentPhase)}</td>
    <td>${dateText(row.expectedCompletionDate)}</td>
    <td><span class="internship-status-badge ${esc(row.standing.toLowerCase().replaceAll('_','-'))}">${esc(statusLabel(row.standing))}</span></td>
  </tr>`;
}

function render(data) {
  const rows = buildRows(data);
  const departments = [...new Set(rows.map(r => r.department))].sort();
  const programs = [...new Set(rows.map(r => r.programTitle))].sort();
  const active = rows.filter(r => r.status === 'ACTIVE').length;
  const onTrack = rows.filter(r => r.standing === 'ON_TRACK').length;
  const attention = rows.filter(r => ['ATTENTION_NEEDED','IMPROVEMENT_PLAN','MONITOR'].includes(r.standing) || r.overdue > 0).length;
  const completed = rows.filter(r => r.status === 'COMPLETED').length;
  return `<section class="internship-section internship-current-status-section">
    <div class="internship-section-head"><div><p>LIVE OVERSIGHT</p><h2>Current internship status</h2><span class="internship-section-subtitle">See every intern's progress, review queue, overdue work, standing, and expected completion.</span></div><button class="internship-btn secondary" id="internshipStatusRefresh">Refresh</button></div>
    <div class="internship-current-status-stats">
      <article><strong>${active}</strong><span>Active interns</span></article>
      <article><strong>${onTrack}</strong><span>On track</span></article>
      <article><strong>${attention}</strong><span>Needs attention</span></article>
      <article><strong>${completed}</strong><span>Completed</span></article>
    </div>
    <div class="internship-status-filters">
      <label><span>Search</span><input id="internshipStatusSearch" type="search" placeholder="Search intern, program, department…"></label>
      <label><span>Department</span><select id="internshipStatusDepartment"><option value="">All departments</option>${departments.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>
      <label><span>Program</span><select id="internshipStatusProgram"><option value="">All programs</option>${programs.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>
      <label><span>Standing</span><select id="internshipStatusStanding"><option value="">All standings</option><option value="ON_TRACK">On Track</option><option value="MONITOR">Monitor</option><option value="ATTENTION_NEEDED">Attention Needed</option><option value="IMPROVEMENT_PLAN">Improvement Plan</option><option value="PAUSED">Paused</option></select></label>
      <label><span>Sort</span><select id="internshipStatusSort"><option value="name">Intern name</option><option value="progress-desc">Highest progress</option><option value="progress-asc">Lowest progress</option><option value="overdue-desc">Most overdue</option><option value="due">Expected completion</option></select></label>
      <button class="internship-btn secondary" type="button" id="internshipStatusClear">Clear filters</button>
    </div>
    <div class="internship-status-result-count"><strong id="internshipStatusCount">${rows.length}</strong> internship record${rows.length === 1 ? '' : 's'}</div>
    <div class="internship-status-table-wrap"><table class="internship-status-table"><thead><tr><th>Intern</th><th>Department</th><th>Supervisor</th><th>Progress</th><th>Awaiting review</th><th>Overdue</th><th>Phase</th><th>Expected completion</th><th>Standing</th></tr></thead><tbody id="internshipStatusRows">${rows.map(rowMarkup).join('') || '<tr><td colspan="9"><div class="internship-empty">No internship enrollments are available.</div></td></tr>'}</tbody></table></div>
  </section>`;
}

function applyFilters(section) {
  const search = section.querySelector('#internshipStatusSearch').value.trim().toLowerCase();
  const department = section.querySelector('#internshipStatusDepartment').value;
  const program = section.querySelector('#internshipStatusProgram').value;
  const standing = section.querySelector('#internshipStatusStanding').value;
  const sort = section.querySelector('#internshipStatusSort').value;
  const body = section.querySelector('#internshipStatusRows');
  const rows = [...body.querySelectorAll('tr[data-search]')];
  rows.forEach(row => row.hidden = !((!search || row.dataset.search.includes(search)) && (!department || row.dataset.department === department) && (!program || row.dataset.program === program) && (!standing || row.dataset.standing === standing)));
  rows.sort((a,b) => {
    if (sort === 'progress-desc') return Number(b.dataset.progress) - Number(a.dataset.progress);
    if (sort === 'progress-asc') return Number(a.dataset.progress) - Number(b.dataset.progress);
    if (sort === 'overdue-desc') return Number(b.dataset.overdue) - Number(a.dataset.overdue);
    if (sort === 'due') return Number(a.dataset.due) - Number(b.dataset.due);
    return a.querySelector('.internship-status-person strong').textContent.localeCompare(b.querySelector('.internship-status-person strong').textContent);
  }).forEach(row => body.appendChild(row));
  section.querySelector('#internshipStatusCount').textContent = String(rows.filter(row => !row.hidden).length);
}

function bind(section) {
  ['internshipStatusSearch','internshipStatusDepartment','internshipStatusProgram','internshipStatusStanding','internshipStatusSort'].forEach(id => {
    const el = section.querySelector(`#${id}`);
    el?.addEventListener(id === 'internshipStatusSearch' ? 'input' : 'change', () => applyFilters(section));
  });
  section.querySelector('#internshipStatusClear')?.addEventListener('click', () => {
    section.querySelector('#internshipStatusSearch').value = '';
    section.querySelector('#internshipStatusDepartment').value = '';
    section.querySelector('#internshipStatusProgram').value = '';
    section.querySelector('#internshipStatusStanding').value = '';
    section.querySelector('#internshipStatusSort').value = 'name';
    applyFilters(section);
  });
  section.querySelector('#internshipStatusRefresh')?.addEventListener('click', () => openStatus(true));
}

async function openStatus(force = false) {
  const view = document.querySelector('.internship-view');
  if (!view) return;
  document.querySelectorAll('.internship-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector('[data-internship-current-status]')?.classList.add('active');
  view.innerHTML = '<section class="internship-loading">Loading current internship status…</section>';
  try {
    const data = await loadData(force);
    view.innerHTML = render(data);
    bind(view.querySelector('.internship-current-status-section'));
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="internship-empty">Unable to load current internship status: ${esc(error?.message || 'Unknown error')}</div>`;
  }
}

function installTab() {
  if (!canViewAll()) return;
  const tabs = document.querySelector('.internship-tabs');
  if (!tabs || tabs.querySelector('[data-internship-current-status]')) return;
  const button = document.createElement('button');
  button.className = 'internship-tab';
  button.dataset.internshipCurrentStatus = 'true';
  button.textContent = 'Current Status';
  const internsTab = tabs.querySelector('[data-internship-tab="interns"]');
  if (internsTab) tabs.insertBefore(button, internsTab); else tabs.appendChild(button);
  button.addEventListener('click', () => openStatus(false));
}

new MutationObserver(() => {
  if (installing) return;
  installing = true;
  installTab();
  installing = false;
}).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snap = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snap.exists() ? snap.data() : null;
  installTab();
});
