import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const elementIDs = [
  'compost-audio', 'compost-midi', 'compost-device-selector', 'compost-drawer',
  'compost-knob', 'compost-slider', 'compost-meter', 'compost-number-box',
  'compost-button', 'compost-select', 'compost-piano', 'compost-scope',
  'compost-midi-monitor', 'compost-midi-mappings', 'compost-clip-grid',
  'compost-envelope-editor', 'compost-note-editor', 'compost-timeline',
  'compost-window', 'compost-popup',
];

test('the repository root redirects to the examples page', () => {
  const html = read('index.html');
  assert.match(html, /http-equiv="refresh" content="0; url=\.\/examples\/"/u);
});

test('the no-cache review server and checker share port 8000 by default', () => {
  assert.match(read('examples/review/serve.py'), /else 8000/u);
  assert.match(read('examples/review/review-check.mjs'), /process\.argv\[3\] \|\| '8000'/u);
});

test('the review page is the one source of element examples', async () => {
  const { examples } = await import('../examples/shared/catalog.js');
  const review = read('examples/review/review.html');
  assert.equal(fs.existsSync(path.join(root, 'examples/component-demos/catalog.js')), false);
  for (const id of elementIDs) {
    assert.equal(examples.some((example) => example.id === id
      && example.href === `./review/review.html?el=${id}`), true, id);
    assert.match(review, new RegExp(`<template id="${id}">`, 'u'), `${id} template`);
  }
  assert.match(review, /<pre id="markup"/u);
  assert.doesNotMatch(review, /Branded page|allContexts/u);
  assert.match(review, /shared\/color-scheme\.js/u);
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
  assert.match(read('examples/signal-generator/main.js'), /color-scheme\.js/u);
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

test('the Signal Generator uses the current one-channel scope contract', () => {
  const html = read('examples/signal-generator/index.html');
  const main = read('examples/signal-generator/main.js');
  const worklet = read('examples/signal-generator/worklets/signal-generator.js');
  assert.match(html, /<compost-scope[^>]+value-range="1"/u);
  assert.match(main, /scope\.setSamples\(data\.samples\)/u);
  assert.match(worklet, /type: 'scope-samples', samples/u);
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
  assert.match(readme, /source of truth for each[\s\S]+element example/u);
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
