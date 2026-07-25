import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let currentTab = 'overview';
let cache = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes(permission) || permissions.includes('internships.manage');
};
const canAccess = () => has('internships.access') || has('internships.participate') || has('internships.supervise') || has('internships.assign') || has('internships.manage_programs') || has('internships.manage_people') || has('internships.view_reports');
const canParticipate = () => has('internships.participate');
const canSupervise = () => has('internships.supervise');
const canAssign = () => has('internships.assign');
const canManagePrograms = () => has('internships.manage_programs');
const canManagePeople = () => has('internships.manage_people');
const canViewReports = () => has('internships.view_reports');

async function loadData(force = false) {
  if (cache && !force && Date.now() - cache.loadedAt < 10000) return cache;
  const names = ['internshipPrograms','internshipEnrollments','internshipTasks','internshipTaskSubmissions','internshipWeeklyReports','portalAccounts','staffProfiles'];
  const [programs,enrollments,tasks,submissions,reports,accounts,staff] = await Promise.all(names.map(async name => {
    try {
      const snapshot = await getDocs(collection(db, name));
      return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
      console.warn(`Unable to load ${name}`, error);
      return [];
    }
  }));
  cache = { programs,enrollments,tasks,submissions,reports,accounts,staff,loadedAt:Date.now() };
  return cache;
}

function navButton() {
  const nav = document.querySelector('#sidebar nav');
  if (!nav || nav.querySelector('[data-internship-center]') || !canAccess()) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.internshipCenter = 'true';
  button.innerHTML = '<span>🎓</span>Internship Center';
  const performance = nav.querySelector('[data-performance-center]');
  if (performance) nav.insertBefore(button, performance); else nav.appendChild(button);
  button.onclick = () => openCenter();
}

const badge = status => `<span class="internship-badge ${String(status || 'NOT_STARTED').toLowerCase().replaceAll('_','-')}">${esc(String(status || 'NOT_STARTED').replaceAll('_',' '))}</span>`;
const dateText = value => {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};

function tab(id,label,visible=true){ return visible ? `<button class="internship-tab ${currentTab===id?'active':''}" data-internship-tab="${id}">${label}</button>` : ''; }

async function openCenter(tabName=currentTab){
  currentTab = tabName;
  const main = document.querySelector('.layout > main');
  if (!main) return;
  main.innerHTML = '<section class="internship-loading">Loading Internship Center…</section>';
  try {
    const data = await loadData();
    const uid = auth.currentUser?.uid;
    const myEnrollments = data.enrollments.filter(item => item.internUid === uid);
    const assignedEnrollments = data.enrollments.filter(item => item.supervisorUid === uid);
    main.innerHTML = `<div class="internship-center">
      <section class="internship-hero">
        <div><p>WORKFORCE DEVELOPMENT</p><h1>Internship Center</h1><span>Manage programs, assignments, progress, submissions, weekly reports, and completion in one place.</span></div>
        <div class="internship-stats">
          <article><strong>${myEnrollments.length}</strong><span>My internships</span></article>
          <article><strong>${assignedEnrollments.length}</strong><span>Assigned interns</span></article>
          <article><strong>${data.tasks.filter(task => task.status === 'SUBMITTED').length}</strong><span>Awaiting review</span></article>
          <article><strong>${data.programs.filter(program => program.status === 'ACTIVE').length}</strong><span>Active programs</span></article>
        </div>
      </section>
      <nav class="internship-tabs">
        ${tab('overview','Overview')}
        ${tab('my-internship','My Internship',canParticipate())}
        ${tab('tasks','My Tasks',canParticipate())}
        ${tab('review-queue','Review Queue',canSupervise())}
        ${tab('interns','Interns',canSupervise()||canAssign()||canManagePeople())}
        ${tab('programs','Programs',canManagePrograms())}
        ${tab('reports','Reports',canViewReports())}
      </nav>
      <section class="internship-view" id="internshipView">${renderTab(data)}</section>
    </div>`;
    bindActions(data);
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel"><h1>Internship Center</h1><p class="error">Unable to load: ${esc(error.code || error.message)}</p></section>`;
  }
}

function renderTab(data){
  if (currentTab==='my-internship') return renderMyInternship(data);
  if (currentTab==='tasks') return renderMyTasks(data);
  if (currentTab==='review-queue') return renderReviewQueue(data);
  if (currentTab==='interns') return renderInterns(data);
  if (currentTab==='programs') return renderPrograms(data);
  if (currentTab==='reports') return renderReports(data);
  return renderOverview(data);
}

function renderOverview(data){
  const uid = auth.currentUser?.uid;
  const myTasks = data.tasks.filter(task => task.internUid===uid);
  const assigned = data.enrollments.filter(item => item.supervisorUid===uid);
  return `<section class="internship-section"><div class="internship-section-head"><div><p>DASHBOARD</p><h2>Internship activity</h2></div></div>
    <div class="internship-grid">
      <article class="internship-card"><h3>My progress</h3><p>${myTasks.filter(t=>t.status==='APPROVED').length} of ${myTasks.length} tasks approved.</p></article>
      <article class="internship-card"><h3>Supervisor queue</h3><p>${data.tasks.filter(t=>t.supervisorUid===uid&&t.status==='SUBMITTED').length} submission(s) awaiting review.</p></article>
      <article class="internship-card"><h3>Assigned interns</h3><p>${assigned.length} active internship enrollment(s).</p></article>
      <article class="internship-card"><h3>Programs</h3><p>${data.programs.length} program record(s) available.</p></article>
    </div></section>`;
}

function renderMyInternship(data){
  const uid = auth.currentUser?.uid;
  const enrollment = data.enrollments.find(item => item.internUid===uid && !['COMPLETED','WITHDRAWN','CANCELLED'].includes(String(item.status||'').toUpperCase()));
  if (!enrollment) return '<div class="internship-empty">You do not currently have an active internship enrollment.</div>';
  const tasks = data.tasks.filter(task => task.enrollmentId===enrollment.id);
  const approved = tasks.filter(task=>task.status==='APPROVED').length;
  const progress = tasks.length ? Math.round((approved/tasks.length)*100) : 0;
  return `<section class="internship-section"><div class="internship-enrollment-card"><div><p>ACTIVE INTERNSHIP</p><h2>${esc(enrollment.programTitle||'Internship Program')}</h2><span>${esc(enrollment.departmentName||'General Department')}</span></div><strong>${progress}%</strong></div>
    <div class="internship-detail-grid">
      <article><span>Supervisor</span><strong>${esc(enrollment.supervisorName||'Unassigned')}</strong></article>
      <article><span>Current phase</span><strong>${esc(enrollment.currentPhase||'Orientation')}</strong></article>
      <article><span>Standing</span><strong>${esc(enrollment.standing||'On Track')}</strong></article>
      <article><span>Expected completion</span><strong>${dateText(enrollment.expectedCompletionDate)}</strong></article>
    </div></section>`;
}

function renderMyTasks(data){
  const uid = auth.currentUser?.uid;
  const tasks = data.tasks.filter(task=>task.internUid===uid);
  return `<section class="internship-section"><div class="internship-section-head"><div><p>ASSIGNMENTS</p><h2>My tasks</h2></div></div><div class="internship-grid">${tasks.map(task=>taskCard(task,true)).join('')||'<div class="internship-empty">No internship tasks have been assigned yet.</div>'}</div></section>`;
}

function taskCard(task,own=false){
  return `<article class="internship-card"><div class="internship-card-head">${badge(task.status)}<strong>${dateText(task.dueDate)}</strong></div><h3>${esc(task.title||'Internship Task')}</h3><p>${esc(task.description||'No description provided.')}</p><div class="internship-meta"><span>${esc(task.phase||'General')}</span><span>${esc(task.priority||'Normal')}</span></div><div class="internship-actions">${own&&['NOT_STARTED','IN_PROGRESS','CHANGES_REQUESTED'].includes(task.status||'NOT_STARTED')?`<button class="internship-btn submit-task" data-id="${task.id}">Submit work</button>`:''}</div></article>`;
}

function renderReviewQueue(data){
  const uid = auth.currentUser?.uid;
  const tasks = data.tasks.filter(task=>task.supervisorUid===uid && task.status==='SUBMITTED');
  return `<section class="internship-section"><div class="internship-section-head"><div><p>SUPERVISOR WORK</p><h2>Review queue</h2></div></div><div class="internship-grid">${tasks.map(task=>`<article class="internship-card"><div class="internship-card-head">${badge(task.status)}<strong>${esc(task.internName||'Intern')}</strong></div><h3>${esc(task.title)}</h3><p>${esc(task.latestSubmissionText||'Submission ready for review.')}</p><div class="internship-actions"><button class="internship-btn approve-task" data-id="${task.id}">Approve</button><button class="internship-btn secondary request-changes" data-id="${task.id}">Request changes</button></div></article>`).join('')||'<div class="internship-empty">No submissions are awaiting review.</div>'}</div></section>`;
}

function renderInterns(data){
  const uid = auth.currentUser?.uid;
  const items = (canManagePeople()||has('internships.manage')) ? data.enrollments : data.enrollments.filter(item=>item.supervisorUid===uid);
  return `<section class="internship-section"><div class="internship-section-head"><div><p>PEOPLE</p><h2>Internship enrollments</h2></div>${canAssign()?'<button class="internship-btn" id="newEnrollment">+ Enroll intern</button>':''}</div><div class="internship-grid">${items.map(item=>`<article class="internship-card"><div class="internship-card-head">${badge(item.status||'ACTIVE')}<strong>${esc(item.standing||'On Track')}</strong></div><h3>${esc(item.internName||'Unnamed intern')}</h3><p>${esc(item.programTitle||'Internship Program')}</p><div class="internship-meta"><span>${esc(item.supervisorName||'No supervisor')}</span><span>${dateText(item.expectedCompletionDate)}</span></div></article>`).join('')||'<div class="internship-empty">No internship enrollments exist yet.</div>'}</div></section>`;
}

function renderPrograms(data){
  return `<section class="internship-section"><div class="internship-section-head"><div><p>PROGRAM DESIGN</p><h2>Internship programs</h2></div><button class="internship-btn" id="newProgram">+ New program</button></div><div class="internship-grid">${data.programs.map(program=>`<article class="internship-card"><div class="internship-card-head">${badge(program.status||'DRAFT')}<strong>v${esc(program.version||'1.0')}</strong></div><h3>${esc(program.title||'Untitled program')}</h3><p>${esc(program.description||'No description provided.')}</p><div class="internship-meta"><span>${esc(program.departmentName||'General')}</span><span>${Number(program.durationWeeks||0)} weeks</span></div></article>`).join('')||'<div class="internship-empty">Create your first internship program.</div>'}</div></section>`;
}

function renderReports(data){
  const active = data.enrollments.filter(i=>i.status==='ACTIVE').length;
  const completed = data.enrollments.filter(i=>i.status==='COMPLETED').length;
  const overdue = data.tasks.filter(t=>t.dueDate?.toDate && t.dueDate.toDate()<new Date() && !['APPROVED','WAIVED'].includes(t.status)).length;
  return `<section class="internship-section"><div class="internship-section-head"><div><p>REPORTING</p><h2>Internship reports</h2></div></div><div class="internship-stats report"><article><strong>${active}</strong><span>Active interns</span></article><article><strong>${completed}</strong><span>Completed</span></article><article><strong>${overdue}</strong><span>Overdue tasks</span></article><article><strong>${data.submissions.length}</strong><span>Total submissions</span></article></div></section>`;
}

function bindActions(data){
  document.querySelectorAll('[data-internship-tab]').forEach(button=>button.onclick=()=>openCenter(button.dataset.internshipTab));
  document.querySelectorAll('.submit-task').forEach(button=>button.onclick=()=>submitTask(button.dataset.id));
  document.querySelectorAll('.approve-task').forEach(button=>button.onclick=()=>reviewTask(button.dataset.id,'APPROVED'));
  document.querySelectorAll('.request-changes').forEach(button=>button.onclick=()=>reviewTask(button.dataset.id,'CHANGES_REQUESTED'));
  document.getElementById('newProgram')?.addEventListener('click',createProgram);
  document.getElementById('newEnrollment')?.addEventListener('click',()=>alert('Enrollment builder is ready for the next enhancement pass.'));
}

async function submitTask(id){
  const text = prompt('Enter your completed work, notes, or evidence link:');
  if (!text?.trim()) return;
  await addDoc(collection(db,'internshipTaskSubmissions'),{ taskId:id, internUid:auth.currentUser.uid, responseText:text.trim(), status:'SUBMITTED', submittedAt:serverTimestamp() });
  await updateDoc(doc(db,'internshipTasks',id),{ status:'SUBMITTED', latestSubmissionText:text.trim(), submittedAt:serverTimestamp(), updatedAt:serverTimestamp() });
  cache=null; await openCenter('tasks');
}

async function reviewTask(id,status){
  const notes = prompt(status==='APPROVED'?'Approval feedback:':'Describe the required changes:');
  if (notes===null) return;
  await updateDoc(doc(db,'internshipTasks',id),{ status, supervisorFeedback:notes.trim(), reviewedBy:auth.currentUser.uid, reviewedAt:serverTimestamp(), updatedAt:serverTimestamp() });
  cache=null; await openCenter('review-queue');
}

async function createProgram(){
  const title = prompt('Program title:');
  if (!title?.trim()) return;
  const description = prompt('Program description:') || '';
  await addDoc(collection(db,'internshipPrograms'),{ title:title.trim(), description:description.trim(), status:'DRAFT', version:'1.0', durationWeeks:6, createdBy:auth.currentUser.uid, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  cache=null; await openCenter('programs');
}

const observer = new MutationObserver(navButton);
observer.observe(document.getElementById('app'),{childList:true,subtree:true});

onAuthStateChanged(auth,async user=>{
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db,'portalAccounts',user.uid));
  account = snapshot.exists()?snapshot.data():null;
  navButton();
});