import { getApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const auth = getAuth(getApp());
const db = getFirestore(getApp());
let rendering = false;

const esc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function initials(name) {
  return String(name || 'Staff')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || 'ST';
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

async function renderStaffCards() {
  if (rendering || !auth.currentUser || auth.currentUser.isAnonymous) return;
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Staff Directory') return;

  rendering = true;
  try {
    const snapshot = await getDocs(collection(db, 'staffProfiles'));
    const records = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));

    panel.querySelector('.staff-card-grid')?.remove();
    panel.querySelector('.table-wrap')?.remove();

    const existingAdd = panel.querySelector('.crud-add');
    if (existingAdd && window.CanelaCrud?.createStaff) {
      existingAdd.onclick = () => window.CanelaCrud.createStaff();
    }

    if (!records.length) {
      panel.insertAdjacentHTML('beforeend', '<div class="empty">No staff profiles have been added yet.</div>');
      panel.dataset.staffCardsReady = 'true';
      return;
    }

    const cards = document.createElement('section');
    cards.className = 'staff-card-grid';

    records.forEach((record, index) => {
      const name = value(record, 'displayName', 'robloxUsername') || `Staff Member ${index + 1}`;
      const roblox = value(record, 'robloxUsername') || 'Not listed';
      const discord = value(record, 'discordUsername') || 'Not listed';
      const discordId = value(record, 'discordId') || 'Not listed';
      const rank = value(record, 'organizationalRank', 'rankName') || 'Staff Member';
      const department = value(record, 'departmentName', 'department') || 'Unassigned';
      const team = value(record, 'teamName', 'team') || 'Unassigned';
      const status = value(record, 'staffStatus', 'status') || 'ACTIVE';

      const card = document.createElement('article');
      card.className = 'staff-profile-card';
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
          <div><span>Roblox</span><strong>${esc(roblox)}</strong></div>
          <div><span>Discord</span><strong>${esc(discord)}</strong></div>
          <div><span>Discord ID</span><strong>${esc(discordId)}</strong></div>
          <div><span>Department</span><strong>${esc(department)}</strong></div>
          <div><span>Team</span><strong>${esc(team)}</strong></div>
          <div><span>Record ID</span><strong>${esc(record.id)}</strong></div>
        </div>
        <div class="staff-card-footer">
          <span>Profile ${String(index + 1).padStart(2, '0')}</span>
          <div class="staff-card-action">
            <button class="staff-card-edit" type="button">Edit profile</button>
          </div>
        </div>`;

      const editButton = card.querySelector('.staff-card-edit');
      if (window.CanelaCrud?.editStaff) {
        editButton.onclick = () => window.CanelaCrud.editStaff(record.id);
      } else {
        editButton.disabled = true;
        editButton.textContent = 'Editor loading…';
      }

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
  timer = setTimeout(renderStaffCards, 120);
}

const observer = new MutationObserver(scheduleRender);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
window.addEventListener('canela-record-saved', scheduleRender);
onAuthStateChanged(auth, scheduleRender);
scheduleRender();
