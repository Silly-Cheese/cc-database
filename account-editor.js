import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let editingUid = null;

const PERMISSION_GROUPS = [
  ['Staff & Organization', [
    ['staff.manage', 'Manage staff profiles'],
    ['organization.manage', 'Manage ranks, departments, and teams'],
    ['personnel.approve', 'Approve personnel actions'],
    ['promotions.create', 'Create promotions'],
    ['promotions.approve', 'Approve promotions'],
  ]],
  ['Quotas & Communications', [
    ['quotas.manage', 'Manage quota requirements'],
    ['quotas.review', 'Review quota submissions'],
    ['announcements.manage', 'Manage announcements'],
    ['messages.manage', 'Manage internal messages'],
    ['forms.manage', 'Manage forms and responses'],
  ]],
  ['Compliance', [
    ['discipline.manage', 'Manage discipline and offences'],
    ['blacklists.manage', 'Manage blacklists'],
    ['appeals.review', 'Review appeals'],
    ['audit.read', 'View audit logs'],
  ]],
  ['Public Relations', [
    ['alliances.manage', 'Manage alliances'],
    ['applications.manage', 'Manage application forms'],
    ['applications.review', 'Review applications'],
  ]],
  ['Training & HR', [
    ['training.manage', 'Manage training and internships'],
    ['training.assign', 'Assign training'],
    ['training.grade', 'Grade training attempts'],
    ['reviews.submit', 'Submit performance reviews'],
    ['reviews.approve', 'Approve performance reviews'],
    ['reviews.manage', 'Manage review templates'],
    ['goals.manage', 'Manage goals'],
    ['recognitions.manage', 'Manage recognition records'],
    ['leave.approve', 'Approve leave requests'],
    ['attendance.manage', 'Manage attendance'],
  ]],
  ['Documents', [
    ['documents.manage', 'Manage policies and documents'],
  ]],
];

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function closeEditor() {
  document.getElementById('activeAccountEditor')?.remove();
  editingUid = null;
}

function permissionMarkup(selected = []) {
  return PERMISSION_GROUPS.map(([title, permissions]) => `
    <fieldset class="permission-group">
      <legend>${title}</legend>
      ${permissions.map(([value, label]) => `
        <label class="permission-option">
          <input type="checkbox" name="permissions" value="${value}" ${selected.includes(value) ? 'checked' : ''}>
          <span><strong>${label}</strong><small>${value}</small></span>
        </label>`).join('')}
    </fieldset>`).join('');
}

async function openAccountEditor(uid) {
  const snapshot = await getDoc(doc(db, 'portalAccounts', uid));
  if (!snapshot.exists()) return alert('Portal account not found.');

  editingUid = uid;
  const record = snapshot.data();
  const roles = Array.isArray(record.systemRoles) ? record.systemRoles : [];
  const permissions = Array.isArray(record.permissions) ? record.permissions : [];
  const isOwner = roles.includes('SYSTEM_OWNER');
  const activationReference = record.activationCodeHash || 'Not available';

  document.getElementById('activeAccountEditor')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="crud-backdrop" id="activeAccountEditor">
      <section class="crud-modal account-code-modal">
        <div class="crud-heading">
          <div><p>ACTIVE PORTAL ACCOUNT</p><h2>Edit account access</h2></div>
          <button type="button" id="closeActiveAccountEditor">×</button>
        </div>
        <form id="activeAccountForm" class="crud-form">
          <label>Display name<input name="displayName" value="${esc(record.displayName)}" required></label>
          <label>Portal username<input value="${esc(record.portalUsername)}" disabled></label>
          <label>Organizational rank<input name="organizationalRank" value="${esc(record.organizationalRank)}" required></label>
          <label>Staff profile ID<input name="staffProfileId" value="${esc(record.staffProfileId)}"></label>
          <label>Account status
            <select name="portalStatus" ${uid === auth.currentUser.uid || isOwner ? 'disabled' : ''}>
              <option value="ACTIVE" ${record.portalStatus === 'ACTIVE' ? 'selected' : ''}>Active</option>
              <option value="DISABLED" ${record.portalStatus === 'DISABLED' ? 'selected' : ''}>Disabled</option>
            </select>
          </label>
          <label>System role
            <select name="systemRole" ${isOwner ? 'disabled' : ''}>
              <option value="" ${roles.length === 0 ? 'selected' : ''}>No system role</option>
              <option value="DATA_ADMINISTRATOR" ${roles.includes('DATA_ADMINISTRATOR') ? 'selected' : ''}>Data Administrator</option>
              <option value="AUDITOR" ${roles.includes('AUDITOR') ? 'selected' : ''}>Auditor</option>
              <option value="SYSTEM_ADMINISTRATOR" ${roles.includes('SYSTEM_ADMINISTRATOR') && !isOwner ? 'selected' : ''}>System Administrator</option>
              ${isOwner ? '<option value="SYSTEM_OWNER" selected>System Owner</option>' : ''}
            </select>
          </label>
          <div class="activation-lockbox">
            <div><strong>Authorization code</strong><span>Locked after redemption</span></div>
            <code>${esc(activationReference)}</code>
            <p>The original authorization code and redemption history cannot be edited from this screen.</p>
          </div>
          <div class="permission-selector">
            <div class="permission-selector-heading">
              <div><strong>Permissions</strong><span>Adjust what this active account can access and manage.</span></div>
              <div class="permission-selector-actions">
                <button type="button" id="selectAccountPermissions">Select all</button>
                <button type="button" id="clearAccountPermissions">Clear</button>
              </div>
            </div>
            <div class="permission-grid">${permissionMarkup(permissions)}</div>
          </div>
          <div class="crud-actions">
            <button type="button" class="secondary" id="cancelActiveAccountEditor">Cancel</button>
            <button type="submit">Save account changes</button>
          </div>
        </form>
      </section>
    </div>`);

  document.getElementById('closeActiveAccountEditor').onclick = closeEditor;
  document.getElementById('cancelActiveAccountEditor').onclick = closeEditor;
  document.getElementById('selectAccountPermissions').onclick = () => {
    document.querySelectorAll('#activeAccountForm input[name="permissions"]').forEach(input => { input.checked = true; });
  };
  document.getElementById('clearAccountPermissions').onclick = () => {
    document.querySelectorAll('#activeAccountForm input[name="permissions"]').forEach(input => { input.checked = false; });
  };
  document.getElementById('activeAccountForm').onsubmit = event => saveAccount(event, record, isOwner);
}

async function saveAccount(event, original, isOwner) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';

  try {
    const role = isOwner ? 'SYSTEM_OWNER' : String(form.get('systemRole') || '').trim();
    const systemRoles = isOwner
      ? Array.from(new Set([...(original.systemRoles || []), 'SYSTEM_OWNER', 'SYSTEM_ADMINISTRATOR']))
      : (role ? [role] : []);
    const portalStatus = (editingUid === auth.currentUser.uid || isOwner)
      ? original.portalStatus
      : String(form.get('portalStatus') || original.portalStatus || 'ACTIVE');

    await updateDoc(doc(db, 'portalAccounts', editingUid), {
      displayName: String(form.get('displayName') || '').trim(),
      organizationalRank: String(form.get('organizationalRank') || '').trim(),
      staffProfileId: String(form.get('staffProfileId') || '').trim(),
      portalStatus,
      systemRoles,
      permissions: form.getAll('permissions').map(String),
      accountEditedAt: serverTimestamp(),
      accountEditedBy: auth.currentUser.uid,
    });

    closeEditor();
    window.dispatchEvent(new CustomEvent('canela-account-status-changed'));
    alert('Account changes saved.');
  } catch (error) {
    console.error(error);
    button.disabled = false;
    button.textContent = 'Save account changes';
    alert(`Unable to update account: ${error.code || error.message}`);
  }
}

window.CanelaAccountEditor = { open: openAccountEditor };
window.dispatchEvent(new CustomEvent('canela-account-editor-ready'));
