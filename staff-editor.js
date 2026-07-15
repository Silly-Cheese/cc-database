import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let editingId = null;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function closeEditor(){ document.getElementById('staffEditorModal')?.remove(); editingId = null; }

function openEditor(record = {}, id = null){
  editingId = id;
  document.getElementById('staffEditorModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="staffEditorModal">
      <section class="crud-modal">
        <div class="crud-heading"><div><p>${id ? 'EDIT STAFF PROFILE' : 'NEW STAFF PROFILE'}</p><h2>${id ? 'Update staff member' : 'Create staff member'}</h2></div><button type="button" id="closeStaffEditor">×</button></div>
        <form id="staffEditorForm" class="crud-form">
          <label>Display name<input name="displayName" value="${esc(record.displayName)}" required></label>
          <label>Roblox username<input name="robloxUsername" value="${esc(record.robloxUsername)}" required></label>
          <label>Discord username<input name="discordUsername" value="${esc(record.discordUsername)}"></label>
          <label>Discord ID<input name="discordId" value="${esc(record.discordId)}"></label>
          <label>Organizational rank<input name="organizationalRank" value="${esc(record.organizationalRank || record.rankName)}" required></label>
          <label>Department<input name="departmentName" value="${esc(record.departmentName || record.department)}"></label>
          <label>Team<input name="teamName" value="${esc(record.teamName || record.team)}"></label>
          <label>Date joined<input name="dateJoined" type="date" value="${esc(record.dateJoined)}"></label>
          <label>Status<select name="staffStatus" required>${['ACTIVE','LEAVE','SUSPENDED','RESIGNED','TERMINATED'].map(status => `<option value="${status}" ${(record.staffStatus || record.status || 'ACTIVE') === status ? 'selected' : ''}>${status.replaceAll('_',' ')}</option>`).join('')}</select></label>
          <label class="staff-notes-field">Notes<textarea name="notes">${esc(record.notes || record.staffNotes)}</textarea></label>
          <div class="crud-actions"><button type="button" class="secondary" id="cancelStaffEditor">Cancel</button><button type="submit">${id ? 'Save changes' : 'Create profile'}</button></div>
        </form>
      </section>
    </div>`);
  document.getElementById('closeStaffEditor').onclick = closeEditor;
  document.getElementById('cancelStaffEditor').onclick = closeEditor;
  document.getElementById('staffEditorForm').onsubmit = saveStaff;
}

async function saveStaff(event){
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true; button.textContent = 'Saving…';
  try{
    const data = {
      displayName: String(form.get('displayName')).trim(),
      robloxUsername: String(form.get('robloxUsername')).trim(),
      discordUsername: String(form.get('discordUsername')).trim(),
      discordId: String(form.get('discordId')).trim(),
      organizationalRank: String(form.get('organizationalRank')).trim(),
      departmentName: String(form.get('departmentName')).trim(),
      teamName: String(form.get('teamName')).trim(),
      dateJoined: String(form.get('dateJoined')).trim(),
      staffStatus: String(form.get('staffStatus')).trim(),
      notes: String(form.get('notes')).trim(),
      updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid,
    };
    if(editingId) await updateDoc(doc(db,'staffProfiles',editingId),data);
    else await addDoc(collection(db,'staffProfiles'),{...data,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid});
    closeEditor();
    window.dispatchEvent(new CustomEvent('canela-record-saved',{detail:{collection:'staffProfiles'}}));
    location.reload();
  }catch(error){ console.error(error); button.disabled=false; button.textContent=editingId?'Save changes':'Create profile'; alert(`Unable to save profile: ${error.code || error.message}`); }
}

async function editStaff(id){ const snapshot = await getDoc(doc(db,'staffProfiles',id)); if(!snapshot.exists()) return alert('Staff profile not found.'); openEditor(snapshot.data(),id); }

async function install(){
  for(let i=0;i<50;i+=1){
    if(window.CanelaCrud){ window.CanelaCrud.editStaff=editStaff; window.CanelaCrud.createStaff=()=>openEditor(); window.dispatchEvent(new CustomEvent('canela-crud-ready')); return; }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
}
install();
