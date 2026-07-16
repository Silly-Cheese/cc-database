const allianceEsc = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

function allianceInitials(name) {
  return String(name || 'Alliance').trim().split(/\s+/).slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '').join('') || 'AL';
}

function allianceStatusClass(status) {
  const normalized = String(status || 'ACTIVE').toUpperCase();
  if (normalized === 'ACTIVE') return 'is-active';
  if (normalized === 'ON HOLD' || normalized === 'ON_HOLD') return 'is-hold';
  if (normalized === 'TERMINATED') return 'is-terminated';
  return 'is-neutral';
}

function splitRepresentatives(value) {
  return String(value || 'Not assigned').split(',').map(item => item.trim()).filter(Boolean);
}

function representativeChips(value) {
  return splitRepresentatives(value)
    .map(name => `<span class="alliance-rep-chip">${allianceEsc(name)}</span>`)
    .join('');
}

function enhanceAllianceDirectory() {
  const panel = document.querySelector('main .panel');
  const title = panel?.querySelector('.section-head h1, h1')?.textContent?.trim();
  if (!panel || title !== 'Alliance Management' || panel.dataset.allianceCardsReady === 'true') return;

  const table = panel.querySelector('table');
  if (!table) return;
  const rows = [...table.querySelectorAll('tbody tr')];
  if (!rows.length) return;

  const headings = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim().toLowerCase());
  const grid = document.createElement('section');
  grid.className = 'alliance-card-grid';

  rows.forEach((row, index) => {
    const cells = [...row.querySelectorAll('td')];
    const values = {};
    headings.forEach((heading, headingIndex) => {
      values[heading] = cells[headingIndex]?.textContent?.trim() || '';
    });

    const name = values.alliance || `Alliance ${index + 1}`;
    const canelaRep = values['canela rep'] || 'Not assigned';
    const partnerRep = values['partner rep'] || 'Not assigned';
    const status = values.status || 'ACTIVE';
    const actionCell = cells[headings.indexOf('actions')];
    const editButton = actionCell?.querySelector('button');

    const card = document.createElement('article');
    card.className = 'alliance-profile-card';
    card.innerHTML = `
      <div class="alliance-card-accent"></div>
      <div class="alliance-card-top">
        <div class="alliance-avatar">${allianceEsc(allianceInitials(name))}</div>
        <span class="alliance-status ${allianceStatusClass(status)}"><i></i>${allianceEsc(status.replaceAll('_', ' '))}</span>
      </div>
      <div class="alliance-card-main">
        <p>CANELA PARTNERSHIP</p>
        <h2>${allianceEsc(name)}</h2>
        <span class="alliance-number">Alliance ${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="alliance-representatives">
        <section>
          <span>Canela representatives</span>
          <div>${representativeChips(canelaRep)}</div>
        </section>
        <section>
          <span>Partner representatives</span>
          <div>${representativeChips(partnerRep)}</div>
        </section>
      </div>
      <div class="alliance-card-footer">
        <span>Partnership record</span>
        <div class="alliance-card-action"></div>
      </div>`;

    if (editButton) {
      editButton.className = 'alliance-card-edit';
      editButton.textContent = 'Edit alliance';
      card.querySelector('.alliance-card-action').appendChild(editButton);
    }
    grid.appendChild(card);
  });

  table.closest('.table-wrap')?.replaceWith(grid);
  panel.dataset.allianceCardsReady = 'true';
}

let allianceRenderTimer = null;
function scheduleAllianceCards() {
  clearTimeout(allianceRenderTimer);
  allianceRenderTimer = setTimeout(enhanceAllianceDirectory, 140);
}

const allianceObserver = new MutationObserver(scheduleAllianceCards);
allianceObserver.observe(document.getElementById('app'), { childList: true, subtree: true });
window.addEventListener('load', scheduleAllianceCards);
window.addEventListener('canela-view-rendered', scheduleAllianceCards);
scheduleAllianceCards();
