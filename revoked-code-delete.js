import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());

function enhanceRevokedCodes() {
  const table = document.querySelector('.account-admin-section table');
  if (!table) return;

  [...table.querySelectorAll('tbody tr')].forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return;
    const status = cells[2].textContent.trim().toUpperCase();
    if (status !== 'REVOKED' || cells[4].querySelector('.delete-revoked-code')) return;

    const codeText = cells[3].querySelector('code')?.textContent?.trim() || 'this code';
    const allRows = [...table.querySelectorAll('tbody tr')];
    const index = allRows.indexOf(row);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'crud-edit delete-revoked-code';
    button.textContent = 'Delete';
    button.onclick = async () => {
      if (!confirm(`Permanently delete the revoked activation code ${codeText}? This cannot be undone.`)) return;
      try {
        const response = await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js');
        const snapshot = await response.getDocs(response.collection(db, 'activationCodes'));
        const matching = snapshot.docs.find(item => (item.data().plainCode || '').trim() === codeText) || snapshot.docs[index];
        if (!matching) throw new Error('Activation code record not found.');
        await deleteDoc(doc(db, 'activationCodes', matching.id));
        row.remove();
      } catch (error) {
        console.error(error);
        alert(`Unable to delete the code: ${error.code || error.message}`);
      }
    };
    cells[4].replaceChildren(button);
  });
}

const observer = new MutationObserver(enhanceRevokedCodes);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
setInterval(enhanceRevokedCodes, 750);
