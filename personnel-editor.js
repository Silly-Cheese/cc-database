import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let editingId = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function closePersonnelEditor() {
  document.getElementById('personnelEditorModal')?.remove();
  editingId = null;
}

function actionFields(record = {}) {
  const action = record.actionType || 'PROMOTION';
  return `
    <label>Staff member<input name="staffName" value="${esc(record.staffName)}" required></label>
    <label>Action type
      <select name="actionType" id="personnelActionType" required>
        ${['PROMOTION','DEMOTION','TRANSFER','LEAVE','SUSPENSION','RESIGNATION','TERMINATION'].map(value => `<option value="${value}" ${action === value ? 'selected' : ''}>${value.replaceAll('_',' ')}</option>`).join('')}
      </select>
    </label>
    <label>Current rank<input name="currentRank" value="${esc(record.currentRank)}" placeholder="Optional"></label>
    <label>New rank<input name="newRank" value="${esc(record.newRank)}" placeholder="Required for promotions/demotions"></label>
    <label>Current department<input name="currentDepartment" value="${esc(record.currentDepartment)}" placeholder="Optional"></label>
    <label>New department<input name="newDepartment" value="${esc(record.newDepartment)}" placeholder="For transfers"></label>
    <label>Effective date<input name="effectiveDate" type="date" value="${esc(record.effectiveDate)}"></label>
    <label>Status
      <select name="status" ${editingId ? '' : 'disabled'}>
        ${['PENDING','APPROVED','DENIED','WITHDRAWN'].map(value => `<option value="${value}" ${(record.status || 'PENDING') === value ? 'selected' : ''}>${value}</option>`).join('')}
      </select>
      ${editingId ? '' : '<small>New personnel actions are submitted as PENDING.</small>'}
    </label>
    <label class="staff-notes-field">Reason<textarea name="reason" required>${esc(record.reason)}</textarea></label>
    <label class="staff-notes-field">Administrative notes<textarea name="notes">${esc(record.notes)}</textarea></label>`;
}

function openPersonnelEditor(record = {}, id = null) {
  editingId = id;
  document.getElementById('personnelEditorModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="personnelEditorModal">
      <section class="crud-modal">
        <div class="crud-heading">
          <div><p>${id ? 'EDIT PERSONNEL ACTION' : 'NEW PERSONNEL ACTION'}</p><h2>${id ? 'Update personnel record' : 'Create personnel record'}</h2></div>
          <button type="button" id="closePersonnelEditor">×</button>
        </div>
        <form id="personnelEditorForm" class="crud-form">
          ${actionFields(record)}
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelPersonnelEditor">Cancel</button>
            <button type="submit">${id ? 'Save changes' : 'Create personnel record'}</button>
          </div>
        </form>
      </section>
    </div>`);

  document.getElementById('closePersonnelEditor').onclick = closePersonnelEditor;
  document.getElementById('cancelPersonnelEditor').onclick = closePersonnelEditor;
  document.getElementById('personnelEditorForm').onsubmit = savePersonnelRecord;
}

async function savePersonnelRecord(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    if (!auth.currentUser) throw new Error('You are not signed in.');
    const form = new FormData(event.currentTarget);
    const actionType = String(form.get('actionType')).trim();
    const newRank = String(form.get('newRank') || '').trim();
    const newDepartment = String(form.get('newDepartment') || '').trim();

    if (['PROMOTION', 'DEMOTION'].includes(actionType) && !newRank) {
      throw new Error('A new rank is required for promotions and demotions.');
    }
    if (actionType === 'TRANSFER' && !newDepartment) {
      throw new Error('A new department is required for transfers.');
    }

    const data = {
      staffName: String(form.get('staffName')).trim(),
      actionType,
      currentRank: String(form.get('currentRank') || '').trim(),
      newRank,
      currentDepartment: String(form.get('currentDepartment') || '').trim(),
      newDepartment,
      effectiveDate: String(form.get('effectiveDate') || '').trim(),
      reason: String(form.get('reason')).trim(),
      notes: String(form.get('notes') || '').trim(),
      status: editingId ? String(form.get('status') || 'PENDING') : 'PENDING',
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    };

    if (editingId) {
      await updateDoc(doc(db, 'personnelActions', editingId), data);
    } else {
      await addDoc(collection(db, 'personnelActions'), {
        ...data,
        requestedBy: auth.currentUser.uid,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
    }

    closePersonnelEditor();
    window.dispatchEvent(new CustomEvent('canela-record-saved', { detail: { collection: 'personnelActions' } }));
    location.reload();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = editingId ? 'Save changes' : 'Create personnel record';
    alert(`Unable to save personnel record: ${error.code || error.message}`);
  }
}

async function editPersonnel(id) {
  try {
    const snapshot = await getDoc(doc(db, 'personnelActions', id));
    if (!snapshot.exists()) throw new Error('Personnel record not found.');
    openPersonnelEditor(snapshot.data(), id);
  } catch (error) {
    console.error(error);
    alert(`Unable to open personnel record: ${error.code || error.message}`);
  }
}

async function deletePersonnel(id, label = 'this personnel record') {
  if (!confirm(`Permanently delete ${label}? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, 'personnelActions', id));
    window.dispatchEvent(new CustomEvent('canela-record-deleted', { detail: { collection: 'personnelActions', id } }));
    location.reload();
  } catch (error) {
    console.error(error);
    alert(`Unable to delete personnel record: ${error.code || error.message}`);
  }
}

async function installPersonnelEditor() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.CanelaCrud) {
      window.CanelaCrud.createPersonnel = () => openPersonnelEditor();
      window.CanelaCrud.editPersonnel = editPersonnel;
      window.CanelaCrud.deletePersonnel = deletePersonnel;
      window.dispatchEvent(new CustomEvent('canela-crud-ready'));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

installPersonnelEditor();
