import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const personnelAuth = getAuth(getApp());
const personnelDb = getFirestore(getApp());
let personnelRendering = false;
let personnelLastPanel = null;

const personnelEsc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function personnelStatusClass(status) {
  const value = String(status || 'PENDING').toUpperCase();
  if (value === 'APPROVED') return 'is-approved';
  if (value === 'DENIED') return 'is-denied';
  if (value === 'WITHDRAWN') return 'is-withdrawn';
  return 'is-pending';
}

function personnelActionIcon(action) {
  const icons = {
    PROMOTION: '↑', DEMOTION: '↓', TRANSFER: '⇄', LEAVE: '◷',
    SUSPENSION: 'Ⅱ', RESIGNATION: '↪', TERMINATION: '×',
  };
  return icons[String(action || '').toUpperCase()] || '↕';
}

async function waitForCrud() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.CanelaCrud?.editPersonnel && window.CanelaCrud?.deletePersonnel) {
      return window.CanelaCrud;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

function currentPersonnelPanel() {
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  return title === 'Personnel Actions' ? panel : null;
}

async function renderPersonnelCards(force = false) {
  const panel = currentPersonnelPanel();
  if (!panel || personnelRendering || !personnelAuth.currentUser || personnelAuth.currentUser.isAnonymous) return;
  if (!force && panel === personnelLastPanel && panel.dataset.personnelCardsReady === 'true') return;

  personnelRendering = true;
  try {
    const snapshot = await getDocs(collection(personnelDb, 'personnelActions'));
    const records = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));

    panel.querySelector('.personnel-card-grid')?.remove();
    panel.querySelector('.table-wrap')?.remove();
    panel.querySelector('.empty')?.remove();

    const addButton = panel.querySelector('.crud-add');
    if (addButton) {
      addButton.onclick = async () => {
        const crud = await waitForCrud();
        if (crud?.createPersonnel) crud.createPersonnel();
        else alert('The personnel editor could not load. Refresh the page and try again.');
      };
    }

    if (!records.length) {
      panel.insertAdjacentHTML('beforeend', '<div class="empty">No personnel actions have been recorded.</div>');
      panel.dataset.personnelCardsReady = 'true';
      personnelLastPanel = panel;
      return;
    }

    const cards = document.createElement('section');
    cards.className = 'personnel-card-grid';

    records.forEach((record, index) => {
      const staff = String(record.staffName || record.displayName || `Staff Member ${index + 1}`).trim();
      const action = String(record.actionType || 'PERSONNEL_ACTION').trim().toUpperCase();
      const reason = String(record.reason || 'No reason recorded.').trim();
      const status = String(record.status || 'PENDING').trim().toUpperCase();

      const card = document.createElement('article');
      card.className = 'personnel-action-card';
      card.dataset.recordId = record.id;
      card.innerHTML = `
        <div class="personnel-card-accent"></div>
        <div class="personnel-card-header">
          <div class="personnel-action-icon">${personnelActionIcon(action)}</div>
          <span class="personnel-status ${personnelStatusClass(status)}"><i></i>${personnelEsc(status.replaceAll('_', ' '))}</span>
        </div>
        <div class="personnel-card-body">
          <p class="personnel-eyebrow">PERSONNEL ACTION ${String(index + 1).padStart(2, '0')}</p>
          <h2>${personnelEsc(staff)}</h2>
          <div class="personnel-action-pill">${personnelEsc(action.replaceAll('_', ' '))}</div>
          <div class="personnel-reason"><span>Reason</span><p>${personnelEsc(reason)}</p></div>
        </div>
        <div class="personnel-card-footer">
          <button class="personnel-edit" type="button">Edit</button>
          <button class="personnel-delete" type="button">Delete</button>
        </div>`;

      card.querySelector('.personnel-edit').onclick = async event => {
        event.preventDefault();
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const crud = await waitForCrud();
          if (!crud?.editPersonnel) throw new Error('The personnel editor did not initialize.');
          await crud.editPersonnel(record.id);
        } catch (error) {
          console.error(error);
          alert(`${error.message} Refresh the page and try again.`);
        } finally {
          button.disabled = false;
        }
      };

      card.querySelector('.personnel-delete').onclick = async event => {
        event.preventDefault();
        const crud = await waitForCrud();
        if (!crud?.deletePersonnel) {
          alert('Delete controls could not load. Refresh the page and try again.');
          return;
        }
        await crud.deletePersonnel(record.id, `${staff}'s ${action.toLowerCase().replaceAll('_', ' ')} record`);
      };

      cards.appendChild(card);
    });

    panel.appendChild(cards);
    panel.dataset.personnelCardsReady = 'true';
    personnelLastPanel = panel;
  } catch (error) {
    console.error('Unable to render personnel cards.', error);
  } finally {
    personnelRendering = false;
  }
}

let personnelTimer = null;
function schedulePersonnelCards(force = false) {
  clearTimeout(personnelTimer);
  personnelTimer = setTimeout(() => renderPersonnelCards(force), 120);
}

const appRoot = document.getElementById('app');
const personnelObserver = new MutationObserver(() => schedulePersonnelCards(false));
personnelObserver.observe(appRoot, { childList: true, subtree: false });

window.addEventListener('canela-view-rendered', () => schedulePersonnelCards(true));
window.addEventListener('canela-record-saved', event => {
  if (event.detail?.collection === 'personnelActions') schedulePersonnelCards(true);
});
window.addEventListener('canela-record-deleted', event => {
  if (event.detail?.collection === 'personnelActions') schedulePersonnelCards(true);
});
window.addEventListener('canela-crud-ready', () => schedulePersonnelCards(false));
onAuthStateChanged(personnelAuth, () => schedulePersonnelCards(true));
schedulePersonnelCards(true);
