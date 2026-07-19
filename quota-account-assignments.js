import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs, addDoc, doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentAccount = null;
let pendingDefinitionId = null;
let enhancing = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toDate = value => value?.toDate ? value.toDate() : new Date(value);
const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;

function isQuotaManager() {
  const roles = currentAccount?.systemRoles || [];
  const permissions = currentAccount?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes('quotas.manage');
}

async function activeAccounts() {
  const snapshot = await getDocs(collection(db, 'portalAccounts'));
  return snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE')
    .sort((a, b) => String(a.displayName || a.portalUsername).localeCompare(String(b.displayName || b.portalUsername)));
}

function assignmentMarkup(accounts, selected = []) {
  const chosen = new Set(selected);
  return `<fieldset class="quota-account-assignment full">
    <legend>Assign to active portal accounts</legend>
    <div class="quota-assignment-tools">
      <button type="button" class="quota-btn" id="selectAllQuotaAccounts">Select all</button>
      <button type="button" class="quota-btn" id="clearQuotaAccounts">Clear</button>
      <span id="quotaAssignmentCount">${chosen.size} selected</span>
    </div>
    <div class="quota-account-list">
      ${accounts.map(item => `<label class="quota-account-option">
        <input type="checkbox" name="assignedUserUids" value="${item.id}" ${chosen.has(item.id) ? 'checked' : ''}>
        <span><strong>${esc(item.displayName || item.portalUsername || 'Unnamed account')}</strong><small>@${esc(item.portalUsername || 'unknown')} · ${esc(item.organizationalRank || 'Staff')}</small></span>
      </label>`).join('') || '<p class="quota-empty">No active portal accounts were found.</p>'}
    </div>
  </fieldset>`;
}

function bindAssignmentTools(form) {
  const updateCount = () => {
    const count = form.querySelectorAll('input[name="assignedUserUids"]:checked').length;
    const label = form.querySelector('#quotaAssignmentCount');
    if (label) label.textContent = `${count} selected`;
  };
  form.querySelector('#selectAllQuotaAccounts')?.addEventListener('click', () => {
    form.querySelectorAll('input[name="assignedUserUids"]').forEach(input => { input.checked = true; });
    updateCount();
  });
  form.querySelector('#clearQuotaAccounts')?.addEventListener('click', () => {
    form.querySelectorAll('input[name="assignedUserUids"]').forEach(input => { input.checked = false; });
    updateCount();
  });
  form.querySelectorAll('input[name="assignedUserUids"]').forEach(input => input.addEventListener('change', updateCount));
}

async function enhanceDefinitionModal() {
  if (enhancing || !isQuotaManager()) return;
  const modal = document.getElementById('quotaModal');
  const form = modal?.querySelector('#quotaForm');
  const heading = modal?.querySelector('h2')?.textContent?.trim() || '';
  if (!form || !/quota requirement/i.test(heading) || form.dataset.accountAssignments === 'true') return;

  enhancing = true;
  try {
    const accounts = await activeAccounts();
    let definition = {};
    if (pendingDefinitionId) {
      const snapshot = await getDoc(doc(db, 'quotaDefinitions', pendingDefinitionId));
      if (snapshot.exists()) definition = { id: snapshot.id, ...snapshot.data() };
    }

    form.querySelector('label:has(select[name="targetType"])')?.remove();
    form.querySelector('label:has(input[name="targetId"])')?.remove();
    form.querySelector('.quota-modal-actions')?.insertAdjacentHTML('beforebegin', assignmentMarkup(accounts, definition.assignedUserUids || []));
    form.dataset.accountAssignments = 'true';
    bindAssignmentTools(form);

    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('[type="submit"]');
      const data = new FormData(form);
      const assignedUserUids = data.getAll('assignedUserUids').map(String);
      if (!assignedUserUids.length) {
        alert('Select at least one active portal account.');
        return;
      }

      button.disabled = true;
      button.textContent = 'Saving…';
      try {
        const selectedAccounts = accounts.filter(item => assignedUserUids.includes(item.id));
        const payload = {
          title: String(data.get('title') || '').trim(),
          measurementType: String(data.get('measurementType') || 'points'),
          requiredAmount: Number(data.get('requiredAmount') || 1),
          frequency: String(data.get('frequency') || 'MONTHLY'),
          targetType: 'ACCOUNT_LIST',
          targetId: '',
          assignedUserUids,
          assignedStaffProfileIds: selectedAccounts.map(item => item.staffProfileId).filter(Boolean),
          assignedAccountNames: selectedAccounts.map(item => item.displayName || item.portalUsername || item.id),
          status: String(data.get('status') || 'ACTIVE'),
          description: String(data.get('description') || '').trim(),
          updatedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
        };

        if (definition.id) await updateDoc(doc(db, 'quotaDefinitions', definition.id), payload);
        else await addDoc(collection(db, 'quotaDefinitions'), { ...payload, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() });

        document.getElementById('quotaModal')?.remove();
        location.reload();
      } catch (error) {
        console.error(error);
        alert(`Unable to save quota assignment: ${error.code || error.message}`);
        button.disabled = false;
        button.textContent = 'Save';
      }
    };
  } catch (error) {
    console.error('Unable to load active accounts for quota assignment.', error);
  } finally {
    enhancing = false;
  }
}

async function injectAssignedQuotaCards() {
  const view = document.getElementById('quotaView');
  const heading = view?.querySelector('.quota-section-head p')?.textContent?.trim();
  if (!view || heading !== 'MY QUOTA' || view.dataset.accountAssignmentsReady === 'true' || !auth.currentUser) return;
  view.dataset.accountAssignmentsReady = 'true';

  try {
    const [definitionSnapshot, periodSnapshot, submissionSnapshot] = await Promise.all([
      getDocs(collection(db, 'quotaDefinitions')),
      getDocs(collection(db, 'quotaPeriods')),
      getDocs(collection(db, 'quotaSubmissions')),
    ]);
    const definitions = definitionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(item => String(item.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && Array.isArray(item.assignedUserUids) && item.assignedUserUids.includes(auth.currentUser.uid));
    const periods = periodSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(item => String(item.status || 'ACTIVE').toUpperCase() === 'ACTIVE' && (!item.endDate || toDate(item.endDate).getTime() >= Date.now()));
    const submissions = submissionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const grid = view.querySelector('.quota-grid');
    if (!grid) return;

    const cards = [];
    for (const definition of definitions) {
      for (const period of periods.filter(item => !item.quotaDefinitionId || item.quotaDefinitionId === definition.id)) {
        if (grid.querySelector(`[data-assigned-definition="${definition.id}"][data-assigned-period="${period.id}"]`)) continue;
        const required = Number(period.requiredAmount ?? definition.requiredAmount ?? 0);
        const progress = submissions
          .filter(item => item.quotaDefinitionId === definition.id && item.quotaPeriodId === period.id && item.submittedBy === auth.currentUser.uid && item.status === 'APPROVED')
          .reduce((sum, item) => sum + Number(item.approvedPoints ?? item.points ?? 0), 0);
        const percent = required ? Math.min(100, Math.round(progress / required * 100)) : 0;
        cards.push(`<article class="quota-card" data-assigned-definition="${definition.id}" data-assigned-period="${period.id}">
          <div class="quota-card-head"><span class="quota-badge">${percent >= 100 ? 'COMPLETE' : 'IN PROGRESS'}</span><strong>${percent}%</strong></div>
          <h3>${esc(period.title || definition.title || 'Quota')}</h3>
          <p>${esc(definition.description || 'Complete this assigned quota before the deadline.')}</p>
          <div class="quota-meta"><div><span>Progress</span><strong>${progress} / ${required} ${esc(definition.measurementType || 'points')}</strong></div><div><span>Due</span><strong>${period.endDate ? toDate(period.endDate).toLocaleDateString() : '—'}</strong></div></div>
          <div class="quota-progress"><i style="width:${percent}%"></i></div>
          <div class="quota-card-actions"><button class="quota-btn primary assigned-quota-submit" data-definition="${definition.id}" data-period="${period.id}" data-title="${esc(period.title || definition.title || 'Quota')}">Submit activity</button></div>
        </article>`);
      }
    }

    if (cards.length) {
      grid.querySelector('.quota-empty')?.remove();
      grid.insertAdjacentHTML('beforeend', cards.join(''));
      grid.querySelectorAll('.assigned-quota-submit').forEach(button => {
        button.onclick = () => openAssignedSubmission(button.dataset.definition, button.dataset.period, button.dataset.title);
      });
    }
  } catch (error) {
    console.error('Unable to display account-assigned quotas.', error);
  }
}

function openAssignedSubmission(definitionId, periodId, title) {
  document.getElementById('assignedQuotaModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="quota-backdrop" id="assignedQuotaModal"><section class="quota-modal"><div class="quota-section-head"><div><p>QUOTA CENTER</p><h2>Submit ${esc(title)}</h2></div><button class="quota-btn" type="button" id="closeAssignedQuota">×</button></div><form class="quota-form" id="assignedQuotaForm"><label>Activity type<input name="activityType" required></label><label>Activity date<input name="activityDate" type="date" required></label><label>Points claimed<input name="points" type="number" min="0" required></label><label>Proof URL<input name="proofUrl" type="url" placeholder="https://..."></label><label class="full">Description<textarea name="description" required></textarea></label><div class="quota-modal-actions"><button class="quota-btn" type="button" id="cancelAssignedQuota">Cancel</button><button class="quota-btn primary" type="submit">Submit</button></div></form></section></div>`);
  const close = () => document.getElementById('assignedQuotaModal')?.remove();
  document.getElementById('closeAssignedQuota').onclick = close;
  document.getElementById('cancelAssignedQuota').onclick = close;
  document.getElementById('assignedQuotaForm').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await addDoc(collection(db, 'quotaSubmissions'), {
        quotaDefinitionId: definitionId,
        quotaPeriodId: periodId,
        quotaTitle: title,
        staffProfileId: currentAccount?.staffProfileId || '',
        staffName: currentAccount?.displayName || currentAccount?.portalUsername || 'Staff Member',
        submittedBy: auth.currentUser.uid,
        activityType: String(data.get('activityType')).trim(),
        activityDate: toTimestamp(data.get('activityDate')),
        points: Number(data.get('points')),
        proofUrl: String(data.get('proofUrl') || '').trim(),
        description: String(data.get('description')).trim(),
        status: 'PENDING',
        createdAt: serverTimestamp(),
      });
      close();
      location.reload();
    } catch (error) {
      console.error(error);
      alert(`Unable to submit quota activity: ${error.code || error.message}`);
      button.disabled = false;
    }
  };
}

document.addEventListener('click', event => {
  const edit = event.target.closest('.quota-edit-definition');
  const create = event.target.closest('#newQuotaDefinition, #newDefinitionInline');
  if (edit) pendingDefinitionId = edit.dataset.id;
  if (create) pendingDefinitionId = null;
}, true);

let timer;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    enhanceDefinitionModal();
    injectAssignedQuotaCards();
  }, 100);
};
new MutationObserver(schedule).observe(document.getElementById('app'), { childList: true, subtree: true });
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: false });

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  currentAccount = snapshot.exists() ? snapshot.data() : null;
  schedule();
});