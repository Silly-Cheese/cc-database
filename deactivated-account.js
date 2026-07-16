import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
  beforeAuthStateChanged,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
const NOTICE_KEY = 'canela-deactivated-account-notice';
let checking = false;

function showDeactivatedModal() {
  document.getElementById('deactivatedAccountModal')?.remove();
  document.documentElement.classList.add('deactivated-account-open');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="deactivated-account-backdrop" id="deactivatedAccountModal" role="dialog" aria-modal="true" aria-labelledby="deactivatedAccountTitle">
      <section class="deactivated-account-modal">
        <div class="brand-mark large">CC</div>
        <p class="deactivated-eyebrow">ACCOUNT ACCESS NOTICE</p>
        <h1 id="deactivatedAccountTitle">THIS ACCOUNT HAS BEEN DEACTIVATED</h1>
        <p class="deactivated-message">FOR REACTIVATION CONTACT A SYSTEM ADMINISTRATOR!</p>
        <button type="button" id="closeDeactivatedModal">Return to sign in</button>
      </section>
    </div>`);

  const close = document.getElementById('closeDeactivatedModal');
  close?.focus();
  close.onclick = () => {
    sessionStorage.removeItem(NOTICE_KEY);
    document.documentElement.classList.remove('deactivated-account-open');
    document.getElementById('deactivatedAccountModal')?.remove();
  };
}

function rememberAndShow() {
  sessionStorage.setItem(NOTICE_KEY, '1');
  queueMicrotask(showDeactivatedModal);
}

// This runs before the portal's regular auth-state observer. It prevents a
// disabled account from ever being rendered as an authenticated portal user.
beforeAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous || checking) return;

  checking = true;
  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;

    const status = String(snapshot.data().portalStatus || '').trim().toUpperCase();
    if (status === 'ACTIVE') return;

    rememberAndShow();
    throw new Error('CANELA_ACCOUNT_DEACTIVATED');
  } finally {
    checking = false;
  }
});

// Fallback for remembered sessions and any browser that restores Firebase
// authentication before the sign-in form is submitted.
onAuthStateChanged(auth, async user => {
  if (!user) {
    if (sessionStorage.getItem(NOTICE_KEY) === '1') showDeactivatedModal();
    return;
  }
  if (user.isAnonymous) return;

  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;
    const status = String(snapshot.data().portalStatus || '').trim().toUpperCase();
    if (status === 'ACTIVE') return;

    rememberAndShow();
    await signOut(auth);
  } catch (error) {
    if (error?.message !== 'CANELA_ACCOUNT_DEACTIVATED') {
      console.error('Unable to verify account activation status.', error);
    }
  }
});

if (sessionStorage.getItem(NOTICE_KEY) === '1') {
  window.addEventListener('DOMContentLoaded', showDeactivatedModal, { once: true });
}
