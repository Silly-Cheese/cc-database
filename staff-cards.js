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

function enhanceStaffDirectory() {
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Staff Directory' || panel.dataset.staffCardsReady === 'true') return;

  const table = panel.querySelector('table');
  if (!table) return;

  const headings = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim().toLowerCase());
  const rows = [...table.querySelectorAll('tbody tr')];
  if (!rows.length) return;

  const cards = document.createElement('section');
  cards.className = 'staff-card-grid';

  rows.forEach((row, index) => {
    const cells = [...row.querySelectorAll('td')];
    const values = {};
    headings.forEach((heading, headingIndex) => {
      values[heading] = cells[headingIndex]?.textContent?.trim() || '';
    });

    const name = values.name || values.staff || `Staff Member ${index + 1}`;
    const roblox = values.roblox || 'Not listed';
    const discord = values.discord || 'Not listed';
    const rank = values.rank || 'Staff Member';
    const status = values.status || 'ACTIVE';
    const actionCell = cells[headings.indexOf('actions')];
    const editButton = actionCell?.querySelector('button');

    const card = document.createElement('article');
    card.className = 'staff-profile-card';
    card.innerHTML = `
      <div class="staff-card-accent"></div>
      <div class="staff-card-top">
        <div class="staff-avatar">${initials(name)}</div>
        <span class="staff-status ${statusClass(status)}"><i></i>${status.replaceAll('_', ' ')}</span>
      </div>
      <div class="staff-card-main">
        <p class="staff-card-eyebrow">CANELA STAFF PROFILE</p>
        <h2>${name}</h2>
        <div class="staff-rank-pill">${rank}</div>
      </div>
      <div class="staff-card-details">
        <div><span>Roblox</span><strong>${roblox}</strong></div>
        <div><span>Discord</span><strong>${discord}</strong></div>
      </div>
      <div class="staff-card-footer">
        <span>Profile ${String(index + 1).padStart(2, '0')}</span>
        <div class="staff-card-action"></div>
      </div>`;

    if (editButton) {
      editButton.classList.add('staff-card-edit');
      editButton.textContent = 'Edit profile';
      card.querySelector('.staff-card-action').appendChild(editButton);
    }

    cards.appendChild(card);
  });

  const wrap = table.closest('.table-wrap');
  if (wrap) wrap.replaceWith(cards);
  else table.replaceWith(cards);

  panel.dataset.staffCardsReady = 'true';
}

let scheduled = false;
function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    enhanceStaffDirectory();
  }, 80);
}

const observer = new MutationObserver(scheduleEnhancement);
observer.observe(document.getElementById('app'), { childList: true, subtree: true });
scheduleEnhancement();
