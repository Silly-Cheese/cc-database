function sidebar() {
  return document.getElementById('sidebar');
}

function ensureBackdrop() {
  let backdrop = document.getElementById('mobileNavBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.id = 'mobileNavBackdrop';
    backdrop.className = 'mobile-nav-backdrop';
    backdrop.setAttribute('aria-label', 'Close navigation');
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function setOpen(open) {
  const panel = sidebar();
  if (!panel) return;
  const backdrop = ensureBackdrop();
  panel.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);
  document.documentElement.classList.toggle('mobile-nav-open', open);
  const menu = document.getElementById('menuBtn');
  if (menu) menu.setAttribute('aria-expanded', String(open));
}

document.addEventListener('click', event => {
  const menu = event.target.closest('#menuBtn');
  if (menu) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(!sidebar()?.classList.contains('open'));
    return;
  }

  if (event.target.closest('#mobileNavBackdrop')) {
    setOpen(false);
    return;
  }

  if (event.target.closest('#sidebar .nav-item, #sidebar #logoutBtn')) {
    setOpen(false);
  }
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') setOpen(false);
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900) setOpen(false);
});

const observer = new MutationObserver(() => {
  const menu = document.getElementById('menuBtn');
  if (menu) {
    menu.setAttribute('aria-controls', 'sidebar');
    menu.setAttribute('aria-expanded', String(Boolean(sidebar()?.classList.contains('open'))));
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });