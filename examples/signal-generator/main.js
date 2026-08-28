import '../../src/components/index.js';
import '../shared/example-page.js';
import { isNoteOffMessage, isNoteOnMessage, midiNoteToFrequency, noteFromMessage } from '../../src/midi.js';
import { createMIDIMappings } from '../../src/midi-mappings.js';
import { createParameterController } from '../../src/parameter-controller.js';

const values = {
  waveShape: 1,
  frequency: 220,
  amplitude: .8,
  offset: 0,
  outputGain: .5,
};

const displayValues = { scopeRange: 1, scopeOffset: 0 };

const audioControl = document.querySelector('compost-audio');
const scope = document.querySelector('compost-scope');
const meter = document.querySelector('compost-meter');
const piano = document.querySelector('compost-piano');
const midi = document.querySelector('compost-midi');
const midiDrawer = document.querySelector('.midi-drawer');
const mappingsView = document.querySelector('compost-midi-mappings');
const mapToggle = document.querySelector('[data-midi-map-toggle]');
const preset = document.querySelector('[data-signal-preset]');
const yLabels = document.querySelector('[data-scope-y-labels]');
const scopeFPS = document.querySelector('[data-scope-fps]');
const midiActivity = document.querySelector('[data-midi-activity]');
const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameterProvider: parameters });
let audio = null;
let midiActivityTimeout = 0;
let scopeFrames = 0;
let scopeFrameStart = performance.now();

mappingsView.mappings = mappings;
mappings.addEventListener('midi-mapping-request', ({ detail }) => mappings.applyMapping(detail));
mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
mappings.applyMappings([
  { parameterID: 'outputGain', cc: 7 },
  { parameterID: 'frequency', cc: 74 },
  { parameterID: 'amplitude', cc: 20 },
  { parameterID: 'offset', cc: 71 },
  { parameterID: 'waveShape', cc: 79 },
  { parameterID: 'scopeRange', cc: 77 },
  { parameterID: 'scopeOffset', cc: 78 },
]);

parameters.addEventListener('parameter-edit', ({ detail }) => setValue(detail.parameterID, detail.value, detail.source));
mappings.addEventListener('midi-parameter', ({ detail }) => setValue(detail.parameterID, detail.value, 'midi'));

mapToggle.addEventListener('click', () => {
  const active = mapToggle.getAttribute('aria-pressed') !== 'true';
  mapToggle.setAttribute('aria-pressed', String(active));
  if (active) mappingsView.controller?.beginSelecting();
  else mappingsView.controller?.cancel('toolbar');
});

preset.addEventListener('change', () => applyPreset(preset.value));
yLabels.addEventListener('input', () => scope.setAttribute('y-marker-labels', yLabels.value));
scope.addEventListener('scope-frame', ({ detail }) => {
  scopeFrames += 1;
  const elapsed = detail.time - scopeFrameStart;
  if (elapsed < 1000) return;
  scopeFPS.textContent = `${Math.round(scopeFrames * 1000 / elapsed)} fps`;
  scopeFPS.setAttribute('aria-label', `Scope render rate ${scopeFPS.textContent}`);
  scopeFrames = 0;
  scopeFrameStart = detail.time;
});

function syncDrawerLayout() {
  document.body.toggleAttribute('data-midi-drawer-open', midiDrawer.open);
  document.documentElement.style.setProperty('--midi-drawer-space', midiDrawer.open ? `${midiDrawer.getBoundingClientRect().width}px` : '0px');
}

midiDrawer.addEventListener('toggle', () => requestAnimationFrame(syncDrawerLayout));
midiDrawer.addEventListener('drawer-resize', () => requestAnimationFrame(syncDrawerLayout));
syncDrawerLayout();
mappingsView.addEventListener('midi-map-mode-change', ({ detail }) => {
  mapToggle.setAttribute('aria-pressed', String(detail.active));
  if (detail.active) midiDrawer.open = true;
});

midi.addEventListener('midi-input-selected', ({ detail }) => midi.selectInput(detail.id));
midi.addEventListener('midi-message', (event) => {
  clearTimeout(midiActivityTimeout);
  midiActivity.classList.add('active');
  midiActivityTimeout = setTimeout(() => midiActivity.classList.remove('active'), 60);
  mappings.handleMIDIMessage(event);
  piano.handleExternalMIDI(event.detail.message);
  handlePackedNote(event.detail.message, 'midi');
});

piano.addEventListener('note-down', ({ detail }) => noteOn(detail.note, 'piano'));
piano.addEventListener('note-up', ({ detail }) => audio?.oscillator.port.postMessage({ type: 'noteOff', note: detail.note }));

audioControl.addEventListener('audio-started', ({ detail }) => setupAudio(detail.context));
audioControl.addEventListener('audio-stopped', cleanupAudio);

async function setupAudio(context) {
  if (audio?.context === context) return;
  cleanupAudio();
  await context.audioWorklet.addModule('./worklets/signal-generator.js');
  const oscillator = new AudioWorkletNode(context, 'compost-signal-generator', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    parameterData: values,
  });
  oscillator.connect(context.destination);
  oscillator.port.onmessage = ({ data }) => {
    if (data?.type === 'scope-samples' && data.samples instanceof Float32Array) {
      scope.setSamples(data.samples);
      updateMeter(data.samples);
    }
  };
  audio = { context, oscillator };
  syncAudioParameters();
}

function cleanupAudio() {
  audio?.oscillator.disconnect();
  audio = null;
  meter.setState({ channels: [{ primary: -60, secondary: -60 }] });
}

function updateMeter(samples) {
  let peak = 0;
  let squares = 0;
  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    squares += sample * sample;
  }
  meter.setState({
    primaryLabel: 'Peak',
    secondaryLabel: 'RMS',
    unit: 'dB',
    channels: [{
      primary: decibels(peak),
      secondary: decibels(Math.sqrt(squares / samples.length)),
      clipped: peak >= 1,
    }],
  });
}

function decibels(value) {
  return Math.max(-60, 20 * Math.log10(Math.max(value, .001)));
}

function setValue(parameterID, value, source) {
  if (parameterID in values) setParameter(parameterID, value, source);
  else if (parameterID in displayValues) setDisplayValue(parameterID, value, source);
}

function setParameter(parameterID, value, source) {
  if (!(parameterID in values)) return;
  values[parameterID] = Number(value);
  parameters.applyValue(parameterID, values[parameterID], { source });
  const parameter = audio?.oscillator.parameters.get(parameterID);
  if (parameter) parameter.setTargetAtTime(values[parameterID], audio.context.currentTime, .01);
}

function setDisplayValue(parameterID, value, source) {
  displayValues[parameterID] = Number(value);
  parameters.applyValue(parameterID, displayValues[parameterID], { source });
  if (parameterID === 'scopeRange') scope.setAttribute('value-range', String(displayValues[parameterID]));
  if (parameterID === 'scopeOffset') scope.setAttribute('y-offset', String(displayValues[parameterID]));
}

function applyPreset(name) {
  const presets = {
    'saw-standard': { waveShape: 1, frequency: 220, amplitude: .8, offset: 0, scopeRange: 1, scopeOffset: 0, labels: '-.5,0,.5' },
    'sine-labels': { waveShape: 0, frequency: 110, amplitude: .8, offset: 0, scopeRange: 1, scopeOffset: 0, labels: '-.5:low,0:center,.5:high' },
    'unipolar-square': { waveShape: 2, frequency: 55, amplitude: .5, offset: .5, scopeRange: .5, scopeOffset: .5, labels: '0:min,.5:center,1:max' },
  };
  const selected = presets[name];
  if (!selected) return;
  for (const id of ['waveShape', 'frequency', 'amplitude', 'offset']) setParameter(id, selected[id], 'preset');
  for (const id of ['scopeRange', 'scopeOffset']) setDisplayValue(id, selected[id], 'preset');
  yLabels.value = selected.labels;
  scope.setAttribute('y-marker-labels', selected.labels);
}

function syncAudioParameters() {
  for (const [id, value] of Object.entries(values)) setParameter(id, value, 'setup');
}

function noteOn(note, source) {
  setParameter('frequency', midiNoteToFrequency(note), source);
  audio?.oscillator.port.postMessage({ type: 'noteOn', note });
}

function handlePackedNote(message, source) {
  if (isNoteOnMessage(message)) noteOn(noteFromMessage(message), source);
  else if (isNoteOffMessage(message)) audio?.oscillator.port.postMessage({ type: 'noteOff', note: noteFromMessage(message) });
}

cleanupAudio();
