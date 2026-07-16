import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let account = null;
let rendering = false;
let editingId = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function canManage() {
  const roles = account?.systemRoles || [];
  const permissions = account?.permissions || [];
  return roles.includes('SYSTEM_OWNER') || roles.includes('SYSTEM_ADMINISTRATOR') || permissions.includes('*') || permissions.includes('training.manage');
}

async function loadAccount() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
  account = snapshot.exists() ? snapshot.data() : null;
  return account;
}

function dateText(value) {
  if (!value) return 'Not recorded';
  if (typeof value === 'string') return value;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  return 'Not recorded';
}

function openModal(record = {}, id = null) {
  editingId = id;
  document.getElementById('internshipModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="internshipModal">
      <section class="crud-modal">
        <div class="crud-heading">
          <div><p>${id ? 'EDIT COMPLETION' : 'NEW COMPLETION'}</p><h2>${id ? 'Update internship record' : 'Add completed internship'}</h2></div>
          <button type="button" id="closeInternshipModal">×</button>
        </div>
        <form id="internshipForm" class="crud-form">
          <label>Display name<input name="displayName" value="${esc(record.displayName)}" required></label>
          <label>Roblox username<input name="robloxUsername" value="${esc(record.robloxUsername)}" required></label>
          <label>Department<input name="department" value="${esc(record.department)}" required></label>
          <label>Internship title<input name="internshipTitle" value="${esc(record.internshipTitle || 'Department Internship')}" required></label>
          <label>Completion date<input name="completionDate" type="date" value="${esc(record.completionDate)}" required></label>
          <label>Final score<input name="finalScore" type="number" min="0" max="100" value="${esc(record.finalScore)}"></label>
          <label>Supervisor<input name="supervisor" value="${esc(record.supervisor)}"></label>
          <label>Promoted rank<input name="promotedRank" value="${esc(record.promotedRank)}"></label>
          <label class="staff-notes-field">Notes<textarea name="notes">${esc(record.notes)}</textarea></label>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelInternshipModal">Cancel</button>
            <button type="submit">${id ? 'Save changes' : 'Add completion'}</button>
          </div>
        </form>
      </section>
    </div>`);
  document.getElementById('closeInternshipModal').onclick = closeModal;
  document.getElementById('cancelInternshipModal').onclick = closeModal;
  document.getElementById('internshipForm').onsubmit = saveRecord;
}

function closeModal() {
  document.getElementById('internshipModal')?.remove();
  editingId = null;
}

async function saveRecord(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const scoreRaw = String(form.get('finalScore') || '').trim();
    const data = {
      displayName: String(form.get('displayName')).trim(),
      robloxUsername: String(form.get('robloxUsername')).trim(),
      department: String(form.get('department')).trim(),
      internshipTitle: String(form.get('internshipTitle')).trim(),
      completionDate: String(form.get('completionDate')).trim(),
      finalScore: scoreRaw ? Number(scoreRaw) : null,
      supervisor: String(form.get('supervisor') || '').trim(),
      promotedRank: String(form.get('promotedRank') || '').trim(),
      notes: String(form.get('notes') || '').trim(),
      status: 'COMPLETED',
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    };
    if (editingId) await updateDoc(doc(db, 'internshipCompletions', editingId), data);
    else await addDoc(collection(db, 'internshipCompletions'), { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });
    closeModal();
    renderTraining(true);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = editingId ? 'Save changes' : 'Add completion';
    alert(`Unable to save internship completion: ${error.code || error.message}`);
  }
}

async function editRecord(id) {
  const snapshot = await getDoc(doc(db, 'internshipCompletions', id));
  if (!snapshot.exists()) return alert('Completion record not found.');
  openModal(snapshot.data(), id);
}

async function removeRecord(id, name) {
  if (!confirm(`Delete ${name}'s internship completion record?`)) return;
  try {
    await deleteDoc(doc(db, 'internshipCompletions', id));
    renderTraining(true);
  } catch (error) {
    alert(`Unable to delete record: ${error.code || error.message}`);
  }
}

async function renderTraining(force = false) {
  if (rendering || !auth.currentUser || auth.currentUser.isAnonymous) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Training & Workforce') return;
  if (!force && panel.dataset.internshipsReady === 'true') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'internshipCompletions'));
    const records = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    panel.innerHTML = `
      <div class="section-head internship-heading">
        <div><p>TRAINING & HR</p><h1>Completed Internships</h1></div>
        <div class="internship-heading-actions"><span>${records.length} completed</span>${canManage() ? '<button id="addInternshipCompletion" class="crud-add">+ Add completion</button>' : ''}</div>
      </div>
      <p class="account-help">A permanent record of staff members who successfully completed a Canela internship.</p>
      <section class="internship-card-grid">
        ${records.length ? records.map((record, index) => `
          <article class="internship-card">
            <div class="internship-card-top"><span>COMPLETED</span><strong>${esc(record.department || 'Canela')}</strong></div>
            <div class="internship-person"><div class="staff-avatar">${esc((record.displayName || record.robloxUsername || 'C').split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase())}</div><div><h2>${esc(record.displayName || record.robloxUsername || 'Unnamed')}</h2><p>@${esc(record.robloxUsername || 'unknown')}</p></div></div>
            <div class="internship-title">${esc(record.internshipTitle || 'Department Internship')}</div>
            <div class="internship-details">
              <div><span>Completed</span><strong>${esc(dateText(record.completionDate))}</strong></div>
              <div><span>Final score</span><strong>${record.finalScore === null || record.finalScore === undefined ? 'Not recorded' : `${esc(record.finalScore)}%`}</strong></div>
              <div><span>Supervisor</span><strong>${esc(record.supervisor || 'Not recorded')}</strong></div>
              <div><span>Promoted rank</span><strong>${esc(record.promotedRank || 'Not recorded')}</strong></div>
            </div>
            ${record.notes ? `<p class="internship-notes">${esc(record.notes)}</p>` : ''}
            <div class="internship-footer"><span>Completion ${String(index + 1).padStart(2,'0')}</span>${canManage() ? `<div><button class="crud-edit internship-edit" data-id="${record.id}">Edit</button><button class="internship-delete" data-id="${record.id}" data-name="${esc(record.displayName || record.robloxUsername || 'this person')}">Delete</button></div>` : ''}</div>
          </article>`).join('') : '<div class="staff-empty-card"><div class="staff-avatar">HR</div><h2>No completed internships yet</h2><p>Add the first completion record when an intern graduates.</p></div>'}
      </section>`;

    document.getElementById('addInternshipCompletion')?.addEventListener('click', () => openModal());
    panel.querySelectorAll('.internship-edit').forEach(button => button.onclick = () => editRecord(button.dataset.id));
    panel.querySelectorAll('.internship-delete').forEach(button => button.onclick = () => removeRecord(button.dataset.id, button.dataset.name));
    panel.dataset.internshipsReady = 'true';
  } catch (error) {
    console.error('Unable to render completed internships.', error);
    panel.innerHTML = '<h1>Completed Internships</h1><p class="error">Unable to load internship records. Publish the latest Firestore rules.</p>';
  } finally {
    rendering = false;
  }
}

let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => renderTraining(), 150);
}

const observer = new MutationObserver(schedule);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) return;
  await loadAccount();
  schedule();
});
