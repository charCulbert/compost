import assert from 'node:assert/strict';
import test from 'node:test';
import { createMIDIMappings } from '../src/midi-mappings.js';
import { MIDILearnUI } from '../src/midi-learn-ui.js';
import { createParameterController } from '../src/parameter-controller.js';
import { FakeControl, FakeRoot, keyEvent, tick } from './helpers/fakes.js';

function setup() {
  const target = new FakeControl({ 'parameter-id': 'gain', label: 'Gain', min: 0, max: 1, value: 0.5 });
  const secondTarget = new FakeControl({ 'parameter-id': 'tone', label: 'Tone', min: 0, max: 1, value: 0.5 });
  const root = new FakeRoot([target, secondTarget]);
  const parameters = createParameterController({ root });
  const mappings = createMIDIMappings({ parameterProvider: parameters });
  mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
  const button = new FakeControl({ textContent: 'Map MIDI' }, 'button');
  const status = { textContent: '' };
  return { target, secondTarget, mappings, ui: new MIDILearnUI({ mappings, root, button, status }), status };
}

function hasMIDIMapState(target, state) {
  return String(target.getAttribute('midi-map-state') || '').split(/\s+/u).includes(state);
}

test('MIDILearnUI clears a selected mapping with Delete while staying in map mode', async () => {
  const { target, mappings, ui, status } = setup();
  mappings.applyMapping({ parameterID: 'gain', cc: 7, channel: 1 });
  ui.beginSelecting();
  const event = keyEvent('Delete', target);
  ui.handleKeyDown(event);
  await tick();
  assert.equal(event.defaultPrevented, true);
  assert.equal(mappings.get('gain'), null);
  assert.equal(ui.state, 'selecting');
  assert.match(status.textContent, /mapping cleared/u);
  ui.disconnect();
});

test('MIDILearnUI leaves Backspace in text inputs alone', () => {
  const { ui } = setup();
  ui.beginSelecting();
  const input = new FakeControl({ type: 'text' }, 'input');
  const event = keyEvent('Backspace', input);
  ui.handleKeyDown(event);
  assert.equal(event.defaultPrevented, undefined);
  ui.disconnect();
});

test('MIDILearnUI Escape exits and Cmd-M enters map mode', () => {
  const { target, ui } = setup();
  ui.handleKeyDown(keyEvent('m', target, { metaKey: true }));
  assert.equal(ui.state, 'learning');
  ui.handleKeyDown(keyEvent('Escape', target));
  assert.equal(ui.state, 'idle');
  ui.disconnect();
});

test('MIDILearnUI ignores an unmodified m so typing stays safe', () => {
  const { target, ui } = setup();
  ui.handleKeyDown(keyEvent('m', target));
  assert.equal(ui.state, 'idle');
  ui.disconnect();
});

test('MIDILearnUI ignores Cmd-M while the caret is in a text field', () => {
  const { ui } = setup();
  const input = new FakeControl({ type: 'text' }, 'input');
  ui.handleKeyDown(keyEvent('m', input, { metaKey: true }));
  assert.equal(ui.state, 'idle');
  ui.disconnect();
});

test('MIDILearnUI reports map-mode entry and exit', () => {
  const { ui } = setup();
  const states = [];
  ui.onStateChange = (state) => states.push(state);

  ui.beginSelecting();
  ui.cancel('toolbar');

  assert.deepEqual(states, ['selecting', 'idle']);
  ui.disconnect();
});

test('MIDILearnUI focus starts learning and announces confirmed mappings', async () => {
  const { target, mappings, ui, status } = setup();
  ui.beginSelecting();
  ui.handleFocusIn({ target, composedPath: () => [target] });

  assert.equal(ui.state, 'learning');
  assert.equal(hasMIDIMapState(target, 'active'), true);
  assert.equal(target.getAttribute('aria-description'), 'Move a MIDI CC to map. Escape exits.');
  await tick();
  assert.match(status.textContent, /Gain.*Move a CC to map/u);

  mappings.applyMapping({ parameterID: 'gain', cc: 74, channel: 2 });
  await tick();
  assert.match(status.textContent, /Gain\. Mapped to MIDI channel 2, CC 74\. Move a CC to remap/u);
  assert.equal(ui.mappingLabelForTarget(target), 'ch 2 CC 74');
  assert.equal(ui.state, 'learning');
  assert.equal(hasMIDIMapState(target, 'active'), true);
  assert.match(target.getAttribute('aria-description'), /Mapped to MIDI channel 2, CC 74/u);

  ui.handleFocusOut({ relatedTarget: null });
  assert.equal(hasMIDIMapState(target, 'active'), true);
  ui.disconnect();
});

test('MIDILearnUI can mirror a plug-in target without stealing focus', () => {
  const { target, ui } = setup();
  let focusCount = 0;
  target.focus = () => { focusCount += 1; };

  ui.beginSelecting();
  assert.equal(ui.selectTarget(target, { focus: false }), true);
  assert.equal(ui.state, 'learning');
  assert.equal(focusCount, 0);
  assert.equal(hasMIDIMapState(target, 'active'), true);
  ui.disconnect();
});

test('MIDILearnUI restores the mapped target focus after host confirmation', () => {
  const { target, mappings, ui } = setup();
  let focusCount = 0;
  target.focus = () => { focusCount += 1; };

  ui.beginSelecting();
  assert.equal(ui.selectTarget(target, { focus: false }), true);
  mappings.applyMapping({ parameterID: 'gain', cc: 74, channel: 2 });

  assert.equal(focusCount, 1);
  assert.equal(ui.state, 'learning');
  assert.equal(ui.lastTarget, target);
  ui.disconnect();
});

test('MIDILearnUI maps two plug-in targets in one map-mode run', () => {
  const { target, secondTarget, mappings, ui } = setup();

  ui.beginSelecting();
  assert.equal(ui.selectTarget(target, { focus: false }), true);
  mappings.applyMapping({ parameterID: 'gain', cc: 7, channel: null });
  assert.equal(ui.state, 'learning');
  assert.equal(hasMIDIMapState(target, 'active'), true);

  assert.equal(ui.selectTarget(secondTarget, { focus: false }), true);
  assert.equal(ui.state, 'learning');
  assert.equal(hasMIDIMapState(target, 'active'), false);
  assert.equal(hasMIDIMapState(secondTarget, 'active'), true);

  mappings.applyMapping({ parameterID: 'tone', cc: 74, channel: null });
  assert.equal(ui.state, 'learning');
  assert.equal(mappings.get('gain').cc, 7);
  assert.equal(mappings.get('tone').cc, 74);
  assert.equal(hasMIDIMapState(secondTarget, 'active'), true);
  ui.disconnect();
});

test('MIDILearnUI Backspace clears a focused mapping outside text editors', async () => {
  const { target, mappings, ui } = setup();
  mappings.applyMapping({ parameterID: 'gain', cc: 7, channel: null });
  ui.beginSelecting();
  const event = keyEvent('Backspace', target);
  ui.handleKeyDown(event);
  await tick();

  assert.equal(event.defaultPrevented, true);
  assert.equal(mappings.get('gain'), null);
  ui.disconnect();
});
