import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function canManage() {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER')
    || roles.includes('SYSTEM_ADMINISTRATOR')
    || permissions.includes('*')
    || permissions.includes('discipline.manage');
}

function canDelete() {
  const roles = account?.systemRoles || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR');
}

function statusClass(status) {
  const value = String(status || 'OPEN').toUpperCase();
  if (value === 'CLOSED') return 'is-closed';
  if (value === 'APPEALED') return 'is-appealed';
  if (value === 'UNDER_REVIEW') return 'is-review';
  return 'is-open';
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString();
}

function closeEditor() {
  document.getElementById('complianceEditorModal')?.remove();
}

function showEditor(record) {
  closeEditor();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="complianceEditorModal">
      <section class="crud-modal compliance-editor-modal">
        <div class="crud-heading">
          <div><p>EDIT COMPLIANCE CASE</p><h2>${esc(record.subjectName || 'Disciplinary case')}</h2></div>
          <button type="button" id="closeComplianceEditor" aria-label="Close">×</button>
        </div>
        <form id="complianceEditorForm" class="crud-form">
          <label>Subject<input name="subjectName" value="${esc(record.subjectName || '')}" required></label>
          <label>Offence<input name="offenceName" value="${esc(record.offenceName || '')}" required></label>
          <label>Recommended action<input name="recommendedAction" value="${esc(record.recommendedAction || '')}" required></label>
          <label>Status
            <select name="status" required>
              ${['OPEN','UNDER_REVIEW','CLOSED','APPEALED'].map(value => `<option value="${value}" ${String(record.status || 'OPEN').toUpperCase() === value ? 'selected' : ''}>${value.replaceAll('_', ' ')}</option>`).join('')}
            </select>
          </label>
          <label>Case details<textarea name="reason" required>${esc(record.reason || '')}</textarea></label>
          <label>Case officer<input name="caseOfficer" value="${esc(record.caseOfficer || record.issuedByName || '')}"></label>
          <label>Administrative notes<textarea name="notes">${esc(record.notes || '')}</textarea></label>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelComplianceEditor">Cancel</button>
            <button type="submit">Save changes</button>
          </div>
        </form>
      </section>
    </div>`);

  document.getElementById('closeComplianceEditor').onclick = closeEditor;
  document.getElementById('cancelComplianceEditor').onclick = closeEditor;
  document.getElementById('complianceEditorForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('[type="submit"]');
    const form = new FormData(event.currentTarget);
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      await updateDoc(doc(db, 'disciplinaryCases', record.id), {
        subjectName: String(form.get('subjectName')).trim(),
        offenceName: String(form.get('offenceName')).trim(),
        recommendedAction: String(form.get('recommendedAction')).trim(),
        status: String(form.get('status')).trim(),
        reason: String(form.get('reason')).trim(),
        caseOfficer: String(form.get('caseOfficer') || '').trim(),
        notes: String(form.get('notes') || '').trim(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser.uid,
      });
      closeEditor();
      await renderCards(true);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = 'Save changes';
      alert(`Unable to save case: ${error.code || error.message}`);
    }
  };
}

async function removeCase(record) {
  if (!canDelete()) return;
  if (!confirm(`Permanently delete the case for ${record.subjectName || 'this subject'}? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'disciplinaryCases', record.id));
    await renderCards(true);
  } catch (error) {
    console.error(error);
    alert(`Unable to delete case: ${error.code || error.message}`);
  }
}

async function renderCards(force = false) {
  if (rendering || !account) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Compliance & Discipline') return;
  if (!force && panel.dataset.complianceCardsReady === 'true') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'disciplinaryCases'));
    const records = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    panel.querySelector('.compliance-card-grid')?.remove();
    panel.querySelector('.table-wrap')?.remove();
    panel.querySelector('.empty')?.remove();

    const grid = document.createElement('section');
    grid.className = 'compliance-card-grid';
    grid.innerHTML = records.length ? records.map((record, index) => `
      <article class="compliance-case-card ${statusClass(record.status)}" data-case-id="${record.id}">
        <div class="compliance-card-accent"></div>
        <div class="compliance-card-top">
          <div class="compliance-case-icon">⚖</div>
          <span class="compliance-status">${esc(String(record.status || 'OPEN').replaceAll('_', ' '))}</span>
        </div>
        <p class="compliance-eyebrow">COMPLIANCE CASE ${String(index + 1).padStart(2, '0')}</p>
        <h2>${esc(record.subjectName || 'Unnamed subject')}</h2>
        <div class="compliance-offence"><span>Offence</span><strong>${esc(record.offenceName || 'Not recorded')}</strong></div>
        <div class="compliance-details">
          <div><span>Recommended action</span><strong>${esc(record.recommendedAction || 'Not recorded')}</strong></div>
          <div><span>Case officer</span><strong>${esc(record.caseOfficer || record.issuedByName || 'Not recorded')}</strong></div>
          <div><span>Opened</span><strong>${esc(formatDate(record.createdAt))}</strong></div>
          <div><span>Updated</span><strong>${esc(formatDate(record.updatedAt))}</strong></div>
        </div>
        <div class="compliance-summary"><span>Case details</span><p>${esc(record.reason || 'No case details recorded.')}</p></div>
        <div class="compliance-card-actions">
          ${canManage() ? '<button class="compliance-edit" type="button">Edit</button>' : ''}
          ${canDelete() ? '<button class="compliance-delete" type="button">Delete</button>' : ''}
        </div>
      </article>`).join('') : '<div class="compliance-empty">No compliance cases have been recorded.</div>';

    panel.appendChild(grid);
    records.forEach(record => {
      const card = grid.querySelector(`[data-case-id="${CSS.escape(record.id)}"]`);
      card?.querySelector('.compliance-edit')?.addEventListener('click', () => showEditor(record));
      card?.querySelector('.compliance-delete')?.addEventListener('click', () => removeCase(record));
    });
    panel.dataset.complianceCardsReady = 'true';
  } catch (error) {
    console.error('Unable to render compliance cards.', error);
  } finally {
    rendering = false;
  }
}

let timer = null;
function schedule(force = false) {
  clearTimeout(timer);
  timer = setTimeout(() => renderCards(force), 90);
}

const observer = new MutationObserver(() => schedule());
observer.observe(document.getElementById('app'), { childList: true, subtree: false });
window.addEventListener('canela-view-rendered', () => schedule());
window.addEventListener('canela-record-saved', event => {
  if (event.detail?.collection === 'disciplinaryCases') schedule(true);
});

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
  schedule();
});