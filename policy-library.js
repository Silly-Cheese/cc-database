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
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let currentAccount = null;
let rendering = false;
let editingId = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function canManage() {
  const roles = currentAccount?.systemRoles || [];
  const permissions = currentAccount?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes('documents.manage');
}

function normalizeUrl(record) {
  return String(record.url || record.documentUrl || record.link || '').trim();
}

function formatDate(value) {
  if (!value) return 'Not set';
  if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString();
}

function documentIcon(type) {
  const icons = { POLICY: '§', HANDBOOK: '▤', GUIDE: '◇', MANUAL: '▥', SOP: '✓', FORM: '▧' };
  return icons[String(type || '').toUpperCase()] || '▤';
}

function statusClass(status) {
  const value = String(status || 'ACTIVE').toUpperCase();
  if (value === 'DRAFT') return 'is-draft';
  if (value === 'ARCHIVED') return 'is-archived';
  return 'is-active';
}

async function loadCurrentAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  currentAccount = snapshot.exists() ? snapshot.data() : null;
  return currentAccount;
}

function closeEditor() {
  document.getElementById('policyEditorModal')?.remove();
  editingId = null;
}

function openEditor(record = {}, id = null) {
  editingId = id;
  document.getElementById('policyEditorModal')?.remove();
  const existingUrl = normalizeUrl(record);
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="policyEditorModal">
      <section class="crud-modal policy-editor-modal">
        <div class="crud-heading">
          <div><p>${id ? 'EDIT DOCUMENT' : 'NEW DOCUMENT'}</p><h2>${id ? 'Update policy document' : 'Add policy document'}</h2></div>
          <button type="button" id="closePolicyEditor" aria-label="Close">×</button>
        </div>
        <form id="policyEditorForm" class="crud-form">
          <label>Title<input name="title" value="${esc(record.title)}" required></label>
          <label>Type<select name="type" required>${['POLICY','HANDBOOK','GUIDE','MANUAL','SOP','FORM'].map(option => `<option value="${option}" ${String(record.type || 'POLICY').toUpperCase() === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>
          <label>Version<input name="version" value="${esc(record.version || '1.0')}" required></label>
          <label>Visibility<select name="visibility" required>${['ALL_STAFF','LEADERSHIP','EXECUTIVE'].map(option => `<option value="${option}" ${String(record.visibility || 'ALL_STAFF').toUpperCase() === option ? 'selected' : ''}>${option.replaceAll('_',' ')}</option>`).join('')}</select></label>
          <label>Status<select name="status" required>${['ACTIVE','DRAFT','ARCHIVED'].map(option => `<option value="${option}" ${String(record.status || 'ACTIVE').toUpperCase() === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>
          <label>Effective date<input name="effectiveDate" type="date" value="${esc(record.effectiveDate || '')}"></label>
          <label class="policy-url-field">Document URL<input name="url" type="url" value="${esc(existingUrl)}" placeholder="https://..." required></label>
          <label class="policy-description-field">Description<textarea name="description" placeholder="Briefly describe this document.">${esc(record.description)}</textarea></label>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelPolicyEditor">Cancel</button>
            <button type="submit">${id ? 'Save changes' : 'Create document'}</button>
          </div>
        </form>
      </section>
    </div>`);

  document.getElementById('closePolicyEditor').onclick = closeEditor;
  document.getElementById('cancelPolicyEditor').onclick = closeEditor;
  document.getElementById('policyEditorForm').onsubmit = savePolicy;
}

async function savePolicy(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    const form = new FormData(event.currentTarget);
    const data = {
      title: String(form.get('title')).trim(),
      type: String(form.get('type')).trim(),
      version: String(form.get('version')).trim(),
      visibility: String(form.get('visibility')).trim(),
      status: String(form.get('status')).trim(),
      effectiveDate: String(form.get('effectiveDate') || '').trim(),
      url: String(form.get('url')).trim(),
      description: String(form.get('description') || '').trim(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    };

    if (editingId) {
      await updateDoc(doc(db, 'documents', editingId), data);
    } else {
      await addDoc(collection(db, 'documents'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
      });
    }

    closeEditor();
    await renderPolicyLibrary(true);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = editingId ? 'Save changes' : 'Create document';
    alert(`Unable to save document: ${error.code || error.message}`);
  }
}

async function editPolicy(id) {
  const snapshot = await getDoc(doc(db, 'documents', id));
  if (!snapshot.exists()) return alert('Document not found.');
  openEditor(snapshot.data(), id);
}

async function deletePolicy(id, title) {
  if (!confirm(`Permanently delete “${title}”? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'documents', id));
    await renderPolicyLibrary(true);
  } catch (error) {
    console.error(error);
    alert(`Unable to delete document: ${error.code || error.message}`);
  }
}

function openDocument(url) {
  if (!url) return alert('No document URL has been added yet.');
  let parsed;
  try { parsed = new URL(url, window.location.href); } catch { return alert('This document has an invalid URL. Edit the record and enter a valid link.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return alert('Only secure web links can be opened.');
  window.open(parsed.href, '_blank', 'noopener,noreferrer');
}

async function renderPolicyLibrary(force = false) {
  if (rendering || !auth.currentUser || auth.currentUser.isAnonymous) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Policy Library') return;
  if (!force && panel.dataset.policyCardsReady === 'true') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'documents'));
    const documents = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const manageable = canManage();

    panel.querySelector('.table-wrap')?.remove();
    panel.querySelector('.empty')?.remove();
    panel.querySelector('.policy-library-tools')?.remove();
    panel.querySelector('.policy-card-grid')?.remove();

    const heading = panel.querySelector('.section-head');
    if (heading) {
      heading.querySelector(':scope > span')?.remove();
      heading.insertAdjacentHTML('beforeend', `<span>${documents.length} documents</span>`);
    }

    panel.insertAdjacentHTML('beforeend', `
      <div class="policy-library-tools">
        <label class="policy-search"><span>Search documents</span><input id="policySearch" type="search" placeholder="Search title, type, or description..."></label>
        ${manageable ? '<button class="crud-add" id="addPolicyDocument">+ Add document</button>' : ''}
      </div>
      <section class="policy-card-grid">
        ${documents.length ? documents.map((record, index) => {
          const url = normalizeUrl(record);
          const status = String(record.status || 'ACTIVE').toUpperCase();
          const type = String(record.type || 'POLICY').toUpperCase();
          const searchText = esc(`${record.title || ''} ${type} ${record.description || ''}`.toLowerCase());
          return `<article class="policy-document-card" data-search="${searchText}">
            <div class="policy-card-accent"></div>
            <div class="policy-card-header">
              <div class="policy-document-icon">${documentIcon(type)}</div>
              <span class="policy-status ${statusClass(status)}"><i></i>${esc(status)}</span>
            </div>
            <div class="policy-card-body">
              <p class="policy-eyebrow">${esc(type)} · DOCUMENT ${String(index + 1).padStart(2, '0')}</p>
              <h2>${esc(record.title || 'Untitled Document')}</h2>
              <p class="policy-description">${esc(record.description || 'No description has been provided.')}</p>
              <div class="policy-meta-grid">
                <div><span>Version</span><strong>${esc(record.version || '—')}</strong></div>
                <div><span>Visibility</span><strong>${esc(String(record.visibility || 'ALL_STAFF').replaceAll('_', ' '))}</strong></div>
                <div><span>Effective</span><strong>${esc(formatDate(record.effectiveDate))}</strong></div>
                <div><span>Updated</span><strong>${esc(formatDate(record.updatedAt || record.createdAt))}</strong></div>
              </div>
            </div>
            <div class="policy-card-footer">
              <button class="policy-open" type="button" data-url="${esc(url)}" ${url ? '' : 'disabled'}>Open Document</button>
              ${manageable ? `<button class="policy-edit" type="button" data-id="${record.id}">Edit</button><button class="policy-delete" type="button" data-id="${record.id}" data-title="${esc(record.title || 'this document')}">Delete</button>` : ''}
            </div>
          </article>`;
        }).join('') : '<div class="staff-empty-card"><div class="policy-document-icon">▤</div><h2>No policy documents yet</h2><p>Add the first document to begin the library.</p></div>'}
      </section>`);

    document.getElementById('addPolicyDocument')?.addEventListener('click', () => openEditor());
    panel.querySelectorAll('.policy-open').forEach(button => button.onclick = () => openDocument(button.dataset.url));
    panel.querySelectorAll('.policy-edit').forEach(button => button.onclick = () => editPolicy(button.dataset.id));
    panel.querySelectorAll('.policy-delete').forEach(button => button.onclick = () => deletePolicy(button.dataset.id, button.dataset.title));
    document.getElementById('policySearch')?.addEventListener('input', event => {
      const term = event.target.value.trim().toLowerCase();
      panel.querySelectorAll('.policy-document-card').forEach(card => {
        card.hidden = term && !card.dataset.search.includes(term);
      });
    });

    panel.dataset.policyCardsReady = 'true';
  } catch (error) {
    console.error('Unable to render policy library.', error);
  } finally {
    rendering = false;
  }
}

let timer = null;
function scheduleRender() {
  clearTimeout(timer);
  timer = setTimeout(() => renderPolicyLibrary(), 120);
}

const observer = new MutationObserver(scheduleRender);
observer.observe(document.getElementById('app'), { childList: true, subtree: false });
window.addEventListener('canela-view-rendered', scheduleRender);
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  await loadCurrentAccount();
  scheduleRender();
});
scheduleRender();
