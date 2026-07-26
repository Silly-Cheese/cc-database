import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let checking = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toDate = value => value?.toDate ? value.toDate() : new Date(value);
const dateText = value => {
  if (!value) return 'an unspecified date';
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? 'an unspecified date' : date.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });
};
const timestampMs = value => {
  if (!value) return 0;
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

async function endedEarly(uid, account) {
  const events = query(
    collection(db, 'notifications'),
    where('recipientUid', '==', uid),
    where('type', '==', 'LOA_ENDED_EARLY')
  );
  const snapshot = await getDocs(events);
  const loaStart = timestampMs(account.loaStartDate || account.loaUpdatedAt);
  return snapshot.docs.some(item => {
    const data = item.data();
    return timestampMs(data.createdAt) >= loaStart;
  });
}

function closeModal() {
  document.documentElement.classList.remove('loa-access-open');
  document.getElementById('loaAccessModal')?.remove();
}

function showModal(account) {
  closeModal();
  document.documentElement.classList.add('loa-access-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="loa-access-backdrop" id="loaAccessModal" role="dialog" aria-modal="true" aria-labelledby="loaAccessTitle">
      <section class="loa-access-modal">
        <div class="loa-access-icon">🌙</div>
        <p class="loa-access-eyebrow">ACCOUNT STATUS</p>
        <h1 id="loaAccessTitle">You are on Leave of Absence</h1>
        <p class="loa-access-summary">Your portal access is paused until <strong>${esc(dateText(account.loaEndDate))}</strong>.</p>
        <div class="loa-access-details">
          <div><span>Leave ends</span><strong>${esc(dateText(account.loaEndDate))}</strong></div>
          ${account.loaReason ? `<div class="full"><span>Note</span><p>${esc(account.loaReason)}</p></div>` : ''}
        </div>
        <p class="loa-access-note">Ending your leave early immediately restores access and records the date you returned.</p>
        <div class="loa-access-actions">
          <button type="button" class="loa-access-secondary" id="staySignedOut">Stay Signed Out</button>
          <button type="button" class="loa-access-primary" id="endLoaEarly">End LOA Early</button>
        </div>
        <div class="loa-access-error" id="loaAccessError" hidden></div>
      </section>
    </div>`);

  document.getElementById('staySignedOut').onclick = async () => {
    closeModal();
    await signOut(auth);
  };

  document.getElementById('endLoaEarly').onclick = async event => {
    const button = event.currentTarget;
    const errorBox = document.getElementById('loaAccessError');
    button.disabled = true;
    button.textContent = 'Restoring access…';
    errorBox.hidden = true;
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientUid: auth.currentUser.uid,
        audience: 'PRIVATE',
        type: 'LOA_ENDED_EARLY',
        title: 'Leave of Absence ended early',
        message: 'The account holder ended their Leave of Absence early and portal access was restored.',
        loaEndDate: account.loaEndDate || null,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser.uid,
        read: false,
      });
      closeModal();
      window.dispatchEvent(new CustomEvent('canela-loa-ended-early'));
    } catch (error) {
      console.error('Unable to end LOA early.', error);
      errorBox.textContent = `Unable to restore access: ${error.code || error.message}`;
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = 'End LOA Early';
    }
  };
}

document.addEventListener('keydown', event => {
  if (document.documentElement.classList.contains('loa-access-open') && event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);

onAuthStateChanged(auth, async user => {
  closeModal();
  if (checking || !user || user.isAnonymous) return;
  checking = true;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;
    const account = snapshot.data();
    if (account.loaActive !== true) return;

    const now = Date.now();
    const starts = timestampMs(account.loaStartDate);
    const ends = timestampMs(account.loaEndDate);
    if (starts && now < starts) return;
    if (ends && now > ends) return;
    if (await endedEarly(user.uid, account)) return;

    showModal(account);
  } catch (error) {
    console.error('Unable to verify Leave of Absence status.', error);
  } finally {
    checking = false;
  }
});
