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
    PROMOTION: '↑',
    DEMOTION: '↓',
    TRANSFER: '⇄',
    LEAVE: '◷',
    SUSPENSION: 'Ⅱ',
    RESIGNATION: '↪',
    TERMINATION: '×',
  };
  return icons[String(action || '').toUpperCase()] || '↕';
}

function getCrud() {
  return window.CanelaCrud || null;
}

function renderPersonnelCards() {
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Personnel Actions' || panel.dataset.personnelCardsReady === 'true') return;

  const table = panel.querySelector('table');
  if (!table) return;

  const headings = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim().toLowerCase());
  const rows = [...table.querySelectorAll('tbody tr')];
  if (!rows.length) return;

  const cards = document.createElement('section');
  cards.className = 'personnel-card-grid';

  rows.forEach((row, index) => {
    const cells = [...row.querySelectorAll('td')];
    const values = {};
    headings.forEach((heading, headingIndex) => {
      values[heading] = cells[headingIndex]?.textContent?.trim() || '';
    });

    const id = row.dataset.recordId;
    const staff = values.staff || `Staff Member ${index + 1}`;
    const action = values.action || 'PERSONNEL ACTION';
    const reason = values.reason || 'No reason recorded.';
    const status = values.status || 'PENDING';

    const card = document.createElement('article');
    card.className = 'personnel-action-card';
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

    const editButton = card.querySelector('.personnel-edit');
    const deleteButton = card.querySelector('.personnel-delete');

    editButton.disabled = !id;
    deleteButton.disabled = !id;

    editButton.onclick = () => {
      const crud = getCrud();
      if (!crud?.editPersonnel || !id) return alert('The personnel editor is still loading. Refresh and try again.');
      crud.editPersonnel(id);
    };

    deleteButton.onclick = () => {
      const crud = getCrud();
      if (!crud?.deletePersonnel || !id) return alert('Delete controls are still loading. Refresh and try again.');
      crud.deletePersonnel(id, `${staff}'s ${action.toLowerCase()} record`);
    };

    cards.appendChild(card);
  });

  const wrap = table.closest('.table-wrap');
  if (wrap) wrap.replaceWith(cards);
  else table.replaceWith(cards);
  panel.dataset.personnelCardsReady = 'true';
}

let personnelTimer = null;
function schedulePersonnelCards() {
  clearTimeout(personnelTimer);
  personnelTimer = setTimeout(renderPersonnelCards, 100);
}

const personnelObserver = new MutationObserver(schedulePersonnelCards);
personnelObserver.observe(document.getElementById('app'), { childList: true, subtree: false });
window.addEventListener('canela-view-rendered', schedulePersonnelCards);
window.addEventListener('canela-crud-enhanced', event => {
  if (event.detail?.collection === 'personnelActions') schedulePersonnelCards();
});
window.addEventListener('canela-crud-ready', schedulePersonnelCards);
schedulePersonnelCards();