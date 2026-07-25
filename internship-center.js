import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc,
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
const canAssign = () => has('internships.assign') || has('internships.manage_people');
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
const dateValue = date => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;

function toast(message, type = 'success') {
  let stack = document.querySelector('.internship-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'internship-toast-stack';
    document.body.appendChild(stack);
  }
  const item = document.createElement('div');
  item.className = `internship-toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  item.innerHTML = `<span class="internship-toast-icon">${icon}</span><div><strong>${type === 'success' ? 'Success' : type === 'error' ? 'Something went wrong' : 'Notice'}</strong><p>${esc(message)}</p></div><button type="button" aria-label="Dismiss">×</button>`;
  stack.appendChild(item);
  const dismiss = () => {
    item.classList.add('leaving');
    window.setTimeout(() => item.remove(), 180);
  };
  item.querySelector('button').onclick = dismiss;
  window.setTimeout(dismiss, 4200);
}

function openModal({ eyebrow = 'INTERNSHIP CENTER', title, description = '', body = '', submitLabel = 'Save', cancelLabel = 'Cancel', size = 'medium', destructive = false, onSubmit }) {
  const overlay = document.createElement('div');
  overlay.className = 'internship-modal-overlay';
  overlay.innerHTML = `<div class="internship-modal internship-modal-${size}" role="dialog" aria-modal="true" aria-labelledby="internshipModalTitle">
    <form class="internship-modal-form">
      <header class="internship-modal-header">
        <div class="internship-modal-mark">🎓</div>
        <div class="internship-modal-heading"><p>${esc(eyebrow)}</p><h2 id="internshipModalTitle">${esc(title)}</h2>${description ? `<span>${esc(description)}</span>` : ''}</div>
        <button class="internship-modal-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="internship-modal-body">${body}<div class="internship-modal-error" hidden></div></div>
      <footer class="internship-modal-footer"><button type="button" class="internship-modal-cancel">${esc(cancelLabel)}</button><button type="submit" class="internship-modal-submit ${destructive ? 'danger' : ''}"><span>${esc(submitLabel)}</span><i class="internship-spinner" aria-hidden="true"></i></button></footer>
    </form>
  </div>`;
  document.body.appendChild(overlay);
  const form = overlay.querySelector('form');
  const closeButton = overlay.querySelector('.internship-modal-close');
  const cancelButton = overlay.querySelector('.internship-modal-cancel');
  const submitButton = overlay.querySelector('.internship-modal-submit');
  const errorBox = overlay.querySelector('.internship-modal-error');
  const close = () => {
    overlay.classList.add('closing');
    document.removeEventListener('keydown', keyHandler);
    window.setTimeout(() => overlay.remove(), 180);
  };
  const keyHandler = event => {
    if (event.key === 'Escape' && !submitButton.disabled) close();
  };
  closeButton.onclick = close;
  cancelButton.onclick = close;
  overlay.addEventListener('mousedown', event => {
    if (event.target === overlay && !submitButton.disabled) close();
  });
  document.addEventListener('keydown', keyHandler);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.hidden = true;
    submitButton.disabled = true;
    submitButton.classList.add('loading');
    try {
      await onSubmit?.(new FormData(form), form);
      close();
    } catch (error) {
      console.error(error);
      errorBox.textContent = error?.message || 'The request could not be completed. Please try again.';
      errorBox.hidden = false;
      submitButton.disabled = false;
      submitButton.classList.remove('loading');
    }
  });
  requestAnimationFrame(() => overlay.classList.add('open'));
  window.setTimeout(() => overlay.querySelector('input, select, textarea, button')?.focus(), 80);
  return { overlay, form, close };
}

function field(label, name, options = {}) {
  const { type = 'text', placeholder = '', required = false, value = '', help = '', min = '', max = '', rows = 4 } = options;
  const control = type === 'textarea'
    ? `<textarea id="im-${name}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}" ${required?'required':''}>${esc(value)}</textarea>`
    : `<input id="im-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required?'required':''} ${min!==''?`min="${esc(min)}"`:''} ${max!==''?`max="${esc(max)}"`:''}>`;
  return `<label class="internship-field" for="im-${name}"><span>${esc(label)}${required?'<b>Required</b>':''}</span>${control}${help?`<small>${esc(help)}</small>`:''}</label>`;
}

function selectField(label, name, options, config = {}) {
  const { required = false, placeholder = 'Select an option', help = '' } = config;
  return `<label class="internship-field" for="im-${name}"><span>${esc(label)}${required?'<b>Required</b>':''}</span><div class="internship-select-wrap"><select id="im-${name}" name="${name}" ${required?'required':''}><option value="">${esc(placeholder)}</option>${options.map(item=>`<option value="${esc(item.value)}">${esc(item.label)}</option>`).join('')}</select></div>${help?`<small>${esc(help)}</small>`:''}</label>`;
}

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
  return `<section class="internship-section"><div class="internship-section-head"><div><p>SUPERVISOR WORK</p><h2>Review queue</h2></div></div><div class="internship-grid">${tasks.map(task=>`<article class="internship-card"><div class="internship-card-head">${badge(task.status)}<strong>${esc(task.internName||'Intern')}</strong></div><h3>${esc(task.title)}</h3><p>${esc(task.latestSubmissionText||'Submission ready for review.')}</p><div class="internship-actions"><button class="internship-btn approve-task" data-id="${task.id}">Review submission</button></div></article>`).join('')||'<div class="internship-empty">No submissions are awaiting review.</div>'}</div></section>`;
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
  document.querySelectorAll('.submit-task').forEach(button=>button.onclick=()=>submitTask(button.dataset.id, data));
  document.querySelectorAll('.approve-task').forEach(button=>button.onclick=()=>reviewTask(button.dataset.id, data));
  document.getElementById('newProgram')?.addEventListener('click',()=>createProgram(data));
  document.getElementById('newEnrollment')?.addEventListener('click',()=>createEnrollment(data));
}

async function submitTask(id, data){
  const task = data.tasks.find(item=>item.id===id);
  openModal({
    eyebrow:'TASK SUBMISSION',
    title:task?.title || 'Submit internship work',
    description:'Add your completed work, notes, or an evidence link. Your submission will be preserved in the task history.',
    submitLabel:'Submit work',
    body:`<div class="internship-modal-summary"><span>Assignment</span><strong>${esc(task?.title||'Internship Task')}</strong><p>${esc(task?.description||'No additional instructions were provided.')}</p></div>${field('Work, notes, or evidence','responseText',{type:'textarea',rows:7,required:true,placeholder:'Describe what you completed, include relevant details, or paste an evidence link…',help:'Be specific enough for your supervisor to review your work.'})}`,
    onSubmit:async formData=>{
      const text=String(formData.get('responseText')||'').trim();
      if(!text) throw new Error('Please enter your completed work or evidence.');
      await addDoc(collection(db,'internshipTaskSubmissions'),{ taskId:id, internUid:auth.currentUser.uid, responseText:text, status:'SUBMITTED', submittedAt:serverTimestamp() });
      await updateDoc(doc(db,'internshipTasks',id),{ status:'SUBMITTED', latestSubmissionText:text, submittedAt:serverTimestamp(), updatedAt:serverTimestamp() });
      cache=null;
      await openCenter('tasks');
      toast('Your work was submitted for supervisor review.');
    }
  });
}

async function reviewTask(id, data){
  const task = data.tasks.find(item=>item.id===id);
  openModal({
    eyebrow:'SUPERVISOR REVIEW',
    title:'Review submission',
    description:'Evaluate the intern’s work, record feedback, and choose the next status.',
    submitLabel:'Save review',
    size:'large',
    body:`<div class="internship-review-layout"><div class="internship-modal-summary"><span>${esc(task?.internName||'Intern')}</span><strong>${esc(task?.title||'Internship Task')}</strong><p class="internship-submission-copy">${esc(task?.latestSubmissionText||'No submission text was provided.')}</p></div><div class="internship-form-grid two">${selectField('Decision','status',[{value:'APPROVED',label:'Approve submission'},{value:'CHANGES_REQUESTED',label:'Request changes'},{value:'REJECTED',label:'Reject submission'}],{required:true,placeholder:'Choose a decision'})}${field('Score','score',{type:'number',min:0,max:100,placeholder:'Optional'})}</div>${field('Supervisor feedback','feedback',{type:'textarea',rows:5,required:true,placeholder:'Give clear, useful feedback for the intern…'})}</div>`,
    onSubmit:async formData=>{
      const status=String(formData.get('status')||'');
      const feedback=String(formData.get('feedback')||'').trim();
      const scoreRaw=String(formData.get('score')||'').trim();
      if(!status) throw new Error('Choose a review decision.');
      if(!feedback) throw new Error('Please provide supervisor feedback.');
      const update={ status, supervisorFeedback:feedback, reviewedBy:auth.currentUser.uid, reviewedAt:serverTimestamp(), updatedAt:serverTimestamp() };
      if(scoreRaw!=='') update.score=Number(scoreRaw);
      await updateDoc(doc(db,'internshipTasks',id),update);
      cache=null;
      await openCenter('review-queue');
      toast(status==='APPROVED'?'The submission was approved.':'The review was saved and the intern will see your feedback.');
    }
  });
}

async function createProgram(data){
  const departments = [...new Set(data.staff.map(item=>item.departmentName||item.department).filter(Boolean))].sort();
  openModal({
    eyebrow:'PROGRAM DESIGN',
    title:'Create internship program',
    description:'Build the foundation for a structured internship experience. You can expand phases and tasks afterward.',
    submitLabel:'Create program',
    size:'large',
    body:`<div class="internship-form-grid two">${field('Program title','title',{required:true,placeholder:'Public Relations Internship'})}${field('Program code','code',{placeholder:'PR-INT-2026',help:'Optional internal reference code.'})}</div>${field('Program description','description',{type:'textarea',rows:5,required:true,placeholder:'Describe the purpose, learning goals, and expected outcome of this internship…'})}<div class="internship-form-grid two">${departments.length?selectField('Department','departmentName',departments.map(name=>({value:name,label:name})),{placeholder:'General / organization-wide'}):field('Department','departmentName',{placeholder:'Public Relations'})}${field('Duration','durationWeeks',{type:'number',value:'6',min:1,max:52,required:true,help:'Length in weeks.'})}</div><div class="internship-form-grid two">${selectField('Initial status','status',[{value:'DRAFT',label:'Draft — still being designed'},{value:'ACTIVE',label:'Active — available for enrollment'}],{required:true,placeholder:'Choose status'})}${field('Version','version',{value:'1.0',required:true})}</div>`,
    onSubmit:async formData=>{
      const title=String(formData.get('title')||'').trim();
      const description=String(formData.get('description')||'').trim();
      if(!title||!description) throw new Error('Program title and description are required.');
      await addDoc(collection(db,'internshipPrograms'),{
        title,
        code:String(formData.get('code')||'').trim(),
        description,
        departmentName:String(formData.get('departmentName')||'General').trim()||'General',
        status:String(formData.get('status')||'DRAFT'),
        version:String(formData.get('version')||'1.0').trim()||'1.0',
        durationWeeks:Number(formData.get('durationWeeks')||6),
        createdBy:auth.currentUser.uid,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
      cache=null;
      await openCenter('programs');
      toast(`“${title}” was created successfully.`);
    }
  });
}

async function createEnrollment(data){
  const activeAccounts = data.accounts
    .filter(item=>String(item.portalStatus||'ACTIVE').toUpperCase()==='ACTIVE')
    .sort((a,b)=>String(a.displayName||a.portalUsername||'').localeCompare(String(b.displayName||b.portalUsername||'')));
  const programs = data.programs.filter(item=>item.status==='ACTIVE');
  const programOptions = (programs.length?programs:data.programs).map(item=>({value:item.id,label:`${item.title||'Untitled program'}${item.status!=='ACTIVE'?` (${item.status||'DRAFT'})`:''}`}));
  const personOptions = activeAccounts.map(item=>({value:item.id,label:item.displayName||item.portalUsername||item.id}));
  const supervisorOptions = activeAccounts.filter(item=>{
    const permissions=item.permissions||[];
    const roles=item.systemRoles||[];
    return permissions.includes('*')||permissions.includes('internships.supervise')||permissions.includes('internships.manage')||roles.includes('SYSTEM_OWNER')||roles.includes('SYSTEM_ADMINISTRATOR');
  }).map(item=>({value:item.id,label:item.displayName||item.portalUsername||item.id}));
  const today=new Date();
  const defaultEnd=new Date(today);
  defaultEnd.setDate(defaultEnd.getDate()+42);
  openModal({
    eyebrow:'PEOPLE & ASSIGNMENTS',
    title:'Enroll an intern',
    description:'Connect an intern with a program and supervisor, then establish the official internship timeline.',
    submitLabel:'Enroll intern',
    size:'large',
    body:`${!programOptions.length?'<div class="internship-callout warning"><strong>No programs exist yet.</strong><span>Create a program before completing an enrollment.</span></div>':''}<div class="internship-form-grid two">${selectField('Intern','internUid',personOptions,{required:true,placeholder:'Select an intern'})}${selectField('Internship program','programId',programOptions,{required:true,placeholder:'Select a program'})}</div><div class="internship-form-grid two">${selectField('Supervisor','supervisorUid',supervisorOptions.length?supervisorOptions:personOptions,{required:true,placeholder:'Select a supervisor'})}${selectField('Standing','standing',[{value:'On Track',label:'On Track'},{value:'Monitor',label:'Monitor'},{value:'Attention Needed',label:'Attention Needed'}],{required:true,placeholder:'Choose standing'})}</div><div class="internship-form-grid two">${field('Start date','startDate',{type:'date',required:true,value:dateValue(today)})}${field('Expected completion','expectedCompletionDate',{type:'date',required:true,value:dateValue(defaultEnd)})}</div>${field('Coordinator notes','coordinatorNotes',{type:'textarea',rows:4,placeholder:'Add orientation details, accommodations, goals, or other internal context…'})}`,
    onSubmit:async formData=>{
      const internUid=String(formData.get('internUid')||'');
      const programId=String(formData.get('programId')||'');
      const supervisorUid=String(formData.get('supervisorUid')||'');
      const startDate=String(formData.get('startDate')||'');
      const expectedCompletionDate=String(formData.get('expectedCompletionDate')||'');
      const intern=activeAccounts.find(item=>item.id===internUid);
      const supervisor=activeAccounts.find(item=>item.id===supervisorUid);
      const program=data.programs.find(item=>item.id===programId);
      if(!intern||!supervisor||!program) throw new Error('Select a valid intern, program, and supervisor.');
      if(!startDate||!expectedCompletionDate) throw new Error('Start and expected completion dates are required.');
      if(new Date(`${expectedCompletionDate}T12:00:00`)<new Date(`${startDate}T12:00:00`)) throw new Error('Expected completion must be after the start date.');
      const duplicate=data.enrollments.some(item=>item.internUid===internUid&&!['COMPLETED','WITHDRAWN','CANCELLED','UNSUCCESSFUL'].includes(String(item.status||'').toUpperCase()));
      if(duplicate) throw new Error('This person already has an active internship enrollment.');
      await addDoc(collection(db,'internshipEnrollments'),{
        internUid,
        internName:intern.displayName||intern.portalUsername||'Intern',
        internUsername:intern.portalUsername||'',
        programId,
        programTitle:program.title||'Internship Program',
        programVersion:program.version||'1.0',
        departmentName:program.departmentName||'General',
        supervisorUid,
        supervisorName:supervisor.displayName||supervisor.portalUsername||'Supervisor',
        startDate:toTimestamp(startDate),
        expectedCompletionDate:toTimestamp(expectedCompletionDate),
        status:'ACTIVE',
        standing:String(formData.get('standing')||'On Track'),
        currentPhase:'Orientation',
        progress:0,
        coordinatorNotes:String(formData.get('coordinatorNotes')||'').trim(),
        createdBy:auth.currentUser.uid,
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
      cache=null;
      await openCenter('interns');
      toast(`${intern.displayName||intern.portalUsername} was enrolled in ${program.title}.`);
    }
  });
}

const observer = new MutationObserver(navButton);
observer.observe(document.getElementById('app'),{childList:true,subtree:true});

onAuthStateChanged(auth,async user=>{
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db,'portalAccounts',user.uid));
  account = snapshot.exists()?snapshot.data():null;
  navButton();
});