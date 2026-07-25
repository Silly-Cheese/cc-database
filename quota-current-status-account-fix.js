import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let running = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toDate = value => value?.toDate ? value.toDate() : new Date(value);
const dateText = value => {
  if (!value) return '—';
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
};
const statusLabel = status => String(status || '').replaceAll('_',' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
const statusClass = status => String(status || '').toLowerCase().replaceAll('_','-');

function activePeriods(periods) {
  const now = Date.now();
  return periods.filter(period => {
    if (String(period.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    const start = period.startDate ? toDate(period.startDate).getTime() : 0;
    const end = period.endDate ? toDate(period.endDate).getTime() : new Date('2999-01-01').getTime();
    return start <= now && end >= now;
  });
}

function rowMarkup(row) {
  return `<tr data-search="${esc(`${row.staffName} ${row.department} ${row.rank} ${row.periodTitle} ${row.definitionTitle}`.toLowerCase())}" data-department="${esc(row.department)}" data-period="${esc(row.periodId)}" data-status="${esc(row.status)}" data-percent="${row.percent}" data-remaining="${row.remaining}" data-due="${row.dueTime}">
    <td><div class="quota-status-person"><strong>${esc(row.staffName)}</strong><span>${esc(row.rank)}</span></div></td>
    <td>${esc(row.department)}</td>
    <td><div class="quota-status-quota"><strong>${esc(row.periodTitle)}</strong><span>${esc(row.definitionTitle)}</span></div></td>
    <td><div class="quota-status-progress"><div><strong>${row.approved}</strong><span>/ ${row.required} ${esc(row.measurementType)}</span></div><div class="quota-progress"><i style="width:${row.percent}%"></i></div><small>${row.percent}% approved</small></div></td>
    <td>${row.required}</td><td>${row.remaining}</td><td>${row.pending}</td><td>${dateText(row.dueDate)}</td>
    <td><span class="quota-badge quota-status-${statusClass(row.status)}">${esc(statusLabel(row.status))}</span></td>
  </tr>`;
}

async function repairCurrentStatus() {
  const section = document.querySelector('.quota-current-status-section');
  if (!section || running || !auth.currentUser) return;
  const body = section.querySelector('#quotaStatusRows');
  if (!body) return;
  running = true;
  try {
    const [defSnap, periodSnap, submissionSnap, accountSnap] = await Promise.all([
      getDocs(collection(db,'quotaDefinitions')),
      getDocs(collection(db,'quotaPeriods')),
      getDocs(collection(db,'quotaSubmissions')),
      getDocs(collection(db,'portalAccounts')),
    ]);
    const definitions = defSnap.docs.map(d => ({id:d.id,...d.data()})).filter(d => String(d.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Array.isArray(d.assignedUserUids) && d.assignedUserUids.length);
    const periods = activePeriods(periodSnap.docs.map(d => ({id:d.id,...d.data()})));
    const submissions = submissionSnap.docs.map(d => ({id:d.id,...d.data()}));
    const accounts = accountSnap.docs.map(d => ({id:d.id,...d.data()})).filter(a => String(a.portalStatus || 'ACTIVE').toUpperCase() === 'ACTIVE');
    const rows = [];
    for (const definition of definitions) {
      for (const uid of definition.assignedUserUids) {
        const account = accounts.find(a => a.id === uid);
        if (!account) continue;
        for (const period of periods.filter(p => !p.quotaDefinitionId || p.quotaDefinitionId === definition.id)) {
          const required = Number(period.requiredAmount ?? definition.requiredAmount ?? 0);
          const related = submissions.filter(s => s.quotaDefinitionId === definition.id && s.quotaPeriodId === period.id && (s.submittedBy === uid || (account.staffProfileId && s.staffProfileId === account.staffProfileId)));
          const approved = related.filter(s => String(s.status || '').toUpperCase() === 'APPROVED').reduce((sum,s) => sum + Number(s.approvedPoints ?? s.points ?? 0),0);
          const pending = related.filter(s => String(s.status || '').toUpperCase() === 'PENDING').reduce((sum,s) => sum + Number(s.points ?? 0),0);
          const percent = required > 0 ? Math.min(100, Math.round(approved / required * 100)) : 0;
          const status = percent >= 100 ? 'COMPLETE' : approved <= 0 && pending <= 0 ? 'NOT_STARTED' : percent >= 75 ? 'NEAR_COMPLETE' : 'IN_PROGRESS';
          rows.push({staffName:account.displayName || account.portalUsername || 'Unnamed account',department:account.departmentName || account.department || 'Unassigned',rank:account.organizationalRank || account.rankName || 'Staff',periodId:period.id,periodTitle:period.title || definition.title || 'Current quota',definitionTitle:definition.title || 'Quota requirement',measurementType:definition.measurementType || 'points',required,approved,pending,remaining:Math.max(0,required-approved),percent,status,dueDate:period.endDate,dueTime:period.endDate ? toDate(period.endDate).getTime() : new Date('2999-01-01').getTime()});
        }
      }
    }
    if (!rows.length) return;
    body.innerHTML = rows.sort((a,b) => a.staffName.localeCompare(b.staffName)).map(rowMarkup).join('');
    const count = section.querySelector('#quotaStatusCount');
    if (count) count.textContent = String(rows.length);
    const statValues = section.querySelectorAll('.quota-current-status-stats article strong');
    const totals = [rows.filter(r=>r.status==='COMPLETE').length,rows.filter(r=>['IN_PROGRESS','NEAR_COMPLETE'].includes(r.status)).length,rows.filter(r=>r.status==='NOT_STARTED').length,0];
    statValues.forEach((el,index) => { if (index < totals.length) el.textContent = String(totals[index]); });
    const departmentSelect = section.querySelector('#quotaStatusDepartment');
    if (departmentSelect) {
      const current = departmentSelect.value;
      departmentSelect.innerHTML = '<option value="">All departments</option>' + [...new Set(rows.map(r=>r.department))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
      departmentSelect.value = current;
    }
    const periodSelect = section.querySelector('#quotaStatusPeriod');
    if (periodSelect) {
      const current = periodSelect.value;
      periodSelect.innerHTML = '<option value="">All active periods</option>' + [...new Map(rows.map(r=>[r.periodId,r.periodTitle])).entries()].map(([id,title])=>`<option value="${esc(id)}">${esc(title)}</option>`).join('');
      periodSelect.value = current;
    }
  } catch (error) {
    console.error('Unable to repair account-assigned quota status.', error);
  } finally {
    running = false;
  }
}

new MutationObserver(() => repairCurrentStatus()).observe(document.getElementById('app') || document.body,{childList:true,subtree:true});
document.addEventListener('click', event => {
  if (event.target.closest('[data-quota-current-status], #quotaRefreshStatus')) setTimeout(repairCurrentStatus,250);
});
