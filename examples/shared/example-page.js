import { getExample } from './catalog.js';
import '../../src/components/compost-select.js';

const exampleID = document.body?.dataset.exampleId;
const THEME_STORAGE_KEY = 'compost:example-theme';
const THEMES = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'Gruvbox', value: 'gruvbox' },
];
const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

setTheme(THEMES.some((theme) => theme.value === savedTheme) ? savedTheme : THEMES[0].value, false);

window.addEventListener('storage', (event) => {
  if (event.key === THEME_STORAGE_KEY) setTheme(event.newValue || THEMES[0].value, false);
});

if (exampleID) {
  setupExamplePage(exampleID);
}

export function setupExamplePage(id) {
  const example = getExample(id);
  if (!example) return;

  document.querySelectorAll('header .navlink').forEach((link) => link.remove());

  const customTarget = document.querySelector('[data-example-nav]');
  const target = customTarget || document.querySelector('header');
  if (!target) return;
  const existingThemeSelector = document.querySelector('[data-shared-theme-group]');

  target.classList.add('example-actions');

  const links = document.createElement('div');
  links.className = 'example-link-group';
  links.innerHTML = `
    <a class="example-nav-button" href="../../docs/">Docs</a>
    <a class="example-nav-button" href="../">All examples</a>
  `;
  target.append(links);

  if (existingThemeSelector) {
    setupThemeSelector(existingThemeSelector);
  } else if (!document.body?.hasAttribute('data-no-theme-selector') && !document.querySelector('[data-theme-group]')) {
    const themeSelector = document.createElement('compost-select');
    themeSelector.className = 'example-theme-selector';
    themeSelector.setAttribute('data-shared-theme-group', '');
    themeSelector.setAttribute('name', 'example-theme');
    themeSelector.setAttribute('aria-label', 'Theme');
    themeSelector.replaceChildren(...THEMES.map((theme) => new Option(theme.label, theme.value)));
    target.append(themeSelector);
    setupThemeSelector(themeSelector);
  }
}

function setupThemeSelector(selector) {
  const fallback = THEMES[0].value;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const initial = THEMES.some((theme) => theme.value === saved) ? saved : fallback;

  setTheme(initial, false);
  selector.value = initial;

  window.addEventListener('compost-theme-change', (event) => {
    selector.value = event.detail.theme;
  });

  selector.addEventListener('change', (event) => {
    const nextTheme = event.target.value || fallback;
    setTheme(nextTheme);
  });
}

export function setTheme(theme, persist = true) {
  if (!THEMES.some((entry) => entry.value === theme)) return;
  document.documentElement.dataset.compostTheme = theme;
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent('compost-theme-change', { detail: { theme } }));
}
