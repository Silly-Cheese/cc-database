(() => {
  const DIRECT_FORM_VALUE = 'DIRECT_FORM';

  function removeWorkflowField(modal) {
    if (!modal || modal.dataset.workflowRemoved === 'true') return;

    const workflowSelect = modal.querySelector('#builderWorkflow');
    if (!workflowSelect) return;

    modal.dataset.workflowRemoved = 'true';

    let directOption = [...workflowSelect.options].find(option => option.value === DIRECT_FORM_VALUE);
    if (!directOption) {
      directOption = document.createElement('option');
      directOption.value = DIRECT_FORM_VALUE;
      directOption.textContent = 'Direct form review';
      workflowSelect.appendChild(directOption);
    }

    workflowSelect.required = false;
    workflowSelect.value = DIRECT_FORM_VALUE;

    const workflowLabel = workflowSelect.closest('label');
    if (workflowLabel) {
      workflowLabel.hidden = true;
      workflowLabel.style.display = 'none';
      workflowLabel.setAttribute('aria-hidden', 'true');
    }

    const heading = modal.querySelector('.performance-builder-head h2');
    if (heading) {
      heading.textContent = /edit/i.test(heading.textContent || '') ? 'Edit form' : 'Create form';
    }

    const eyebrow = modal.querySelector('.performance-builder-head p');
    if (eyebrow) eyebrow.textContent = 'FORMS CENTER';

    const canvasHeading = modal.querySelector('.performance-builder-section-title h3');
    if (canvasHeading) canvasHeading.textContent = 'Build your form';
  }

  function scan(root = document) {
    const modal = root.matches?.('#performanceBuilderModal')
      ? root
      : root.querySelector?.('#performanceBuilderModal');
    if (modal) removeWorkflowField(modal);
  }

  document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  scan();

  new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) scan(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
