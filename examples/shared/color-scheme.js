const storageKey = 'compost-example-color-scheme';
const root = document.documentElement;
const stored = localStorage.getItem(storageKey);

root.dataset.colorScheme = stored === 'dark' ? 'dark' : 'light';

const button = document.createElement('button');
button.type = 'button';
button.className = 'color-scheme-toggle';
button.setAttribute('aria-label', 'Toggle color scheme');
button.addEventListener('click', () => {
  root.dataset.colorScheme = root.dataset.colorScheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(storageKey, root.dataset.colorScheme);
  updateButton();
});

function updateButton() {
  const dark = root.dataset.colorScheme === 'dark';
  button.textContent = dark ? 'Light mode' : 'Dark mode';
  button.setAttribute('aria-pressed', String(dark));
}

updateButton();
const header = document.querySelector('header');
button.classList.toggle('floating', !header);
(header || document.body).append(button);
