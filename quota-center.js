import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);
let account = null;
let currentTab = 'overview';
let cache = null;

const esc = value => String(value ?? '').replace(/[&<>\'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dateValue = value => {
  if (!value) return '—';
  if (value.toDate) return value.toDate().toLocaleDateString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString();
};
const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;
const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes(permission);
};
const canManage = () => has('quotas.manage');
const canReview = () => has('quotas.review') || canManage();

async function loadData(force = false) {
  if (cache && !force && Date.now() - cache.loadedAt < 15000) return cache;
  const names = ['quotaDefinitions','quotaPeriods','quotaSubmissions','quotaExemptions','staffProfiles'];
  const [definitions, periods, submissions, exemptions, staff] = await Promise.all(names.map(async name => {
    try {
      const snap = await getDocs(collection(db, name));
      return snap.docs.map(d => ({ id:d.id, ...d.data() }));
    } catch (error) {
      console.warn(`Unable to load ${name}`, error);
      return [];
    }
  }));
  cache = { definitions, periods, submissions, exemptions, staff, loadedAt: Date.now() };
  return cache;
}

function currentUserStaff(data) {
  const staffProfileId = account?.staffProfileId;
  return data.staff.find(s => s.id === staffProfileId)
    || data.staff.find(s => String(s.portalUid || s.userUid || '') === auth.currentUser?.uid)
    || { id: staffProfileId || '', displayName: account?.displayName || account?.portalUsername || 'Staff Member', organizationalRank: account?.organizationalRank || 'Staff' };
}

function activePeriods(data) {
  const now = Date.now();
  return data.periods.filter(p => {
    if (String(p.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    const end = p.endDate?.toDate?.()?.getTime() ?? new Date(p.endDate || '2999-01-01').getTime();
    return end >= now;
  });
}

function matchingDefinitions(data, staff) {
  return data.definitions.filter(d => {
    if (String(d.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    const target = String(d.targetType || 'ALL').toUpperCase();
    if (target === 'ALL') return true;
    if (target === 'INDIVIDUAL') return d.targetId === staff.id;
    if (target === 'RANK') return d.targetId === (staff.organizationalRank || staff.rankName);
    if (target === 'DEPARTMENT') return d.targetId === (staff.departmentName || staff.departmentId);
    if (target === 'TEAM') return d.targetId === (staff.teamName || staff.teamId);
    return false;
  });
}

function progressFor(data, periodId, definitionId, staffId) {
  return data.submissions
    .filter(s => s.quotaPeriodId === periodId && s.quotaDefinitionId === definitionId && s.staffProfileId === staffId && s.status === 'APPROVED')
    .reduce((sum, s) => sum + Number(s.approvedPoints ?? s.points ?? 0), 0);
}

function statCard(value, label) { return `<article class="quota-stat"><strong>${value}</strong><span>${label}</span></article>`; }

function navButton() {
  const sidebar = document.querySelector('#sidebar nav');
  if (!sidebar || sidebar.querySelector('[data-quota-center]')) return;
  const button = document.createElement('button');
  button.className = 'nav-item';
  button.dataset.quotaCenter = 'true';
  button.innerHTML = '<span>◉</span>Quota Center';
  const training = sidebar.querySelector('[data-view="training"]');
  if (training) sidebar.insertBefore(button, training); else sidebar.appendChild(button);
  button.onclick = () => openQuotaCenter();
}

async function openQuotaCenter(tab = currentTab) {
  currentTab = tab;
  const main = document.querySelector('.layout > main');
  if (!main) return;
  main.innerHTML = '<section class="quota-loading">Loading Quota Center…</section>';
  try {
    const data = await loadData();
    const staff = currentUserStaff(data);
    const pending = data.submissions.filter(s => s.status === 'PENDING').length;
    const approved = data.submissions.filter(s => s.status === 'APPROVED').length;
    const periods = activePeriods(data);
    main.innerHTML = `
      <div class="quota-center">
        <section class="quota-hero">
          <div class="quota-hero-top"><div><p>WORKFORCE ACCOUNTABILITY</p><h1>Quota Center</h1><span>Submit activity, review evidence, track progress, and manage requirements.</span></div>
          ${canManage() ? '<button class="quota-btn primary" id="newQuotaDefinition">+ New requirement</button>' : ''}</div>
          <div class="quota-stats">${statCard(periods.length,'Active periods')}${statCard(pending,'Pending reviews')}${statCard(approved,'Approved submissions')}${statCard(data.exemptions.filter(e=>e.status==='ACTIVE').length,'Active exemptions')}</div>
        </section>
        <nav class="quota-tabs">
          ${tabButton('overview','My Quota')}
          ${tabButton('submissions','My Submissions')}
          ${canReview() ? tabButton('review','Review Queue') : ''}
          ${canManage() ? tabButton('manage','Requirements') : ''}
          ${canManage() ? tabButton('exemptions','Exemptions') : ''}
        </nav>
        <section class="quota-view" id="quotaView">${renderTab(data, staff)}</section>
      </div>`;
    bindActions(data, staff);
  } catch (error) {
    console.error(error);
    main.innerHTML = `<section class="panel"><h1>Quota Center</h1><p class="error">Unable to load the Quota Center: ${esc(error.code || error.message)}</p></section>`;
  }
}

function tabButton(id, label) { return `<button class="quota-tab ${currentTab===id?'active':''}" data-quota-tab="${id}">${label}</button>`; }

function renderTab(data, staff) {
  if (currentTab === 'submissions') return renderMySubmissions(data, staff);
  if (currentTab === 'review') return renderReview(data);
  if (currentTab === 'manage') return renderManage(data);
  if (currentTab === 'exemptions') return renderExemptions(data);
  return renderOverview(data, staff);
}

function renderOverview(data, staff) {
  const defs = matchingDefinitions(data, staff);
  const periods = activePeriods(data);
  const items = [];
  periods.forEach(period => {
    const periodDefs = defs.filter(d => !period.quotaDefinitionId || period.quotaDefinitionId === d.id);
    periodDefs.forEach(def => {
      const required = Number(period.requiredAmount ?? def.requiredAmount ?? 0);
      const progress = progressFor(data, period.id, def.id, staff.id);
      const percent = required > 0 ? Math.min(100, Math.round(progress / required * 100)) : 0;
      const exemption = data.exemptions.find(e => e.staffProfileId === staff.id && e.quotaPeriodId === period.id && e.status === 'ACTIVE');
      items.push(`<article class="quota-card"><div class="quota-card-head"><span class="quota-badge ${exemption?'closed':''}">${exemption?'EXEMPT':percent>=100?'COMPLETE':'IN PROGRESS'}</span><strong>${percent}%</strong></div><h3>${esc(period.title || def.title || 'Quota')}</h3><p>${esc(def.description || 'Complete the assigned activity requirement before the deadline.')}</p><div class="quota-meta"><div><span>Progress</span><strong>${progress} / ${required} ${esc(def.measurementType || 'points')}</strong></div><div><span>Due</span><strong>${dateValue(period.endDate)}</strong></div></div><div class="quota-progress"><i style="width:${percent}%"></i></div>${exemption?`<p class="quota-review-note">Exempt: ${esc(exemption.reason || 'Approved exemption')}</p>`:`<div class="quota-card-actions"><button class="quota-btn primary quota-submit" data-period="${period.id}" data-definition="${def.id}">Submit activity</button></div>`}</article>`);
    });
  });
  return `<section class="quota-section"><div class="quota-section-head"><div><p>MY QUOTA</p><h2>${esc(staff.displayName || 'Your requirements')}</h2></div></div><div class="quota-grid">${items.join('') || '<div class="quota-empty">No active quota has been assigned to your rank, department, team, or account.</div>'}</div></section>`;
}

function renderMySubmissions(data, staff) {
  const rows = data.submissions.filter(s => s.staffProfileId === staff.id || s.submittedBy === auth.currentUser.uid).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  return `<section class="quota-section"><div class="quota-section-head"><div><p>HISTORY</p><h2>My submissions</h2></div></div><div class="quota-grid">${rows.map(submissionCard).join('') || '<div class="quota-empty">You have not submitted any quota activity yet.</div>'}</div></section>`;
}

function submissionCard(s) {
  const status = String(s.status || 'PENDING').toUpperCase();
  return `<article class="quota-card"><div class="quota-card-head"><span class="quota-badge ${status==='PENDING'?'pending':status==='DENIED'?'denied':''}">${esc(status)}</span><strong>${Number(s.approvedPoints ?? s.points ?? 0)} pts</strong></div><h3>${esc(s.activityType || s.description || 'Quota activity')}</h3><p>${esc(s.description || 'No description provided.')}</p><div class="quota-meta"><div><span>Activity date</span><strong>${dateValue(s.activityDate)}</strong></div><div><span>Submitted</span><strong>${dateValue(s.createdAt)}</strong></div></div>${s.proofUrl?`<a class="quota-proof" href="${esc(s.proofUrl)}" target="_blank" rel="noopener">Open proof ↗</a>`:''}${s.reviewerNotes?`<p class="quota-review-note">${esc(s.reviewerNotes)}</p>`:''}</article>`;
}

function renderReview(data) {
  const pending = data.submissions.filter(s => s.status === 'PENDING');
  return `<section class="quota-section"><div class="quota-section-head"><div><p>MANAGER REVIEW</p><h2>Pending submissions</h2></div><span>${pending.length} awaiting review</span></div><div class="quota-grid">${pending.map(s=>`<article class="quota-card"><div class="quota-card-head"><span class="quota-badge pending">PENDING</span><strong>${Number(s.points||0)} claimed</strong></div><h3>${esc(s.staffName || s.staffProfileId || 'Staff member')}</h3><p><strong>${esc(s.activityType || 'Activity')}</strong><br>${esc(s.description || '')}</p><div class="quota-meta"><div><span>Activity date</span><strong>${dateValue(s.activityDate)}</strong></div><div><span>Submitted</span><strong>${dateValue(s.createdAt)}</strong></div></div>${s.proofUrl?`<a class="quota-proof" href="${esc(s.proofUrl)}" target="_blank" rel="noopener">Open proof ↗</a>`:''}<div class="quota-card-actions"><button class="quota-btn quota-review" data-id="${s.id}" data-result="APPROVED">Approve</button><button class="quota-btn danger quota-review" data-id="${s.id}" data-result="DENIED">Deny</button></div></article>`).join('') || '<div class="quota-empty">There are no pending submissions.</div>'}</div></section>`;
}

function renderManage(data) {
  return `<section class="quota-section"><div class="quota-section-head"><div><p>ADMINISTRATION</p><h2>Quota requirements</h2></div><button class="quota-btn primary" id="newDefinitionInline">+ New requirement</button></div><div class="quota-grid">${data.definitions.map(d=>`<article class="quota-card"><div class="quota-card-head"><span class="quota-badge ${d.status==='ARCHIVED'?'closed':''}">${esc(d.status||'ACTIVE')}</span><strong>${Number(d.requiredAmount||0)} ${esc(d.measurementType||'points')}</strong></div><h3>${esc(d.title||'Untitled quota')}</h3><p>${esc(d.description||'')}</p><div class="quota-meta"><div><span>Frequency</span><strong>${esc(d.frequency||'MONTHLY')}</strong></div><div><span>Target</span><strong>${esc(d.targetType||'ALL')} ${esc(d.targetId||'')}</strong></div></div><div class="quota-card-actions"><button class="quota-btn quota-edit-definition" data-id="${d.id}">Edit</button><button class="quota-btn primary quota-new-period" data-id="${d.id}">Create period</button><button class="quota-btn danger quota-delete-definition" data-id="${d.id}">Delete</button></div></article>`).join('') || '<div class="quota-empty">No quota requirements exist yet.</div>'}</div></section>`;
}

function renderExemptions(data) {
  return `<section class="quota-section"><div class="quota-section-head"><div><p>EXCEPTIONS</p><h2>Quota exemptions</h2></div><button class="quota-btn primary" id="newExemption">+ Add exemption</button></div><div class="quota-grid">${data.exemptions.map(e=>`<article class="quota-card"><div class="quota-card-head"><span class="quota-badge ${e.status!=='ACTIVE'?'closed':''}">${esc(e.status||'ACTIVE')}</span></div><h3>${esc(e.staffName||e.staffProfileId||'Staff member')}</h3><p>${esc(e.reason||'No reason entered.')}</p><div class="quota-meta"><div><span>Starts</span><strong>${dateValue(e.startDate)}</strong></div><div><span>Ends</span><strong>${dateValue(e.endDate)}</strong></div></div><div class="quota-card-actions"><button class="quota-btn danger quota-delete-exemption" data-id="${e.id}">Delete</button></div></article>`).join('') || '<div class="quota-empty">No exemptions have been recorded.</div>'}</div></section>`;
}

function bindActions(data, staff) {
  document.querySelectorAll('[data-quota-tab]').forEach(b=>b.onclick=()=>openQuotaCenter(b.dataset.quotaTab));
  document.getElementById('newQuotaDefinition')?.addEventListener('click',()=>definitionModal());
  document.getElementById('newDefinitionInline')?.addEventListener('click',()=>definitionModal());
  document.getElementById('newExemption')?.addEventListener('click',()=>exemptionModal(data));
  document.querySelectorAll('.quota-submit').forEach(b=>b.onclick=()=>submissionModal(data, staff, b.dataset.period, b.dataset.definition));
  document.querySelectorAll('.quota-review').forEach(b=>b.onclick=()=>reviewModal(data.submissions.find(s=>s.id===b.dataset.id), b.dataset.result));
  document.querySelectorAll('.quota-edit-definition').forEach(b=>b.onclick=()=>definitionModal(data.definitions.find(d=>d.id===b.dataset.id)));
  document.querySelectorAll('.quota-new-period').forEach(b=>b.onclick=()=>periodModal(data.definitions.find(d=>d.id===b.dataset.id)));
  document.querySelectorAll('.quota-delete-definition').forEach(b=>b.onclick=()=>removeDoc('quotaDefinitions',b.dataset.id,'quota requirement'));
  document.querySelectorAll('.quota-delete-exemption').forEach(b=>b.onclick=()=>removeDoc('quotaExemptions',b.dataset.id,'quota exemption'));
}

function modal(title, body, onSubmit) {
  document.getElementById('quotaModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="quota-backdrop" id="quotaModal"><section class="quota-modal"><div class="quota-section-head"><div><p>QUOTA CENTER</p><h2>${esc(title)}</h2></div><button class="quota-btn" type="button" id="closeQuotaModal">×</button></div><form class="quota-form" id="quotaForm">${body}<div class="quota-modal-actions"><button class="quota-btn" type="button" id="cancelQuotaModal">Cancel</button><button class="quota-btn primary" type="submit">Save</button></div></form></section></div>`);
  const close=()=>document.getElementById('quotaModal')?.remove();
  document.getElementById('closeQuotaModal').onclick=close;
  document.getElementById('cancelQuotaModal').onclick=close;
  document.getElementById('quotaForm').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;btn.textContent='Saving…';try{await onSubmit(new FormData(e.currentTarget));cache=null;close();await openQuotaCenter(currentTab);}catch(error){console.error(error);alert(`Unable to save: ${error.code||error.message}`);btn.disabled=false;btn.textContent='Save';}};
}

function submissionModal(data, staff, periodId, definitionId) {
  const period=data.periods.find(p=>p.id===periodId); const def=data.definitions.find(d=>d.id===definitionId);
  modal('Submit quota activity', `<label>Activity type<input name="activityType" required placeholder="Hosted session, report, outreach…"></label><label>Activity date<input name="activityDate" type="date" required></label><label>Points claimed<input name="points" type="number" min="0" step="1" required></label><label>Proof URL<input name="proofUrl" type="url" placeholder="https://..."></label><label class="full">Description<textarea name="description" required></textarea></label>`, async form=>{
    await addDoc(collection(db,'quotaSubmissions'),{quotaPeriodId:periodId,quotaDefinitionId:definitionId,quotaTitle:period?.title||def?.title||'Quota',staffProfileId:staff.id||'',staffName:staff.displayName||account.displayName,submittedBy:auth.currentUser.uid,activityType:String(form.get('activityType')).trim(),activityDate:toTimestamp(form.get('activityDate')),points:Number(form.get('points')),description:String(form.get('description')).trim(),proofUrl:String(form.get('proofUrl')||'').trim(),status:'PENDING',createdAt:serverTimestamp()});
  });
}

function reviewModal(submission, result) {
  modal(`${result==='APPROVED'?'Approve':'Deny'} submission`, `<label>Approved points<input name="approvedPoints" type="number" min="0" value="${result==='APPROVED'?Number(submission?.points||0):0}" required></label><label class="full">Reviewer notes<textarea name="reviewerNotes" ${result==='DENIED'?'required':''}></textarea></label>`, async form=>{
    await updateDoc(doc(db,'quotaSubmissions',submission.id),{status:result,approvedPoints:Number(form.get('approvedPoints')),reviewerNotes:String(form.get('reviewerNotes')||'').trim(),reviewedBy:auth.currentUser.uid,reviewedAt:serverTimestamp()});
  });
}

function definitionModal(def={}) {
  modal(def.id?'Edit quota requirement':'Create quota requirement', `<label>Title<input name="title" value="${esc(def.title||'')}" required></label><label>Measurement<select name="measurementType"><option>points</option><option>activities</option><option>hours</option><option>sessions</option><option>reports</option></select></label><label>Required amount<input name="requiredAmount" type="number" min="1" value="${Number(def.requiredAmount||1)}" required></label><label>Frequency<select name="frequency"><option>WEEKLY</option><option>MONTHLY</option><option>QUARTERLY</option><option>ONE_TIME</option></select></label><label>Target type<select name="targetType"><option>ALL</option><option>RANK</option><option>DEPARTMENT</option><option>TEAM</option><option>INDIVIDUAL</option></select></label><label>Target ID or name<input name="targetId" value="${esc(def.targetId||'')}"></label><label>Status<select name="status"><option>ACTIVE</option><option>ARCHIVED</option></select></label><label class="full">Description<textarea name="description">${esc(def.description||'')}</textarea></label>`, async form=>{
    const payload={title:String(form.get('title')).trim(),measurementType:String(form.get('measurementType')),requiredAmount:Number(form.get('requiredAmount')),frequency:String(form.get('frequency')),targetType:String(form.get('targetType')),targetId:String(form.get('targetId')||'').trim(),status:String(form.get('status')),description:String(form.get('description')||'').trim(),updatedBy:auth.currentUser.uid,updatedAt:serverTimestamp()};
    if(def.id) await updateDoc(doc(db,'quotaDefinitions',def.id),payload); else await addDoc(collection(db,'quotaDefinitions'),{...payload,createdBy:auth.currentUser.uid,createdAt:serverTimestamp()});
  });
}

function periodModal(def) {
  modal('Create quota period', `<label>Period title<input name="title" value="${esc(def.title||'Quota')}" required></label><label>Required amount<input name="requiredAmount" type="number" min="1" value="${Number(def.requiredAmount||1)}" required></label><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date" required></label>`, async form=>{
    await addDoc(collection(db,'quotaPeriods'),{quotaDefinitionId:def.id,title:String(form.get('title')).trim(),requiredAmount:Number(form.get('requiredAmount')),startDate:toTimestamp(form.get('startDate')),endDate:toTimestamp(form.get('endDate')),status:'ACTIVE',createdBy:auth.currentUser.uid,createdAt:serverTimestamp()});
  });
}

function exemptionModal(data) {
  const staffOptions=data.staff.map(s=>`<option value="${s.id}">${esc(s.displayName||s.robloxUsername||s.id)}</option>`).join('');
  const periodOptions=data.periods.map(p=>`<option value="${p.id}">${esc(p.title||p.id)}</option>`).join('');
  modal('Add quota exemption', `<label>Staff member<select name="staffProfileId" required>${staffOptions}</select></label><label>Quota period<select name="quotaPeriodId" required>${periodOptions}</select></label><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date" required></label><label class="full">Reason<textarea name="reason" required></textarea></label>`, async form=>{
    const staff=data.staff.find(s=>s.id===form.get('staffProfileId'));
    await addDoc(collection(db,'quotaExemptions'),{staffProfileId:String(form.get('staffProfileId')),staffName:staff?.displayName||staff?.robloxUsername||'',quotaPeriodId:String(form.get('quotaPeriodId')),startDate:toTimestamp(form.get('startDate')),endDate:toTimestamp(form.get('endDate')),reason:String(form.get('reason')).trim(),status:'ACTIVE',approvedBy:auth.currentUser.uid,approvedAt:serverTimestamp()});
  });
}

async function removeDoc(collectionName,id,label) {
  if(!confirm(`Permanently delete this ${label}?`)) return;
  try{await deleteDoc(doc(db,collectionName,id));cache=null;await openQuotaCenter(currentTab);}catch(error){console.error(error);alert(`Unable to delete: ${error.code||error.message}`);}
}

let navTimer;
function scheduleNav(){clearTimeout(navTimer);navTimer=setTimeout(navButton,80);}
new MutationObserver(scheduleNav).observe(document.getElementById('app'),{childList:true,subtree:true});
onAuthStateChanged(auth,async user=>{if(!user||user.isAnonymous)return;try{const snap=await getDoc(doc(db,'portalAccounts',user.uid));account=snap.exists()?snap.data():null;scheduleNav();}catch(error){console.error('Unable to initialize Quota Center',error);}});
