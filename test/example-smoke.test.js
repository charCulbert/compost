import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
function findMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findMarkdownFiles(entryPath);
    return entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

test('the repository root redirects to the examples page', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /http-equiv="refresh" content="0; url=\.\/examples\/"/u);
  assert.doesNotMatch(html, /Small tools for audio apps|class="links"/u);
});

test('the public theme stylesheet owns the bundled component palettes', () => {
  const packageJSON = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const themes = fs.readFileSync(path.join(root, 'src/themes.css'), 'utf8');
  const sharedStyles = fs.readFileSync(path.join(root, 'examples/shared/styles.css'), 'utf8');
  const examplePage = fs.readFileSync(path.join(root, 'examples/shared/example-page.js'), 'utf8');

  assert.equal(packageJSON.exports['./themes'], './src/themes.css');
  assert.match(sharedStyles, /@import url\('\.\.\/\.\.\/src\/themes\.css'\);/u);
  assert.match(themes, /data-compost-theme="dark"/u);
  assert.match(themes, /data-compost-theme="light"/u);
  assert.match(themes, /data-compost-theme="gruvbox"/u);
  assert.match(themes, /compost-midi-mappings \{/u);
  assert.match(themes, /compost-select \{/u);
  assert.match(themes, /compost-device-selector \{/u);
  assert.match(themes, /compost-note-editor \{/u);
  // The keyboard still takes its colours from constructor options, not the theme.
  assert.doesNotMatch(themes, /compost-piano \{/u);
  assert.doesNotMatch(sharedStyles, /--compost-select-bg|--compost-midi-mappings-row-bg/u);
  assert.match(examplePage, /dataset\.compostTheme = theme/u);
  assert.match(examplePage, /setTheme\(THEMES\.some\(\(theme\) => theme\.value === savedTheme\)/u);
  assert.match(examplePage, /localStorage\.setItem\(THEME_STORAGE_KEY, theme\)/u);
  assert.match(examplePage, /addEventListener\('storage'/u);
  assert.doesNotMatch(`${sharedStyles}\n${examplePage}`, /data-colors|dataset\.colors|modern-dark/u);
});

test('knob and slider demos expose the same range and curve options', () => {
  const optionNames = ['curve', 'min', 'max', 'step', 'mid', 'editable', 'reset'];
  const pages = ['compost-knob', 'compost-slider'].map((id) => fs.readFileSync(
    path.join(root, `examples/component-demos/${id}/index.html`), 'utf8'));

  for (const html of pages) {
    for (const name of optionNames) {
      assert.match(html, new RegExp(`data-option="(?:knob|slider)-${name}"`, 'u'));
    }
  }

  assert.match(pages[1], /data-option="slider-orientation"/u);
  assert.match(pages[1], /orientation="vertical"/u);
});

test('number box demo exposes its range, curve, reset, empty-value, and split-drag options', () => {
  const html = fs.readFileSync(
    path.join(root, 'examples/component-demos/compost-number-box/index.html'), 'utf8');

  for (const name of [
    'curve', 'min', 'max', 'step', 'mid', 'reset', 'allow-empty', 'split-drag',
    'drag-step-left', 'drag-step-middle', 'drag-step-right',
  ]) {
    assert.match(html, new RegExp(`data-option="number-${name}"`, 'u'));
  }
  assert.match(html, /data-option="number-step"[^>]+value="0\.01"/u);
  assert.match(html, /data-option="number-mid"[^>]+value="20"/u);
});

test('scope demo shares the compact signal-generator controls without sliders', () => {
  const scopeDemo = fs.readFileSync(
    path.join(root, 'examples/component-demos/compost-scope/index.html'), 'utf8');
  const signalGenerator = fs.readFileSync(
    path.join(root, 'examples/signal-generator/index.html'), 'utf8');

  assert.match(scopeDemo, /shared\/scope-controls\.css/u);
  assert.match(signalGenerator, /shared\/scope-controls\.css/u);
  assert.equal((scopeDemo.match(/<compost-number-box/gu) ?? []).length, 6);
  assert.equal((scopeDemo.match(/data-scope-trigger-value=/gu) ?? []).length, 5);
  assert.equal((scopeDemo.match(/data-scope-window-value=/gu) ?? []).length, 2);
  assert.doesNotMatch(scopeDemo, /<compost-slider/u);
  assert.doesNotMatch(scopeDemo, /Capture manual frame|data-scope-trigger(?:\s|>)/u);
  assert.match(
    fs.readFileSync(path.join(root, 'examples/component-demos/shared-demo.js'), 'utf8'),
    /triggerValue === 'manual'[\s\S]*scope\.captureTrigger/u,
  );
});

test('piano demo names its layout option by the positive docked state', () => {
  const html = fs.readFileSync(
    path.join(root, 'examples/component-demos/compost-piano/index.html'), 'utf8');
  const sharedDemo = fs.readFileSync(
    path.join(root, 'examples/component-demos/shared-demo.js'), 'utf8');

  assert.match(html, /data-option="piano-docked"[^>]+checked/u);
  assert.match(html, />\s*Docked keyboard\s*</u);
  assert.match(sharedDemo, /option\('piano-docked'\)/u);
});

test('drawer demo keeps only the docked pair', () => {
  const html = fs.readFileSync(
    path.join(root, 'examples/component-demos/compost-drawer/index.html'), 'utf8');
  const main = fs.readFileSync(
    path.join(root, 'examples/component-demos/compost-drawer/main.js'), 'utf8');
  assert.equal((html.match(/\sdata-drawer-demo(?=\s|>)/gu) ?? []).length, 2);
  assert.doesNotMatch(html, /direction-stage|edge tester|data-option="edge"|data-option="skin"|data-option="density"|data-skin=|data-density=|data-toggle-drawer|Toggle from JavaScript/u);
  assert.match(html, /<label>\s*Title\s*<input[^>]+data-option="title"/u);
  assert.match(html, /slot="title"/u);
  assert.doesNotMatch(html, /slot="summary"|data-drawer-summary/u);
  assert.match(html, /data-option="min-size"/u);
  assert.match(html, /data-option="max-size"/u);
  assert.match(main, /minSizeOption\.addEventListener\('change', applyBounds\)/u);
  assert.match(main, /maxSizeOption\.addEventListener\('change', applyBounds\)/u);
  assert.doesNotMatch(main, /(?:min|max)SizeOption\.addEventListener\('input', applyBounds\)/u);
  assert.doesNotMatch(main, /edgeOption|data-option="edge"|skinOption|data-option="skin"|densityOption|data-option="density"|toggle-drawer/u);
});

test('example catalog has the canonical order and every target exists', async () => {
  const { examples: catalog } = await import('../examples/shared/catalog.js');
  const { demos } = await import('../examples/component-demos/catalog.js');
  const html = fs.readFileSync(path.join(root, 'examples/index.html'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'examples/index.js'), 'utf8');
  assert.deepEqual(catalog.map(({ title }) => title), [
    'Signal Generator',
    'MIDI Controller',
    ...demos.map(({ title }) => title),
    'Parameter Sync',
  ]);
  assert.equal(catalog.some(({ id }) => id === 'component-demos'), false);
  assert.equal(catalog.some(({ group }) => group), false);

  for (const { href } of catalog) {
    const target = path.resolve(root, 'examples', href, 'index.html');
    assert.equal(fs.existsSync(target), true, href);
  }

  assert.doesNotMatch(html, /<section\b/u);
  assert.doesNotMatch(`${html}\n${index}`, /Component Demos/u);
  assert.match(index, /import '\.\/shared\/example-page\.js';/u);

  const oldComponentIndex = fs.readFileSync(
    path.join(root, 'examples/component-demos/index.html'), 'utf8');
  assert.match(oldComponentIndex, /http-equiv="refresh" content="0; url=\.\.\/"/u);
  assert.equal(fs.existsSync(path.join(root, 'examples/component-demos/index.js')), false);
});

test('every component demo is named after its element and listed in the README', async () => {
  const { demos } = await import('../examples/component-demos/catalog.js');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  for (const { id, title } of demos) {
    const html = fs.readFileSync(path.join(root, `examples/component-demos/${id}/index.html`), 'utf8');
    assert.equal(title, id, `${id} public name`);
    assert.match(readme, new RegExp(`\`${id}\``, 'u'), `${id} in the README`);
    assert.doesNotMatch(html, /docs\//u, `${id} links to a docs site that no longer exists`);
    assert.doesNotMatch(html, />Component demos</u, id);
  }
});

test('component demos inherit the shared theme preference without adding a picker', () => {
  const sharedDemo = fs.readFileSync(path.join(root, 'examples/component-demos/shared-demo.js'), 'utf8');
  assert.match(sharedDemo, /import '\.\.\/shared\/example-page\.js';/u);
  assert.doesNotMatch(sharedDemo, /setupThemeSelector|data-shared-theme-group/u);
});

test('documentation describes the current backend-neutral surface only', () => {
  const retiredProtocol = String.fromCharCode(72, 73, 68);
  const markdown = [
    fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
    ...findMarkdownFiles(path.join(root, 'docs'))
      .map((file) => fs.readFileSync(file, 'utf8')),
  ].join('\n');
  const obsoleteTerms = new RegExp([
    'Char' + 'dio',
    'Web' + retiredProtocol,
    `\\b${retiredProtocol}\\b`,
    'MIDI[ -]' + 'router',
  ].join('|'), 'iu');

  assert.doesNotMatch(markdown, obsoleteTerms);
  assert.match(markdown, /Web Audio/u);
  assert.match(markdown, /WebView/u);
});

test('the signal generator is a drawer-based plain AudioWorklet integration', () => {
  const directory = path.join(root, 'examples/signal-generator');
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(directory, 'main.js'), 'utf8');
  const worklet = fs.readFileSync(path.join(directory, 'worklets/signal-generator.js'), 'utf8');
  const sharedStyles = fs.readFileSync(path.join(root, 'examples/shared/styles.css'), 'utf8');
  const midiDrawerMarker = html.indexOf('data-midi-drawer\n        edge="left"');
  const midiDrawer = html.slice(
    html.lastIndexOf('<compost-drawer', midiDrawerMarker),
    html.indexOf('<main class="demo-page">', midiDrawerMarker),
  );

  assert.match(midiDrawer, /edge="left"/u);
  assert.match(html, /\.midi-drawer:not\(\[open\]\) \{[\s\S]*width: var\(--demo-toolbar-control-height\)/u);
  assert.match(midiDrawer, /data-midi-activity aria-hidden="true"/u);
  assert.match(main, /midi-message[\s\S]*midiActivityLED\.classList\.add\('active'\)[\s\S]*setTimeout/u);
  assert.match(midiDrawer, /<compost-midi id="midi" input-only>/u);
  assert.doesNotMatch(main, /webMIDI\.sendPackedMessage/u);
  assert.match(midiDrawer, /<compost-midi-mappings/u);
  assert.match(midiDrawer, /<compost-drawer class="midi-monitor-drawer" edge="top" label="MIDI Monitor">[\s\S]*<compost-midi-monitor/u);
  assert.match(html, /data-midi-map-button mode="switch" label="MIDI Map"/u);
  assert.equal((html.match(/<compost-number-box/gu) ?? []).length, 5);
  assert.match(html, /<compost-piano dock /u);
  assert.match(html, /periods-shown="4"/u);
  assert.match(html, /fft-size="32768"/u);
  assert.match(html, /data-trigger-value="external" aria-pressed="true">Ext<\/button>/u);
  assert.match(html, /data-window-mode="periods" aria-label="Periods" aria-pressed="true">Periods<\/button>/u);
  assert.match(html, /data-window-mode="samples" aria-label="Samples" aria-pressed="false">Samples<\/button>/u);
  assert.match(html, /data-trigger-value="external"[\s\S]*data-trigger-value="manual"/u);
  assert.match(html, /data-scope-x-labels[\s\S]*data-scope-y-labels/u);
  assert.match(html, /<compost-drawer class="settings-drawer" edge="top" label="Theme">/u);
  assert.match(html, /body\[data-midi-drawer-open\] \.demo-page[\s\S]*grid-column: 2/u);
  assert.match(html, /latency-hint="0"/u);
  assert.match(html, /class="theme-menu" data-theme-group role="menu"/u);
  assert.match(html, /<compost-drawer class="settings-drawer" edge="top" label="Theme">[\s\S]*<span slot="title" class="theme-icon" aria-hidden="true">[\s\S]*<svg/u);
  assert.match(html, /<div class="toolbar-preset">[\s\S]*<span>Preset<\/span>[\s\S]*<compost-select/u);
  assert.doesNotMatch(html, /Preset:/u);
  assert.doesNotMatch(`${html}\n${main}`, /data-latency-hint|latencyHintStorageKey|location\.reload\(\)|Base latency|Output latency/u);
  assert.doesNotMatch(sharedStyles, /theme-piano/u);
  assert.match(sharedStyles, /--piano-neutral-natural-bg/u);
  assert.equal((html.match(/data-theme-value=/gu) ?? []).length, 3);
  assert.equal((html.match(/data-wave-shape="/gu) ?? []).length, 3);
  assert.doesNotMatch(html, /Triangle/u);
  assert.match(html, /start-label="⏻"[\s\S]*start-aria-label="Start audio"/u);
  assert.match(html, /<compost-audio\s+[\s\S]*?modal\s+[\s\S]*?centered-while-off/u);
  assert.match(html, /compost-audio\[centered-while-off\]:not\(\[running\]\)[\s\S]*--compost-audio-button-size: 96px;[\s\S]*--compost-audio-button-font-size: 34px;[\s\S]*--compost-audio-modal-scrim: rgba\(8, 9, 8, 0\.88\)/u);
  assert.match(html, /<header class="demo-header" data-example-nav>[\s\S]*data-signal-preset-group/u);
  assert.match(html, /<compost-select[\s\S]*data-signal-preset-group/u);
  assert.doesNotMatch(html, /<select[\s\S]{0,160}data-signal-preset-group/u);
  assert.doesNotMatch(`${html}\n${main}\n${worklet}`, /impulse|data-close-audio|Theme: defaults|Theme: modern/u);
  assert.doesNotMatch(`${html}\n${main}`, /All Notes Off|parameter-id="panic"|allNotesOffButton/u);
  assert.match(main, /scopeCaptureSize = 32768/u);
  assert.match(worklet, /scopeCaptureSize = 1024/u);
  assert.match(main, /scope\.setAttribute\('frequency', String\(params\.frequency\)\)/u);
  assert.match(main, /triggerLevelControl\.toggleAttribute\('disabled', !\['up', 'down'\]\.includes\(scopeParams\.trigger\)\)/u);
  assert.doesNotMatch(html, /data-trigger-button/u);
  assert.match(main, /scopeParams\.trigger === 'manual'\) fireManualTrigger\(\)/u);
  assert.match(main, /function fireManualTrigger\(\) \{[\s\S]*publishScopeCapture\(\);[\s\S]*scope\.captureTrigger\(\)/u);
  assert.match(worklet, /type: 'scope-samples'/u);
  assert.match(main, /function syncMIDIDrawerLayout\(\)[\s\S]*data-midi-drawer-open/u);
  assert.match(main, /matchMedia\('\(max-width: 560px\)'\)/u);
  assert.match(main, /mobileDrawerLayout \? 'top' : 'left'/u);
  assert.match(html, /@media \(max-width: 560px\) \{[\s\S]*overflow-y: auto[\s\S]*grid-template-rows: 50px 50px[\s\S]*\.midi-drawer:not\(\[open\]\)[\s\S]*width: 100%/u);
  assert.match(main, /if \(active\) midiDrawer\.open = true;/u);
  assert.doesNotMatch(main, /midiDrawer\.open = active;/u);
  assert.match(html, /<div class="scope-stack">[\s\S]*<compost-scope[\s\S]*<div class="scope-controls">/u);
  assert.match(html, /data-scope-fps/u);
  assert.match(main, /scope\.addEventListener\('scope-frame',[\s\S]*recordScopeFrameRate\(detail\.time\)/u);
  assert.doesNotMatch(main, /function publishScopeCapture\(\)[\s\S]*recordScopeFrameRate\(\)/u);
  assert.match(
    fs.readFileSync(path.join(root, 'src/components/compost-scope.js'), 'utf8'),
    /if \(this\.draw\(\)\) \{[\s\S]*dispatchEvent\(new CustomEvent\('scope-frame',[\s\S]*detail: \{ time \}/u,
  );
  assert.match(main, /new AudioWorkletNode\(context, 'compost-signal-generator'/u);
  assert.match(worklet, /registerProcessor\('compost-signal-generator'/u);
  assert.doesNotMatch(`${html}\n${main}\n${worklet}`, /WASI|WebAssembly|\.wasm/u);
  execFileSync(process.execPath, ['--check', path.join(directory, 'main.js')]);
  execFileSync(process.execPath, ['--check', path.join(directory, 'worklets/signal-generator.js')]);
});
