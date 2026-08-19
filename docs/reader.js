import '../examples/shared/example-page.js';

const docs = [
  ['overview', 'Overview', '../README.md'],
  ['backend-integration', 'Backend integration', './backend-integration.md'],
  ['parameter-controller', 'Parameter controller', './parameter-controller.md'],
  ['components', 'Component guides', './components.md'],
  ['themes', 'Themes', './themes.md'],
  ['midi-mappings', 'MIDI mappings', './midi-mappings.md'],
  ['parameter-scale', 'Parameter scale', './parameter-scale.md'],
  ['compost-audio', 'compost-audio', './components/compost-audio.md'],
  ['compost-midi', 'compost-midi', './components/compost-midi.md'],
  ['compost-device-selector', 'compost-device-selector', './components/compost-device-selector.md'],
  ['compost-drawer', 'compost-drawer', './components/compost-drawer.md'],
  ['compost-knob', 'compost-knob', './components/compost-knob.md'],
  ['compost-slider', 'compost-slider', './components/compost-slider.md'],
  ['compost-gain', 'compost-gain', './components/compost-gain.md'],
  ['compost-piano-roll', 'compost-piano-roll', './components/compost-piano-roll.md'],
  ['compost-number-box', 'compost-number-box', './components/compost-number-box.md'],
  ['compost-button', 'compost-button', './components/compost-button.md'],
  ['compost-select', 'compost-select', './components/compost-select.md'],
  ['compost-piano', 'compost-piano', './components/compost-piano.md'],
  ['compost-scope', 'compost-scope', './components/compost-scope.md'],
  ['compost-midi-monitor', 'compost-midi-monitor', './components/compost-midi-monitor.md'],
  ['compost-midi-mappings', 'compost-midi-mappings', './components/compost-midi-mappings.md'],
];

const docMap = new Map(docs.map(([id, title, href]) => [id, { id, title, href }]));
const nav = document.querySelector('[data-doc-list]');
const article = document.querySelector('[data-doc-content]');
const query = new URLSearchParams(window.location.search);
const requested = query.get('doc') || 'overview';
const current = docMap.get(requested) || docMap.get('overview');

nav.innerHTML = docs
  .map(([id, title]) => `<a href="?doc=${id}" ${id === current.id ? 'aria-current="page"' : ''}>${title}</a>`)
  .join('');

fetch(current.href, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load ${current.href}`);
    return response.text();
  })
  .then((markdown) => {
    document.title = `${current.title} - Compost Docs`;
    article.innerHTML = renderMarkdown(markdown);
    rewriteMarkdownLinks();
    focusCurrentDocument();
  })
  .catch((error) => {
    article.innerHTML = `<h1>${escapeHTML(current.title)}</h1><p>${escapeHTML(error.message)}</p>`;
  });

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = [];
  let table = [];
  let code = null;

  for (const line of lines) {
    const fence = line.match(/^```(.*)$/u);
    if (fence) {
      flushParagraph();
      flushList();
      flushTable();
      if (code) {
        html.push(`<pre><code>${escapeHTML(code.lines.join('\n'))}</code></pre>`);
        code = null;
      } else {
        code = { lang: fence[1], lines: [] };
      }
      continue;
    }

    if (code) {
      code.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      flushTable();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\|.+\|$/u.test(line)) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }

    const bullet = line.match(/^- \s*(.+)$/u);
    if (bullet) {
      flushParagraph();
      flushTable();
      list.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushTable();

  return html.join('\n');

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.join('')}</ul>`);
    list = [];
  }

  function flushTable() {
    if (!table.length) return;
    const rows = table.filter((row) => !/^\|\s*-+/u.test(row)).map((row) => (
      row.split('|').slice(1, -1).map((cell) => inline(cell.trim()))
    ));
    const [head, ...body] = rows;
    html.push(`<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    table = [];
  }
}

function inline(value) {
  return escapeHTML(value)
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, '<a href="$2">$1</a>');
}

function rewriteMarkdownLinks() {
  const documentURL = new URL(current.href, window.location.href);

  for (const link of article.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href');
    const linkPath = href.replace(/^\.\//u, '').replace(/^docs\//u, '');
    const match = [...docMap.values()].find((doc) => doc.href.replace(/^\.{1,2}\//u, '') === linkPath);
    if (match) {
      link.href = `?doc=${match.id}`;
    } else if (!href.startsWith('#') && !/^[a-z][a-z\d+.-]*:/iu.test(href)) {
      link.href = new URL(href, documentURL).href;
    }
  }
}

function focusCurrentDocument() {
  if (!query.has('doc') || !window.matchMedia('(max-width: 760px)').matches) return;

  const heading = article.querySelector('h1');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  article.scrollIntoView({ block: 'start' });
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}
