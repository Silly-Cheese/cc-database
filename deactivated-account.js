import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth,
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
let handling = false;

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
  if (close) {
    close.onclick = () => {
      sessionStorage.removeItem(NOTICE_KEY);
      document.documentElement.classList.remove('deactivated-account-open');
      document.getElementById('deactivatedAccountModal')?.remove();
    };
  }
}

function rememberNotice() {
  sessionStorage.setItem(NOTICE_KEY, '1');
  window.setTimeout(showDeactivatedModal, 0);
}

onAuthStateChanged(auth, async user => {
  if (handling) return;

  if (!user) {
    if (sessionStorage.getItem(NOTICE_KEY) === '1') {
      window.setTimeout(showDeactivatedModal, 0);
    }
    return;
  }

  if (user.isAnonymous) return;

  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;

    const status = String(snapshot.data().portalStatus || '').trim().toUpperCase();
    if (status === 'ACTIVE') {
      sessionStorage.removeItem(NOTICE_KEY);
      return;
    }

    handling = true;
    rememberNotice();

    try {
      await signOut(auth);
    } finally {
      handling = false;
      window.setTimeout(showDeactivatedModal, 0);
    }
  } catch (error) {
    console.error('Unable to verify account activation status.', error);
  }
});

if (sessionStorage.getItem(NOTICE_KEY) === '1') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', showDeactivatedModal, { once: true });
  } else {
    showDeactivatedModal();
  }
}
