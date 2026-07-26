const STORAGE_KEY = 'canela-portal-theme';

function preferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.querySelectorAll('.portal-theme-toggle').forEach(button => {
    const dark = next === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    const icon = button.querySelector('.theme-icon');
    const label = button.querySelector('.theme-label');
    if (icon) icon.textContent = dark ? '☀️' : '🌙';
    if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
  });
}

function createToggle() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'portal-theme-toggle';
  button.innerHTML = '<span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>';
  button.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  return button;
}

function installToggle() {
  const topbar = document.querySelector('.topbar');
  if (!topbar || topbar.querySelector('.portal-theme-toggle')) return;

  const menuButton = topbar.querySelector('#menuBtn, .icon-btn');
  const toggle = createToggle();
  if (menuButton) topbar.insertBefore(toggle, menuButton);
  else topbar.appendChild(toggle);
  applyTheme(document.documentElement.dataset.theme || preferredTheme());
}

applyTheme(preferredTheme());

const observer = new MutationObserver(installToggle);
observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
installToggle();

window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
    applyTheme(event.newValue);
  }
});
