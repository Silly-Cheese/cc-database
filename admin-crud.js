import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const db = getFirestore(getApp());
const auth = getAuth(getApp());

const MODULES = {
  'Staff Directory': {
    collection: 'staffProfiles',
    permission: 'staff.manage',
    fields: [
      ['displayName', 'Display name', 'text', true],
      ['robloxUsername', 'Roblox username', 'text', true],
      ['discordUsername', 'Discord username', 'text', false],
      ['discordId', 'Discord ID', 'text', false],
      ['organizationalRank', 'Rank', 'text', true],
      ['departmentName', 'Department', 'text', false],
      ['teamName', 'Team', 'text', false],
      ['staffStatus', 'Status', 'select', true, ['ACTIVE', 'LEAVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED']],
    ],
  },
  'Personnel Actions': {
    collection: 'personnelActions', permission: 'personnel.approve',
    fields: [
      ['staffName', 'Staff member', 'text', true],
      ['actionType', 'Action type', 'select', true, ['PROMOTION', 'DEMOTION', 'TRANSFER', 'LEAVE', 'SUSPENSION', 'RESIGNATION', 'TERMINATION']],
      ['reason', 'Reason', 'textarea', true],
      ['status', 'Status', 'select', true, ['PENDING', 'APPROVED', 'DENIED', 'WITHDRAWN']],
    ],
  },
  'Compliance & Discipline': {
    collection: 'disciplinaryCases', permission: 'discipline.manage',
    fields: [
      ['subjectName', 'Subject', 'text', true], ['offenceName', 'Offence', 'text', true],
      ['recommendedAction', 'Recommended action', 'text', true], ['reason', 'Case details', 'textarea', true],
      ['status', 'Status', 'select', true, ['OPEN', 'UNDER_REVIEW', 'CLOSED', 'APPEALED']],
    ],
  },
  'Alliance Management': {
    collection: 'alliances', permission: 'alliances.manage',
    fields: [
      ['name', 'Alliance name', 'text', true], ['canelaRepresentative', 'Canela representative', 'text', true],
      ['partnerRepresentative', 'Partner representative', 'text', false], ['groupLink', 'Group link', 'url', false],
      ['status', 'Status', 'select', true, ['ACTIVE', 'ON_HOLD', 'TERMINATED']], ['notes', 'Notes', 'textarea', false],
    ],
  },
  'Training & Workforce': {
    collection: 'courses', permission: 'training.manage',
    fields: [
      ['title', 'Course title', 'text', true], ['category', 'Category', 'text', true],
      ['passingScore', 'Passing score', 'number', true], ['status', 'Status', 'select', true, ['DRAFT', 'ACTIVE', 'ARCHIVED']],
      ['description', 'Description', 'textarea', false],
    ],
  },
  'Policy Library': {
    collection: 'documents', permission: 'documents.manage',
    fields: [
      ['title', 'Title', 'text', true], ['type', 'Type', 'select', true, ['POLICY', 'HANDBOOK', 'GUIDE', 'MANUAL', 'SOP', 'FORM']],
      ['version', 'Version', 'text', true], ['visibility', 'Visibility', 'select', true, ['ALL_STAFF', 'LEADERSHIP', 'EXECUTIVE']],
      ['url', 'Document link', 'url', false], ['description', 'Description', 'textarea', false],
    ],
  },
};

let account = null;
let activeModule = null;
let editingId = null;
const collectionIdCache = new Map();

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

function canManage(permission) {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*') || permissions.includes(permission);
}

async function loadAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const snap = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snap.exists() ? snap.data() : null;
  return account;
}

function fieldMarkup(field, value = '') {
  const [name, label, type, required, options] = field;
  const requiredAttr = required ? 'required' : '';
  if (type === 'textarea') return `<label>${label}<textarea name="${name}" ${requiredAttr}>${escapeHtml(value)}</textarea></label>`;
  if (type === 'select') return `<label>${label}<select name="${name}" ${requiredAttr}><option value="">Select…</option>${options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option.replaceAll('_', ' ')}</option>`).join('')}</select></label>`;
  return `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${requiredAttr}></label>`;
}

function showEditor(module, record = {}, id = null) {
  document.getElementById('crudModal')?.remove();
  activeModule = module;
  editingId = id;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="crudModal"><section class="crud-modal">
      <div class="crud-heading"><div><p>${id ? 'EDIT RECORD' : 'NEW RECORD'}</p><h2>${id ? 'Update' : 'Add to'} ${module.collection}</h2></div><button type="button" id="closeCrud" aria-label="Close">×</button></div>
      <form id="crudForm" class="crud-form">${module.fields.map(field => fieldMarkup(field, record[field[0]] ?? '')).join('')}
        <div class="crud-actions"><button type="button" class="secondary" id="cancelCrud">Cancel</button><button type="submit">${id ? 'Save changes' : 'Create record'}</button></div>
      </form>
    </section></div>`);
  document.getElementById('closeCrud').onclick = closeEditor;
  document.getElementById('cancelCrud').onclick = closeEditor;
  document.getElementById('crudForm').onsubmit = saveRecord;
}

function closeEditor() {
  document.getElementById('crudModal')?.remove();
  activeModule = null;
  editingId = null;
}

async function saveRecord(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const form = new FormData(event.currentTarget);
    const data = {};
    for (const [name, , type] of activeModule.fields) {
      const raw = String(form.get(name) ?? '').trim();
      data[name] = type === 'number' ? Number(raw) : raw;
    }
    data.updatedAt = serverTimestamp();
    data.updatedBy = auth.currentUser.uid;
    if (editingId) await updateDoc(doc(db, activeModule.collection, editingId), data);
    else {
      data.createdAt = serverTimestamp();
      data.createdBy = auth.currentUser.uid;
      if (activeModule.collection === 'personnelActions') data.requestedBy = auth.currentUser.uid;
      if (activeModule.collection === 'disciplinaryCases') data.issuedBy = auth.currentUser.uid;
      await addDoc(collection(db, activeModule.collection), data);
    }
    const collectionName = activeModule.collection;
    collectionIdCache.delete(collectionName);
    closeEditor();
    window.dispatchEvent(new CustomEvent('canela-record-saved', { detail: { collection: collectionName } }));
    location.reload();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = editingId ? 'Save changes' : 'Create record';
    alert(`Unable to save: ${error.code || error.message}`);
  }
}

async function editRecord(module, id) {
  try {
    const snap = await getDoc(doc(db, module.collection, id));
    if (!snap.exists()) throw new Error('Record not found');
    showEditor(module, snap.data(), id);
  } catch (error) {
    console.error(error);
    alert(`Unable to open record: ${error.code || error.message}`);
  }
}

async function getCollectionIds(collectionName) {
  const cached = collectionIdCache.get(collectionName);
  if (cached && Date.now() - cached.loadedAt < 30000) return cached.ids;
  const snapshot = await getDocs(collection(db, collectionName));
  const ids = snapshot.docs.map(item => item.id);
  collectionIdCache.set(collectionName, { ids, loadedAt: Date.now() });
  return ids;
}

window.CanelaCrud = {
  canManage,
  editStaff: id => editRecord(MODULES['Staff Directory'], id),
  createStaff: () => showEditor(MODULES['Staff Directory']),
  editAlliance: id => editRecord(MODULES['Alliance Management'], id),
  createAlliance: () => showEditor(MODULES['Alliance Management']),
};
window.dispatchEvent(new CustomEvent('canela-crud-ready'));

async function enhancePanel() {
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  const module = MODULES[title];
  if (!panel || !module || !account || !canManage(module.permission)) return;
  if (panel.dataset.crudReady === 'true') return;
  panel.dataset.crudReady = 'true';

  const head = panel.querySelector('.section-head');
  const addButton = document.createElement('button');
  addButton.className = 'crud-add';
  addButton.textContent = '+ Add record';
  addButton.onclick = () => showEditor(module);
  if (head) head.appendChild(addButton); else panel.prepend(addButton);

  const table = panel.querySelector('table');
  if (!table) return;
  const headingRow = table.querySelector('thead tr');
  headingRow?.insertAdjacentHTML('beforeend', '<th>Actions</th>');

  const rows = [...table.querySelectorAll('tbody tr')];
  const ids = await getCollectionIds(module.collection);
  rows.forEach((row, index) => {
    if (row.querySelector('.crud-edit')) return;
    const cell = document.createElement('td');
    cell.innerHTML = '<button class="crud-edit" type="button">Edit</button>';
    row.appendChild(cell);
    const targetId = ids[index];
    cell.querySelector('button').onclick = () => targetId && editRecord(module, targetId);
  });
}

let enhanceTimer = null;
function scheduleEnhance() {
  clearTimeout(enhanceTimer);
  enhanceTimer = setTimeout(enhancePanel, 80);
}

const observer = new MutationObserver(scheduleEnhance);
observer.observe(document.getElementById('app'), { childList: true, subtree: false });
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  try { await loadAccount(); scheduleEnhance(); }
  catch (error) { console.error('Could not load CRUD permissions.', error); }
});
window.addEventListener('canela-view-rendered', scheduleEnhance);
