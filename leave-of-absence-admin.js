import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let enhancing = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const dateInputValue = value => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const toTimestamp = value => value ? Timestamp.fromDate(new Date(`${value}T12:00:00`)) : null;

async function enhanceAccountEditor() {
  if (enhancing) return;
  const modal = document.getElementById('activeAccountEditor');
  const form = modal?.querySelector('#activeAccountForm');
  if (!form || form.dataset.loaEnhanced === 'true') return;

  enhancing = true;
  try {
    const uid = window.CanelaAccountEditorCurrentUid || null;
    const usernameInput = form.querySelector('input[disabled]');
    let accountUid = uid;

    if (!accountUid) {
      const cards = [...document.querySelectorAll('[data-account-uid]')];
      const username = usernameInput?.value?.trim();
      accountUid = cards.find(card => card.textContent.includes(username))?.dataset.accountUid || null;
    }

    // The existing editor does not expose its selected UID, so capture it from the open function.
    accountUid = accountUid || window.__canelaEditingAccountUid || null;
    if (!accountUid) return;

    const snapshot = await getDoc(doc(db, 'portalAccounts', accountUid));
    if (!snapshot.exists()) return;
    const record = snapshot.data();
    const active = record.loaActive === true;

    const permissions = form.querySelector('.permission-selector');
    permissions?.insertAdjacentHTML('beforebegin', `
      <section class="loa-admin-panel">
        <div class="loa-admin-heading">
          <div><strong>Leave of Absence</strong><span>Temporarily block this account from entering the portal.</span></div>
          <label class="loa-toggle"><input type="checkbox" name="loaActive" ${active ? 'checked' : ''}><span></span></label>
        </div>
        <div class="loa-admin-grid">
          <label>LOA begins<input type="date" name="loaStartDate" value="${esc(dateInputValue(record.loaStartDate))}"></label>
          <label>LOA ends<input type="date" name="loaEndDate" value="${esc(dateInputValue(record.loaEndDate))}"></label>
          <label class="full">Reason or administrative note<textarea name="loaReason" rows="3" placeholder="Optional reason shown to the account holder…">${esc(record.loaReason || '')}</textarea></label>
        </div>
        <p class="loa-admin-help">While active, the user will see a blocking notice and may either stay signed out or end the leave early.</p>
      </section>`);

    form.dataset.loaEnhanced = 'true';
    const originalSubmit = form.onsubmit;
    form.onsubmit = async event => {
      event.preventDefault();
      const data = new FormData(form);
      const loaActive = data.get('loaActive') === 'on';
      const startRaw = String(data.get('loaStartDate') || '');
      const endRaw = String(data.get('loaEndDate') || '');
      if (loaActive && !endRaw) {
        alert('An LOA end date is required when Leave of Absence is active.');
        return;
      }
      if (loaActive && startRaw && new Date(`${endRaw}T12:00:00`) < new Date(`${startRaw}T12:00:00`)) {
        alert('The LOA end date cannot be before the start date.');
        return;
      }

      try {
        await updateDoc(doc(db, 'portalAccounts', accountUid), {
          loaActive,
          loaStartDate: toTimestamp(startRaw) || (loaActive ? serverTimestamp() : null),
          loaEndDate: toTimestamp(endRaw),
          loaReason: String(data.get('loaReason') || '').trim(),
          loaUpdatedAt: serverTimestamp(),
          loaUpdatedBy: auth.currentUser.uid,
          ...(loaActive ? { loaEndedEarlyAt: null, loaEndedEarlyBy: null } : {}),
        });
        await originalSubmit?.call(form, event);
      } catch (error) {
        console.error('Unable to update Leave of Absence.', error);
        alert(`Unable to update Leave of Absence: ${error.code || error.message}`);
      }
    };
  } catch (error) {
    console.error('Unable to enhance account editor with LOA controls.', error);
  } finally {
    enhancing = false;
  }
}

// Wrap the public editor opener so the selected UID is available to this enhancement.
const wrapEditor = () => {
  if (!window.CanelaAccountEditor?.open || window.CanelaAccountEditor.__loaWrapped) return;
  const originalOpen = window.CanelaAccountEditor.open;
  window.CanelaAccountEditor.open = async uid => {
    window.__canelaEditingAccountUid = uid;
    return originalOpen(uid);
  };
  window.CanelaAccountEditor.__loaWrapped = true;
};

window.addEventListener('canela-account-editor-ready', wrapEditor);
wrapEditor();
new MutationObserver(() => { wrapEditor(); enhanceAccountEditor(); }).observe(document.body, { childList: true, subtree: true });
