(() => {
  const LABEL = 'Forms Center';

  function findPerformanceButton() {
    return document.querySelector('[data-forms-center], [data-performance-center]') ||
      [...document.querySelectorAll('.nav-item')].find(btn => /performance center|forms center/i.test(btn.textContent || ''));
  }

  function openFormsCenter() {
    const formsButton = document.querySelector('[data-forms-center]');
    if (formsButton && formsButton !== document.activeElement) {
      formsButton.click();
      return;
    }

    if (typeof window.openFormsCenter === 'function') {
      window.openFormsCenter();
      return;
    }

    const legacy = findPerformanceButton();
    legacy?.click();
  }

  function wireButton(button) {
    if (!button || button.dataset.formsCenterWired === 'true') return;
    button.dataset.formsCenter = 'true';
    button.dataset.formsCenterWired = 'true';
    button.setAttribute('aria-label', 'Open Forms Center');

    const icon = button.querySelector('span')?.outerHTML || '<span>📝</span>';
    button.innerHTML = `${icon}${LABEL}`;

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof window.openFormsCenter === 'function') {
        window.openFormsCenter();
      } else {
        const main = document.querySelector('.layout > main');
        if (main) {
          main.innerHTML = '<section class="panel"><h1>Forms Center</h1><p>Loading Forms Center…</p></section>';
        }
        window.setTimeout(() => {
          if (typeof window.openFormsCenter === 'function') window.openFormsCenter();
        }, 250);
      }
    }, true);
  }

  function renameModuleCards() {
    document.querySelectorAll('.module-card, button, a').forEach(element => {
      const text = (element.textContent || '').trim();
      if (/^performance center$/i.test(text)) {
        element.textContent = LABEL;
        element.setAttribute('aria-label', 'Open Forms Center');
      }
    });
  }

  function apply() {
    wireButton(findPerformanceButton());
    renameModuleCards();
  }

  window.addEventListener('forms-center-ready', apply);
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  apply();

  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();
