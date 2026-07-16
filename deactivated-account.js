import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let handlingDisabledAccount = false;

function showDeactivatedModal() {
  document.getElementById('deactivatedAccountModal')?.remove();
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

  document.getElementById('closeDeactivatedModal').onclick = () => {
    document.getElementById('deactivatedAccountModal')?.remove();
  };
}

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous || handlingDisabledAccount) return;

  try {
    const snapshot = await getDoc(doc(db, 'portalAccounts', user.uid));
    if (!snapshot.exists()) return;

    const status = String(snapshot.data().portalStatus || '').toUpperCase();
    if (status === 'ACTIVE') return;

    handlingDisabledAccount = true;
    showDeactivatedModal();
    try {
      await signOut(auth);
    } finally {
      handlingDisabledAccount = false;
    }
  } catch (error) {
    console.error('Unable to verify account activation status.', error);
  }
});
