import { getExample } from './catalog.js';

const exampleID = document.body?.dataset.exampleId;

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

  target.classList.add('example-actions');

  const links = document.createElement('div');
  links.className = 'example-link-group';
  links.innerHTML = `
    <a class="example-nav-button" href="https://github.com/charCulbert/compost#readme">README</a>
    <a class="example-nav-button" href="../">All examples</a>
  `;
  target.append(links);
}
