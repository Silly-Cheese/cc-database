import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let enhancing = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

async function getActiveAccounts() {
  const snapshot = await getDocs(collection(db, 'portalAccounts'));
  return snapshot.docs
    .map(item => ({ uid: item.id, ...item.data() }))
    .filter(item => String(item.portalStatus || '').toUpperCase() === 'ACTIVE')
    .sort((a, b) => String(a.displayName || a.portalUsername || '').localeCompare(String(b.displayName || b.portalUsername || '')));
}

async function enhanceComplianceCreateModal() {
  if (enhancing) return;
  const modal = document.getElementById('crudModal');
  const form = modal?.querySelector('#crudForm');
  const heading = modal?.querySelector('.crud-heading h2')?.textContent?.trim() || '';
  const eyebrow = modal?.querySelector('.crud-heading p')?.textContent?.trim() || '';

  if (!form || heading !== 'Add to disciplinaryCases' || eyebrow !== 'NEW RECORD' || form.dataset.caseOfficerReady === 'true') return;

  enhancing = true;
  form.dataset.caseOfficerReady = 'true';

  try {
    const accounts = await getActiveAccounts();
    const statusLabel = form.querySelector('select[name="status"]')?.closest('label');
    const officerMarkup = `<label>Assigned case officer
      <select name="caseOfficerUid" required>
        <option value="">Select an active account…</option>
        ${accounts.map(item => `<option value="${esc(item.uid)}">${esc(item.displayName || item.portalUsername || 'Unnamed account')} — @${esc(item.portalUsername || 'unknown')} · ${esc(item.organizationalRank || 'Staff')}</option>`).join('')}
      </select>
      <small>The selected account will be stored as the officer responsible for this case.</small>
    </label>`;

    if (statusLabel) statusLabel.insertAdjacentHTML('afterend', officerMarkup);
    else form.querySelector('.crud-actions')?.insertAdjacentHTML('beforebegin', officerMarkup);

    form.onsubmit = async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('[type="submit"]');
      const data = new FormData(event.currentTarget);
      const officerUid = String(data.get('caseOfficerUid') || '').trim();
      const officer = accounts.find(item => item.uid === officerUid);

      if (!officer) {
        alert('Select an active portal account as the case officer.');
        return;
      }

      button.disabled = true;
      button.textContent = 'Creating…';

      try {
        await addDoc(collection(db, 'disciplinaryCases'), {
          subjectName: String(data.get('subjectName') || '').trim(),
          offenceName: String(data.get('offenceName') || '').trim(),
          recommendedAction: String(data.get('recommendedAction') || '').trim(),
          reason: String(data.get('reason') || '').trim(),
          status: String(data.get('status') || 'OPEN').trim(),
          caseOfficerUid: officer.uid,
          caseOfficer: officer.displayName || officer.portalUsername || officer.uid,
          caseOfficerUsername: officer.portalUsername || '',
          caseOfficerRank: officer.organizationalRank || '',
          issuedBy: auth.currentUser.uid,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp(),
          updatedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp(),
        });

        document.getElementById('crudModal')?.remove();
        window.dispatchEvent(new CustomEvent('canela-record-saved', { detail: { collection: 'disciplinaryCases' } }));
        location.reload();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = 'Create record';
        alert(`Unable to create compliance case: ${error.code || error.message}`);
      }
    };
  } catch (error) {
    console.error('Unable to load active accounts for case officer assignment.', error);
    form.dataset.caseOfficerReady = 'false';
  } finally {
    enhancing = false;
  }
}

let timer;
const schedule = () => {
  clearTimeout(timer);
  timer = setTimeout(enhanceComplianceCreateModal, 80);
};

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
