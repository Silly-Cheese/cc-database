import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function initials(name) {
  return String(name || 'Staff').trim().split(/\s+/).slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '').join('') || 'ST';
}

function statusClass(status) {
  const normalized = String(status || 'ACTIVE').trim().toUpperCase();
  if (normalized === 'ACTIVE') return 'is-active';
  if (normalized === 'LEAVE') return 'is-leave';
  if (normalized === 'SUSPENDED') return 'is-suspended';
  if (normalized === 'TERMINATED' || normalized === 'RESIGNED') return 'is-inactive';
  return 'is-neutral';
}

function value(record, ...keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
      return String(record[key]).trim();
    }
  }
  return '';
}

async function waitForCrud() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (window.CanelaCrud?.editStaff && window.CanelaCrud?.createStaff) return window.CanelaCrud;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

async function openEditor(recordId) {
  const crud = await waitForCrud();
  if (!crud) {
    alert('The profile editor could not load. Refresh the page and try again.');
    return;
  }
  await crud.editStaff(recordId);
}

async function openCreator() {
  const crud = await waitForCrud();
  if (!crud) {
    alert('The staff editor could not load. Refresh the page and try again.');
    return;
  }
  crud.createStaff();
}

async function renderStaffCards(force = false) {
  if (rendering || !auth.currentUser || auth.currentUser.isAnonymous) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Staff Directory') return;

  // Do not continuously replace the cards in response to our own DOM changes.
  if (!force && panel.dataset.staffCardsReady === 'true' && panel.querySelector('.staff-card-grid')) return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'staffProfiles'));
    const records = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));

    panel.querySelector('.staff-card-grid')?.remove();
    panel.querySelector('.staff-empty-card')?.remove();
    panel.querySelector('.table-wrap')?.remove();
    panel.querySelector('.empty')?.remove();

    let addButton = panel.querySelector('.crud-add');
    if (!addButton) {
      addButton = document.createElement('button');
      addButton.className = 'crud-add';
      addButton.textContent = '+ Add staff profile';
      panel.querySelector('.section-head')?.appendChild(addButton);
    }
    if (addButton) {
      addButton.textContent = '+ Add staff profile';
      addButton.onclick = openCreator;
    }

    if (!records.length) {
      panel.insertAdjacentHTML('beforeend', '<div class="staff-empty-card"><div class="staff-avatar">CC</div><h2>No staff profiles yet</h2><p>Use “Add staff profile” to create the first staff record.</p></div>');
      panel.dataset.staffCardsReady = 'true';
      return;
    }

    const cards = document.createElement('section');
    cards.className = 'staff-card-grid';

    records.forEach((record, index) => {
      const name = value(record, 'displayName', 'name', 'robloxUsername') || `Staff Member ${index + 1}`;
      const roblox = value(record, 'robloxUsername') || 'Not listed';
      const discord = value(record, 'discordUsername') || 'Not listed';
      const discordId = value(record, 'discordId') || 'Not listed';
      const rank = value(record, 'organizationalRank', 'rankName', 'rank') || 'Staff Member';
      const department = value(record, 'departmentName', 'department') || 'Unassigned';
      const team = value(record, 'teamName', 'team') || 'Unassigned';
      const status = value(record, 'staffStatus', 'status') || 'ACTIVE';

      const card = document.createElement('article');
      card.className = 'staff-profile-card';
      card.dataset.recordId = record.id;
      card.innerHTML = `
        <div class="staff-card-accent"></div>
        <div class="staff-card-top">
          <div class="staff-avatar">${esc(initials(name))}</div>
          <span class="staff-status ${statusClass(status)}"><i></i>${esc(status.replaceAll('_', ' '))}</span>
        </div>
        <div class="staff-card-main">
          <p class="staff-card-eyebrow">CANELA STAFF PROFILE</p>
          <h2>${esc(name)}</h2>
          <div class="staff-rank-pill">${esc(rank)}</div>
        </div>
        <div class="staff-card-details staff-card-details-full">
          <div><span>Roblox</span><strong title="${esc(roblox)}">${esc(roblox)}</strong></div>
          <div><span>Discord</span><strong title="${esc(discord)}">${esc(discord)}</strong></div>
          <div><span>Discord ID</span><strong title="${esc(discordId)}">${esc(discordId)}</strong></div>
          <div><span>Department</span><strong title="${esc(department)}">${esc(department)}</strong></div>
          <div><span>Team</span><strong title="${esc(team)}">${esc(team)}</strong></div>
          <div><span>Staff status</span><strong>${esc(status.replaceAll('_', ' '))}</strong></div>
        </div>
        <div class="staff-card-footer">
          <span>Profile ${String(index + 1).padStart(2, '0')}</span>
          <button class="staff-card-edit" type="button">Edit profile</button>
        </div>`;

      card.querySelector('.staff-card-edit').addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await openEditor(record.id);
      });
      cards.appendChild(card);
    });

    panel.appendChild(cards);
    panel.dataset.staffCardsReady = 'true';
  } catch (error) {
    console.error('Unable to render staff cards.', error);
  } finally {
    rendering = false;
  }
}

let timer = null;
function scheduleRender() {
  clearTimeout(timer);
  timer = setTimeout(() => renderStaffCards(false), 120);
}

const observer = new MutationObserver(scheduleRender);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
window.addEventListener('canela-record-saved', event => {
  if (event.detail?.collection === 'staffProfiles') renderStaffCards(true);
});
window.addEventListener('canela-crud-ready', scheduleRender);
onAuthStateChanged(auth, scheduleRender);
scheduleRender();
