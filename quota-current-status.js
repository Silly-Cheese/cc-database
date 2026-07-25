import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let dataCache = null;
let dataCacheAt = 0;
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const has = permission => {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes(permission);
};

const canManageQuota = () => has('quotas.manage');

async function loadData(force = false) {
  if (!force && dataCache && Date.now() - dataCacheAt < 10000) return dataCache;
  const names = ['quotaDefinitions', 'quotaPeriods', 'quotaSubmissions', 'quotaExemptions', 'staffProfiles'];
  const [definitions, periods, submissions, exemptions, staff] = await Promise.all(names.map(async name => {
    try {
      const snapshot = await getDocs(collection(db, name));
      return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    } catch (error) {
      console.warn(`Unable to load ${name}`, error);
      return [];
    }
  }));
  dataCache = { definitions, periods, submissions, exemptions, staff };
  dataCacheAt = Date.now();
  return dataCache;
}

function activePeriods(data) {
  const now = Date.now();
  return data.periods.filter(period => {
    if (String(period.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    const start = period.startDate?.toDate?.()?.getTime() ?? new Date(period.startDate || 0).getTime();
    const end = period.endDate?.toDate?.()?.getTime() ?? new Date(period.endDate || '2999-01-01').getTime();
    return start <= now && end >= now;
  });
}

function matchesDefinition(definition, staff) {
  if (String(definition.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
  const target = String(definition.targetType || 'ALL').toUpperCase();
  if (target === 'ALL') return true;
  if (target === 'INDIVIDUAL') return String(definition.targetId || '') === String(staff.id || '');
  if (target === 'RANK') return String(definition.targetId || '') === String(staff.organizationalRank || staff.rankName || '');
  if (target === 'DEPARTMENT') return String(definition.targetId || '') === String(staff.departmentName || staff.departmentId || '');
  if (target === 'TEAM') return String(definition.targetId || '') === String(staff.teamName || staff.teamId || '');
  return false;
}

function approvedProgress(data, periodId, definitionId, staffId) {
  return data.submissions
    .filter(submission => submission.quotaPeriodId === periodId
      && submission.quotaDefinitionId === definitionId
      && submission.staffProfileId === staffId
      && String(submission.status || '').toUpperCase() === 'APPROVED')
    .reduce((sum, submission) => sum + Number(submission.approvedPoints ?? submission.points ?? 0), 0);
}

function pendingProgress(data, periodId, definitionId, staffId) {
  return data.submissions
    .filter(submission => submission.quotaPeriodId === periodId
      && submission.quotaDefinitionId === definitionId
      && submission.staffProfileId === staffId
      && String(submission.status || '').toUpperCase() === 'PENDING')
    .reduce((sum, submission) => sum + Number(submission.points ?? 0), 0);
}

function statusFor(percent, approved, pending, exempt) {
  if (exempt) return 'EXEMPT';
  if (percent >= 100) return 'COMPLETE';
  if (approved <= 0 && pending <= 0) return 'NOT_STARTED';
  if (percent >= 75) return 'NEAR_COMPLETE';
  return 'IN_PROGRESS';
}

function buildRows(data) {
  const periods = activePeriods(data);
  const rows = [];
  data.staff.forEach(staff => {
    const definitions = data.definitions.filter(definition => matchesDefinition(definition, staff));
    periods.forEach(period => {
      const periodDefinitions = definitions.filter(definition => !period.quotaDefinitionId || period.quotaDefinitionId === definition.id);
      periodDefinitions.forEach(definition => {
        const required = Number(period.requiredAmount ?? definition.requiredAmount ?? 0);
        const approved = approvedProgress(data, period.id, definition.id, staff.id);
        const pending = pendingProgress(data, period.id, definition.id, staff.id);
        const percent = required > 0 ? Math.min(100, Math.round((approved / required) * 100)) : 0;
        const exemption = data.exemptions.find(item => item.staffProfileId === staff.id
          && item.quotaPeriodId === period.id
          && String(item.status || '').toUpperCase() === 'ACTIVE');
        rows.push({
          staffId: staff.id,
          staffName: staff.displayName || staff.robloxUsername || staff.portalUsername || 'Unnamed staff member',
          department: staff.departmentName || staff.departmentId || 'Unassigned',
          rank: staff.organizationalRank || staff.rankName || 'Staff',
          periodId: period.id,
          periodTitle: period.title || definition.title || 'Current quota',
          definitionId: definition.id,
          definitionTitle: definition.title || 'Quota requirement',
          measurementType: definition.measurementType || 'points',
          required,
          approved,
          pending,
          remaining: Math.max(0, required - approved),
          percent,
          exempt: Boolean(exemption),
          exemptionReason: exemption?.reason || '',
          status: statusFor(percent, approved, pending, exemption),
          dueDate: period.endDate
        });
      });
    });
  });
  return rows.sort((a, b) => a.staffName.localeCompare(b.staffName) || a.periodTitle.localeCompare(b.periodTitle));
}

function dateText(value) {
  if (!value) return '—';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function statusLabel(status) {
  return String(status || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
}

function statusClass(status) {
  return String(status || '').toLowerCase().replaceAll('_', '-');
}

function renderStatusView(data) {
  const rows = buildRows(data);
  const departments = [...new Set(rows.map(row => row.department).filter(Boolean))].sort();
  const periods = [...new Map(rows.map(row => [row.periodId, row.periodTitle])).entries()];
  const totals = {
    complete: rows.filter(row => row.status === 'COMPLETE').length,
    inProgress: rows.filter(row => ['IN_PROGRESS', 'NEAR_COMPLETE'].includes(row.status)).length,
    notStarted: rows.filter(row => row.status === 'NOT_STARTED').length,
    exempt: rows.filter(row => row.status === 'EXEMPT').length
  };

  return `<section class="quota-section quota-current-status-section">
    <div class="quota-section-head">
      <div><p>LIVE OVERSIGHT</p><h2>Current quota status</h2><span>View every staff member's active quota progress in one place.</span></div>
      <button class="quota-btn" type="button" id="quotaRefreshStatus">Refresh</button>
    </div>
    <div class="quota-current-status-stats">
      <article><strong>${totals.complete}</strong><span>Complete</span></article>
      <article><strong>${totals.inProgress}</strong><span>In progress</span></article>
      <article><strong>${totals.notStarted}</strong><span>Not started</span></article>
      <article><strong>${totals.exempt}</strong><span>Exempt</span></article>
    </div>
    <div class="quota-status-filters">
      <label><span>Search</span><input id="quotaStatusSearch" type="search" placeholder="Search staff, department, rank, or quota…"></label>
      <label><span>Department</span><select id="quotaStatusDepartment"><option value="">All departments</option>${departments.map(department => `<option value="${esc(department)}">${esc(department)}</option>`).join('')}</select></label>
      <label><span>Period</span><select id="quotaStatusPeriod"><option value="">All active periods</option>${periods.map(([id, title]) => `<option value="${esc(id)}">${esc(title)}</option>`).join('')}</select></label>
      <label><span>Status</span><select id="quotaStatusState"><option value="">All statuses</option><option value="COMPLETE">Complete</option><option value="NEAR_COMPLETE">Near complete</option><option value="IN_PROGRESS">In progress</option><option value="NOT_STARTED">Not started</option><option value="EXEMPT">Exempt</option></select></label>
      <label><span>Sort</span><select id="quotaStatusSort"><option value="name">Staff name</option><option value="progress-desc">Highest progress</option><option value="progress-asc">Lowest progress</option><option value="remaining-desc">Most remaining</option><option value="due">Due date</option></select></label>
      <button class="quota-btn" id="quotaStatusClear" type="button">Clear filters</button>
    </div>
    <div class="quota-status-result-count"><strong id="quotaStatusCount">${rows.length}</strong> current quota assignment${rows.length === 1 ? '' : 's'}</div>
    <div class="quota-status-table-wrap">
      <table class="quota-status-table">
        <thead><tr><th>Staff member</th><th>Department</th><th>Current quota</th><th>Progress</th><th>Required</th><th>Remaining</th><th>Pending</th><th>Due</th><th>Status</th></tr></thead>
        <tbody id="quotaStatusRows">${rows.map(renderRow).join('') || '<tr><td colspan="9"><div class="quota-empty">No active quota assignments are available.</div></td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}

function renderRow(row) {
  return `<tr data-search="${esc(`${row.staffName} ${row.department} ${row.rank} ${row.periodTitle} ${row.definitionTitle}`.toLowerCase())}" data-department="${esc(row.department)}" data-period="${esc(row.periodId)}" data-status="${esc(row.status)}" data-percent="${row.percent}" data-remaining="${row.remaining}" data-due="${row.dueDate?.toDate?.()?.getTime() ?? new Date(row.dueDate || '2999-01-01').getTime()}">
    <td><div class="quota-status-person"><strong>${esc(row.staffName)}</strong><span>${esc(row.rank)}</span></div></td>
    <td>${esc(row.department)}</td>
    <td><div class="quota-status-quota"><strong>${esc(row.periodTitle)}</strong><span>${esc(row.definitionTitle)}</span></div></td>
    <td><div class="quota-status-progress"><div><strong>${row.approved}</strong><span>/ ${row.required} ${esc(row.measurementType)}</span></div><div class="quota-progress"><i style="width:${row.percent}%"></i></div><small>${row.percent}% approved</small></div></td>
    <td>${row.required}</td>
    <td>${row.exempt ? '—' : row.remaining}</td>
    <td>${row.pending}</td>
    <td>${dateText(row.dueDate)}</td>
    <td><span class="quota-badge quota-status-${statusClass(row.status)}">${esc(statusLabel(row.status))}</span>${row.exempt && row.exemptionReason ? `<small class="quota-status-exemption">${esc(row.exemptionReason)}</small>` : ''}</td>
  </tr>`;
}

function applyFilters(section) {
  const search = section.querySelector('#quotaStatusSearch').value.trim().toLowerCase();
  const department = section.querySelector('#quotaStatusDepartment').value;
  const period = section.querySelector('#quotaStatusPeriod').value;
  const status = section.querySelector('#quotaStatusState').value;
  const sort = section.querySelector('#quotaStatusSort').value;
  const body = section.querySelector('#quotaStatusRows');
  const rows = [...body.querySelectorAll('tr[data-search]')];

  rows.forEach(row => {
    const visible = (!search || row.dataset.search.includes(search))
      && (!department || row.dataset.department === department)
      && (!period || row.dataset.period === period)
      && (!status || row.dataset.status === status);
    row.hidden = !visible;
  });

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'progress-desc') return Number(b.dataset.percent) - Number(a.dataset.percent);
    if (sort === 'progress-asc') return Number(a.dataset.percent) - Number(b.dataset.percent);
    if (sort === 'remaining-desc') return Number(b.dataset.remaining) - Number(a.dataset.remaining);
    if (sort === 'due') return Number(a.dataset.due) - Number(b.dataset.due);
    return a.querySelector('.quota-status-person strong').textContent.localeCompare(b.querySelector('.quota-status-person strong').textContent);
  });
  sorted.forEach(row => body.appendChild(row));

  const visibleCount = rows.filter(row => !row.hidden).length;
  section.querySelector('#quotaStatusCount').textContent = String(visibleCount);
}

function bindStatusView(section) {
  if (!section || section.dataset.bound === 'true') return;
  section.dataset.bound = 'true';
  ['quotaStatusSearch', 'quotaStatusDepartment', 'quotaStatusPeriod', 'quotaStatusState', 'quotaStatusSort'].forEach(id => {
    const control = section.querySelector(`#${id}`);
    control?.addEventListener(id === 'quotaStatusSearch' ? 'input' : 'change', () => applyFilters(section));
  });
  section.querySelector('#quotaStatusClear')?.addEventListener('click', () => {
    section.querySelector('#quotaStatusSearch').value = '';
    section.querySelector('#quotaStatusDepartment').value = '';
    section.querySelector('#quotaStatusPeriod').value = '';
    section.querySelector('#quotaStatusState').value = '';
    section.querySelector('#quotaStatusSort').value = 'name';
    applyFilters(section);
  });
  section.querySelector('#quotaRefreshStatus')?.addEventListener('click', async () => {
    dataCacheAt = 0;
    const view = document.querySelector('#quotaView');
    if (!view) return;
    view.innerHTML = '<section class="quota-loading">Refreshing current quota status…</section>';
    const data = await loadData(true);
    view.innerHTML = renderStatusView(data);
    bindStatusView(view.querySelector('.quota-current-status-section'));
  });
}

async function openStatusTab() {
  const view = document.querySelector('#quotaView');
  if (!view) return;
  document.querySelectorAll('.quota-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelector('[data-quota-current-status]')?.classList.add('active');
  view.innerHTML = '<section class="quota-loading">Loading current quota status…</section>';
  try {
    const data = await loadData();
    view.innerHTML = renderStatusView(data);
    bindStatusView(view.querySelector('.quota-current-status-section'));
  } catch (error) {
    console.error(error);
    view.innerHTML = `<div class="quota-empty">Unable to load current quota status: ${esc(error?.message || 'Unknown error')}</div>`;
  }
}

function installTab() {
  if (!canManageQuota()) return;
  const tabs = document.querySelector('.quota-tabs');
  if (!tabs || tabs.querySelector('[data-quota-current-status]')) return;
  const button = document.createElement('button');
  button.className = 'quota-tab';
  button.dataset.quotaCurrentStatus = 'true';
  button.textContent = 'Current Status';
  const reviewTab = tabs.querySelector('[data-quota-tab="review"]');
  if (reviewTab) tabs.insertBefore(button, reviewTab); else tabs.appendChild(button);
  button.addEventListener('click', openStatusTab);
}

const observer = new MutationObserver(() => {
  if (rendering) return;
  rendering = true;
  installTab();
  rendering = false;
});
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    account = snapshot.exists() ? snapshot.data() : null;
    installTab();
  } catch (error) {
    console.error('Unable to initialize current quota status.', error);
  }
});
