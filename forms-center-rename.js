(() => {
  const renameText = root => {
    const scope = root && root.querySelectorAll ? root : document;

    scope.querySelectorAll('[data-performance-center], .nav-item').forEach(button => {
      const text = button.textContent || '';
      if (text.includes('Performance Center')) {
        const icon = button.querySelector('span');
        button.innerHTML = `${icon ? icon.outerHTML : '<span>📝</span>'}Forms Center`;
        button.setAttribute('aria-label', 'Open Forms Center');
        button.dataset.formsCenter = 'true';
      }
    });

    scope.querySelectorAll('h1, h2, h3, p, span, button').forEach(element => {
      if (element.children.length) return;
      const value = (element.textContent || '').trim();
      const replacements = new Map([
        ['Performance Center', 'Forms Center'],
        ['My Reviews', 'My Forms'],
        ['All Reviews', 'All Forms'],
        ['Review templates', 'Manage Forms'],
        ['Templates', 'Manage Forms'],
        ['New review', 'Assign Form'],
        ['+ New review', '+ Assign Form'],
        ['Performance reviews', 'Assigned Forms'],
        ['My performance reviews', 'My Forms'],
        ['All performance reviews', 'All Forms'],
        ['Create structured reviews, route approvals by permission, and maintain an auditable performance history.', 'Complete assigned forms, review submissions, and manage reusable forms in one place.'],
        ['WORKFORCE DEVELOPMENT', 'FORMS & REVIEWS'],
      ]);
      if (replacements.has(value)) element.textContent = replacements.get(value);
    });

    scope.querySelectorAll('[data-performance-tab="workflows"], [data-performance-tab="permissions"]').forEach(tab => {
      tab.hidden = true;
      tab.style.display = 'none';
    });
  };

  const run = () => renameText(document);
  run();
  document.addEventListener('DOMContentLoaded', run, { once: true });

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) renameText(node);
      });
    }
    renameText(document);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();