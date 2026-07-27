(() => {
  const MOBILE_BREAKPOINT = 900;
  let lastTrigger = null;

  function sidebar() {
    return document.getElementById('sidebar') || document.querySelector('.layout > aside');
  }

  function menuButton() {
    return document.getElementById('menuBtn') || document.querySelector('.topbar .icon-btn');
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById('mobileNavBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.id = 'mobileNavBackdrop';
      backdrop.className = 'mobile-nav-backdrop';
      backdrop.setAttribute('aria-label', 'Close navigation menu');
      document.body.appendChild(backdrop);
    }
    return backdrop;
  }

  function setOpen(open, trigger = null) {
    const panel = sidebar();
    const button = menuButton();
    if (!panel || !button) return;

    if (trigger) lastTrigger = trigger;
    panel.classList.toggle('open', open);
    document.documentElement.classList.toggle('mobile-nav-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-controls', 'sidebar');
    button.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');

    const backdrop = ensureBackdrop();
    backdrop.classList.toggle('visible', open);
    backdrop.hidden = !open;

    if (!open && lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  function toggle(trigger) {
    const panel = sidebar();
    if (!panel) return;
    setOpen(!panel.classList.contains('open'), trigger);
  }

  function prepare() {
    const button = menuButton();
    const panel = sidebar();
    if (!button || !panel) return;

    button.type = 'button';
    button.setAttribute('aria-controls', 'sidebar');
    button.setAttribute('aria-expanded', String(panel.classList.contains('open')));
    button.setAttribute('aria-label', panel.classList.contains('open') ? 'Close navigation menu' : 'Open navigation menu');
    ensureBackdrop();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('#menuBtn, .topbar .icon-btn');
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      toggle(button);
      return;
    }

    if (event.target.closest('#mobileNavBackdrop')) {
      event.preventDefault();
      setOpen(false);
      return;
    }

    const navigationItem = event.target.closest('#sidebar .nav-item, #sidebar [data-view], #sidebar [data-performance-center], #sidebar [data-internship-center]');
    if (navigationItem && window.innerWidth <= MOBILE_BREAKPOINT) {
      setOpen(false);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar()?.classList.contains('open')) {
      event.preventDefault();
      setOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_BREAKPOINT) setOpen(false);
  });

  const observer = new MutationObserver(() => prepare());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepare, { once: true });
  } else {
    prepare();
  }
})();