import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const db = getFirestore(getApp());
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

async function getAll(name) {
  try {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn(`Unable to load ${name}`, error);
    return [];
  }
}

function activePeriods(periods) {
  const now = Date.now();
  return periods.filter(period => {
    if (String(period.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    const start = period.startDate?.toDate?.()?.getTime() ?? new Date(period.startDate || 0).getTime();
    const end = period.endDate?.toDate?.()?.getTime() ?? new Date(period.endDate || '2999-01-01').getTime();
    return start <= now && end >= now;
  });
}

function matches(def, staff) {
  if (String(def.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
  const type = String(def.targetType || 'ALL').toUpperCase();
  if (type === 'ALL') return true;
  if (type === 'INDIVIDUAL') return String(def.targetId || '') === String(staff.id || '');
  if (type === 'RANK') return String(def.targetId || '') === String(staff.organizationalRank || staff.rankName || '');
  if (type === 'DEPARTMENT') return String(def.targetId || '') === String(staff.departmentName || staff.departmentId || '');
  if (type === 'TEAM') return String(def.targetId || '') === String(staff.teamName || staff.teamId || '');
  return false;
}

function dateText(value) {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function buildRows(data) {
  const rows = [];
  activePeriods(data.periods).forEach(period => {
    data.staff.forEach(staff => {
      data.definitions.filter(def => matches(def, staff) && (!period.quotaDefinitionId || period.quotaDefinitionId === def.id)).forEach(def => {
        const approved = data.submissions.filter(s => s.quotaPeriodId === period.id && s.quotaDefinitionId === def.id && s.staffProfileId === staff.id && String(s.status).toUpperCase() === 'APPROVED').reduce((sum, s) => sum + Number(s.approvedPoints ?? s.points ?? 0), 0);
        const pending = data.submissions.filter(s => s.quotaPeriodId === period.id && s.quotaDefinitionId === def.id && s.staffProfileId === staff.id && String(s.status).toUpperCase() === 'PENDING').reduce((sum, s) => sum + Number(s.points ?? 0), 0);
        const required = Number(period.requiredAmount ?? def.requiredAmount ?? 0);
        const exemption = data.exemptions.find(e => e.staffProfileId === staff.id && e.quotaPeriodId === period.id && String(e.status || '').toUpperCase() === 'ACTIVE');
        const percent = required > 0 ? Math.min(100, Math.round(approved / required * 100)) : 0;
        const status = exemption ? 'EXEMPT' : percent >= 100 ? 'COMPLETE' : approved <= 0 && pending <= 0 ? 'NOT_STARTED' : percent >= 75 ? 'NEAR_COMPLETE' : 'IN_PROGRESS';
        rows.push({
          name: staff.displayName || staff.robloxUsername || staff.portalUsername || 'Unnamed staff member',
          department: staff.departmentName || staff.departmentId || 'Unassigned',
          rank: staff.organizationalRank || staff.rankName || 'Staff',
          quota: period.title || def.title || 'Current quota',
          approved, pending, required, remaining: Math.max(0, required - approved), percent, status,
          due: period.endDate
        });
      });
    });
  });
  return rows.sort((a,b) => a.name.localeCompare(b.name));
}

function renderRows(rows) {
  return rows.map(row => `<tr data-search="${esc(`${row.name} ${row.department} ${row.rank} ${row.quota}`.toLowerCase())}" data-status="${row.status}" data-department="${esc(row.department)}">
    <td><strong>${esc(row.name)}</strong><small>${esc(row.rank)}</small></td>
    <td>${esc(row.department)}</td>
    <td>${esc(row.quota)}</td>
    <td><strong>${row.approved} / ${row.required}</strong><div class="quota-progress"><i style="width:${row.percent}%"></i></div><small>${row.percent}% approved</small></td>
    <td>${row.remaining}</td><td>${row.pending}</td><td>${dateText(row.due)}</td>
    <td><span class="quota-badge">${esc(row.status.replaceAll('_',' '))}</span></td>
  </tr>`).join('') || '<tr><td colspan="8"><div class="quota-empty">No active quota assignments are available.</div></td></tr>';
}

async function openStatus() {
  const view = document.querySelector('#quotaView');
  if (!view) return;
  document.querySelectorAll('.quota-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector('[data-quota-current-status-fix]')?.classList.add('active');
  view.innerHTML = '<section class="quota-loading">Loading current quota status…</section>';
  const [definitions, periods, submissions, exemptions, staff] = await Promise.all(['quotaDefinitions','quotaPeriods','quotaSubmissions','quotaExemptions','staffProfiles'].map(getAll));
  const rows = buildRows({ definitions, periods, submissions, exemptions, staff });
  const departments = [...new Set(rows.map(r => r.department))].sort();
  view.innerHTML = `<section class="quota-section quota-current-status-section">
    <div class="quota-section-head"><div><p>LIVE OVERSIGHT</p><h2>Current quota status</h2><span>Every staff member's active quota progress.</span></div><button class="quota-btn" id="quotaStatusRefresh">Refresh</button></div>
    <div class="quota-status-filters"><label><span>Search</span><input id="quotaStatusSearchFix" type="search" placeholder="Search staff, rank, department, or quota"></label><label><span>Department</span><select id="quotaStatusDepartmentFix"><option value="">All departments</option>${departments.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label><label><span>Status</span><select id="quotaStatusStateFix"><option value="">All statuses</option><option value="COMPLETE">Complete</option><option value="NEAR_COMPLETE">Near complete</option><option value="IN_PROGRESS">In progress</option><option value="NOT_STARTED">Not started</option><option value="EXEMPT">Exempt</option></select></label></div>
    <div class="quota-status-result-count"><strong id="quotaStatusCountFix">${rows.length}</strong> current quota assignments</div>
    <div class="quota-status-table-wrap"><table class="quota-status-table"><thead><tr><th>Staff member</th><th>Department</th><th>Current quota</th><th>Progress</th><th>Remaining</th><th>Pending</th><th>Due</th><th>Status</th></tr></thead><tbody id="quotaStatusRowsFix">${renderRows(rows)}</tbody></table></div>
  </section>`;
  const apply = () => {
    const search = document.querySelector('#quotaStatusSearchFix')?.value.trim().toLowerCase() || '';
    const department = document.querySelector('#quotaStatusDepartmentFix')?.value || '';
    const status = document.querySelector('#quotaStatusStateFix')?.value || '';
    const trs = [...document.querySelectorAll('#quotaStatusRowsFix tr[data-search]')];
    trs.forEach(tr => tr.hidden = !((!search || tr.dataset.search.includes(search)) && (!department || tr.dataset.department === department) && (!status || tr.dataset.status === status)));
    const count = trs.filter(tr => !tr.hidden).length;
    const counter = document.querySelector('#quotaStatusCountFix');
    if (counter) counter.textContent = String(count);
  };
  document.querySelector('#quotaStatusSearchFix')?.addEventListener('input', apply);
  document.querySelector('#quotaStatusDepartmentFix')?.addEventListener('change', apply);
  document.querySelector('#quotaStatusStateFix')?.addEventListener('change', apply);
  document.querySelector('#quotaStatusRefresh')?.addEventListener('click', openStatus);
}

function install() {
  const tabs = document.querySelector('.quota-tabs');
  if (!tabs || tabs.querySelector('[data-quota-current-status], [data-quota-current-status-fix]')) return;
  const manageTab = tabs.querySelector('[data-quota-tab="manage"]');
  if (!manageTab) return;
  const button = document.createElement('button');
  button.className = 'quota-tab';
  button.dataset.quotaCurrentStatusFix = 'true';
  button.textContent = 'Current Status';
  tabs.insertBefore(button, manageTab);
  button.addEventListener('click', openStatus);
}

new MutationObserver(install).observe(document.getElementById('app') || document.body, { childList:true, subtree:true });
install();