const removeDuplicateBootstrapModals = () => {
  const modals = [...document.querySelectorAll('#bootstrapModal')];
  if (modals.length <= 1) return;
  modals.slice(1).forEach(modal => modal.remove());
};

removeDuplicateBootstrapModals();

const observer = new MutationObserver(() => {
  removeDuplicateBootstrapModals();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
