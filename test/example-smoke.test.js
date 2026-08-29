import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { elementIDs, examples } from '../examples/shared/catalog.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);

test('the repository root redirects to the examples page', () => {
  const html = read('index.html');
  assert.match(html, /http-equiv="refresh" content="0; url=\.\/examples\/"/u);
});

test('the no-cache example server and checker share port 8000 by default', () => {
  assert.match(read('examples/serve.py'), /else 8000/u);
  assert.match(read('examples/check-example.mjs'), /process\.argv\[3\] \|\| '8000'/u);
  assert.match(read('examples/check-example.mjs'), /const root = resolve\(here, '\.\.'\)/u);
  assert.match(read('examples/check-example.mjs'), /process\.exitCode = 1/u);
});

test('the Pages assembly only copies tracked site directories', () => {
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /cp -R examples src _site\//u);
  assert.doesNotMatch(workflow, /cp -R docs/u);
});

test('every element example is its own page sharing the common shell', () => {
  const helper = read('examples/shared/element-page.js');
  for (const id of elementIDs) {
    assert.equal(examples.some((example) => example.id === id
      && example.href === `./${id}/`), true, id);
    const page = read(`examples/${id}/index.html`);
    assert.match(page, new RegExp(`data-example-id="${id}"`, 'u'), `${id} shell`);
    assert.match(page, /<div class="row">/u, `${id} row`);
    assert.doesNotMatch(page, /<pre id="markup"/u, `${id} has no source dump`);
    assert.match(page, /shared\/element-page\.js/u, `${id} uses the shared helper`);
    assert.match(page, new RegExp(`elementDemo\\('${id}`), `${id} mounts its demo`);
  }
  assert.match(helper, /example-page\.js/u);
  assert.doesNotMatch(helper, /\breview\b/u);
});

test('the shared example readout includes every literal component event', () => {
  const helper = read('examples/shared/element-page.js');
  const block = helper.match(/const EVENT_TYPES = \[([^;]+)\]/su);
  assert.ok(block);
  const declared = new Set(
    [...block[1].matchAll(/'([^']+)'/gu)].map((match) => match[1]));
  const componentSource = filesUnder('src/components')
    .filter((file) => file.endsWith('.js'))
    .map(read).join('\n');
  const emitted = [...componentSource.matchAll(/(?:new CustomEvent|eventOf)\('([^']+)'/gu)]
    .map((match) => match[1]);
  for (const type of new Set(emitted)) assert.equal(declared.has(type), true, type);
  for (const type of ['locator-prev', 'locator-next']) assert.equal(declared.has(type), true, type);
  assert.match(helper, /const elements = s\.querySelectorAll\(id\)/u);
  assert.match(helper, /for \(const element of elements\)/u);
  assert.match(helper, /element\.addEventListener\(type/u);
  assert.doesNotMatch(helper, /s\.addEventListener\(type/u);
});

test('example instructions match number-box pointer behavior', () => {
  const page = read('examples/compost-number-box/index.html');
  assert.match(page, /double-click to reset/u);
  assert.doesNotMatch(page, /double-click to type/u);
});

test('browser tests contain no diagnostic logging', () => {
  assert.doesNotMatch(read('e2e/compost.spec.js'), /console\.log\('U-22 rows'/u);
});

test('every example page shares the light and dark color-scheme toggle', () => {
  const toggle = read('examples/shared/color-scheme.js');
  const styles = read('examples/shared/styles.css');
  assert.match(toggle, /dataset\.colorScheme/u);
  assert.match(toggle, /Light mode/u);
  assert.match(toggle, /Dark mode/u);
  assert.match(styles, /--bg: Canvas/u);
  assert.match(styles, /data-color-scheme="dark"/u);
  assert.match(read('examples/shared/example-page.js'), /color-scheme\.js/u);
  assert.match(read('examples/monosynth/main.js'), /example-page\.js/u);
});

test('the retired theme surface stays out of source and examples', () => {
  const packageJSON = JSON.parse(read('package.json'));
  const exampleText = filesUnder('examples')
    .filter((file) => /\.(?:css|html|js)$/u.test(file))
    .map(read).join('\n');
  assert.equal(fs.existsSync(path.join(root, 'src/themes.css')), false);
  assert.equal(packageJSON.exports['./themes'], undefined);
  assert.doesNotMatch(exampleText, /data-compost-theme|data-shared-theme-group|themes\.css/u);
});

test('the Mono Synth uses current editor and one-channel scope contracts', () => {
  const html = read('examples/monosynth/index.html');
  const main = read('examples/monosynth/main.js');
  const worklet = read('examples/monosynth/worklets/monosynth.js');
  assert.match(html, /<compost-scope[^>]+value-range="1"/u);
  assert.match(html, /<compost-meter/u);
  assert.match(html, /<compost-number-box[^>]+parameter-id="scopeRange"/u);
  assert.match(html, /<compost-button[^>]+mode="trigger"[^>]+parameter-id="phaseReset"/u);
  assert.match(html, /data-scope-x-labels/u);
  assert.match(html, /class="app-frame"/u);
  assert.match(html, /<compost-select[^>]+parameter-id="waveShape"/u);
  assert.match(html, /<select data-synth-preset/u);
  assert.match(html, /<option value="kick" selected>Kick<\/option>/u);
  assert.match(html, /<compost-envelope-editor/u);
  assert.match(html, /label="Pitch envelope"/u);
  for (const id of ['attack', 'decay', 'sustain', 'release']) {
    assert.match(html, new RegExp(`parameter-id="${id}"`, 'u'));
  }
  assert.match(html, /<compost-note-editor/u);
  assert.doesNotMatch(html, /<compost-note-editor[^>]+\bloop(?:\s|=|>)/u);
  assert.doesNotMatch(html, /<compost-envelope-editor[^>]+\bgrid=/u);
  assert.match(html, /data-transport/u);
  assert.match(html, /class="keyboard-footer"/u);
  assert.match(main, /scope\.setSamples\(data\.samples\)/u);
  assert.match(main, /parameterID === 'phaseReset'/u);
  assert.match(main, /noteEditor\.addEventListener\('notes-change'/u);
  assert.match(main, /envelopeEditor\.addEventListener\('envelope-change'/u);
  assert.match(main, /type: 'pitchEnvelope'/u);
  assert.match(main, /kickNotes/u);
  assert.match(main, /isNoteOffMessage/u);
  assert.match(worklet, /type: 'scope-samples', samples, outputSamples/u);
  assert.match(worklet, /data\?\.type === 'resetPhase'/u);
  assert.match(worklet, /this\.stage = 'release'/u);
  assert.match(worklet, /pitchEnvelopeValue/u);
  assert.match(worklet, /this\.playing/u);
  assert.doesNotMatch(`${html}\n${main}\n${worklet}`, /parameter-id="mute"|name: 'mute'|parameters\.mute/u);
  assert.doesNotMatch(`${html}\n${main}`, /scopeWindow|scopeSamples|scopePeriods|scopeCapture|publishScopeWindow/u);
  assert.doesNotMatch(`${html}\n${main}`, /triggerSamples|source-channels|trigger-channel|periods-shown|samples-shown|captureTrigger/u);
  assert.match(main, /createParameterController/u);
  assert.match(main, /createMIDIMappings/u);
});

test('the integrated MIDI and parameter examples use current intent APIs', () => {
  const midiHTML = read('examples/midi-controller/index.html');
  const midiMain = read('examples/midi-controller/main.js');
  const syncMain = read('examples/parameter-sync/main.js');
  assert.match(midiHTML, /mode="trigger" parameter-id="all-notes-off"/u);
  assert.match(midiMain, /midi-output-selected[^\n]+selectOutput/u);
  assert.match(midiMain, /button-trigger/u);
  assert.match(syncMain, /createParameterController/u);
  assert.match(syncMain, /parameters\.applyValue/u);
});

test('README is the finished product documentation', () => {
  const readme = read('README.md');
  for (const id of elementIDs) assert.match(readme, new RegExp(`\`${id}\``, 'u'), id);
  assert.match(readme, /not form-associated/u);
  assert.doesNotMatch(readme, /\breview\b/u);
  assert.equal(fs.existsSync(path.join(root, 'docs/plans/2026-08-26-plain-html-style.md')), false);
});

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function filesUnder(directory) {
  const walk = (relative) => fs.readdirSync(path.join(root, relative), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory()
      ? walk(path.join(relative, entry.name))
      : [path.join(relative, entry.name)]);
  return walk(directory);
}
