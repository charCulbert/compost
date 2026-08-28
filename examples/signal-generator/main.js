import '../../src/components/index.js';
import '../shared/example-page.js';
import { isNoteOnMessage, midiNoteToFrequency, noteFromMessage } from '../../src/midi.js';
import { createMIDIMappings } from '../../src/midi-mappings.js';
import { createParameterController } from '../../src/parameter-controller.js';

const values = {
  waveShape: 1,
  frequency: 220,
  amplitude: .8,
  offset: 0,
  outputGain: .5,
};

const displayValues = {
  scopeWindow: 1,
  scopeSamples: 1024,
  scopePeriods: 4,
  scopeRange: 1,
  scopeOffset: 0,
};
const scopeCapture = new Float32Array(32768);

const audioControl = document.querySelector('compost-audio');
const scope = document.querySelector('compost-scope');
const meter = document.querySelector('compost-meter');
const piano = document.querySelector('compost-piano');
const midi = document.querySelector('compost-midi');
const midiDrawer = document.querySelector('.midi-drawer');
const mappingsView = document.querySelector('compost-midi-mappings');
const mapToggle = document.querySelector('[data-midi-map-toggle]');
const preset = document.querySelector('[data-signal-preset]');
const samplesControl = document.querySelector('[data-samples-control]');
const periodsControl = document.querySelector('[data-periods-control]');
const xLabels = document.querySelector('[data-scope-x-labels]');
const yLabels = document.querySelector('[data-scope-y-labels]');
const scopeFPS = document.querySelector('[data-scope-fps]');
const midiActivity = document.querySelector('[data-midi-activity]');
const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameterProvider: parameters });
let audio = null;
let midiActivityTimeout = 0;
let scopeFrames = 0;
let scopeFrameStart = performance.now();
let scopeCaptureWriteIndex = 0;
let scopeCaptureLength = 0;

mappingsView.mappings = mappings;
mappings.addEventListener('midi-mapping-request', ({ detail }) => mappings.applyMapping(detail));
mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
mappings.applyMappings([
  { parameterID: 'outputGain', cc: 7 },
  { parameterID: 'frequency', cc: 74 },
  { parameterID: 'amplitude', cc: 20 },
  { parameterID: 'offset', cc: 71 },
  { parameterID: 'waveShape', cc: 79 },
  { parameterID: 'scopeSamples', cc: 76 },
  { parameterID: 'scopePeriods', cc: 81 },
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
xLabels.addEventListener('input', () => scope.setAttribute('x-marker-labels', xLabels.value));
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
    if (data?.type === 'scope-samples'
        && data.samples instanceof Float32Array
        && data.outputSamples instanceof Float32Array) {
      captureScopeSamples(data.samples);
      updateMeter(data.outputSamples);
    }
  };
  audio = { context, oscillator };
  syncAudioParameters();
}

function cleanupAudio() {
  audio?.oscillator.disconnect();
  audio = null;
  scopeCapture.fill(0);
  scopeCaptureWriteIndex = 0;
  scopeCaptureLength = 0;
  meter.setState({ channels: [{ primary: -60, secondary: -60 }] });
}

function captureScopeSamples(samples) {
  for (const sample of samples) {
    scopeCapture[scopeCaptureWriteIndex] = sample;
    scopeCaptureWriteIndex = (scopeCaptureWriteIndex + 1) % scopeCapture.length;
  }
  scopeCaptureLength = Math.min(scopeCapture.length, scopeCaptureLength + samples.length);
  publishScopeWindow();
}

function publishScopeWindow() {
  const requested = displayValues.scopeWindow === 0
    ? displayValues.scopeSamples
    : displayValues.scopePeriods * (audio?.context.sampleRate || 48000) / values.frequency;
  const length = Math.max(2, Math.min(scopeCaptureLength, Math.round(requested)));
  if (scopeCaptureLength < 2) return;

  const samples = new Float32Array(length);
  const start = (scopeCaptureWriteIndex - length + scopeCapture.length) % scopeCapture.length;
  const firstLength = Math.min(length, scopeCapture.length - start);
  samples.set(scopeCapture.subarray(start, start + firstLength));
  if (firstLength < length) samples.set(scopeCapture.subarray(0, length - firstLength), firstLength);
  scope.setSamples(samples);
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
  if (parameterID === 'scopeWindow') {
    samplesControl.hidden = displayValues.scopeWindow !== 0;
    periodsControl.hidden = displayValues.scopeWindow !== 1;
  }
  if (parameterID === 'scopeWindow'
      || parameterID === 'scopeSamples'
      || parameterID === 'scopePeriods') publishScopeWindow();
}

function applyPreset(name) {
  const presets = {
    'saw-standard': { waveShape: 1, frequency: 220, amplitude: .8, offset: 0, scopeWindow: 1, scopeSamples: 1024, scopePeriods: 4, scopeRange: 1, scopeOffset: 0, xLabels: '0:start,.5:middle,1:end', yLabels: '-.5,0,.5' },
    'sine-labels': { waveShape: 0, frequency: 110, amplitude: .8, offset: 0, scopeWindow: 1, scopeSamples: 1536, scopePeriods: 4, scopeRange: 1, scopeOffset: 0, xLabels: '0:start,.5:middle,1:end', yLabels: '-.5:low,0:center,.5:high' },
    'unipolar-square': { waveShape: 2, frequency: 55, amplitude: .5, offset: .5, scopeWindow: 0, scopeSamples: 1024, scopePeriods: 4, scopeRange: .5, scopeOffset: .5, xLabels: '0:start,.5:middle,1:end', yLabels: '0:min,.5:center,1:max' },
  };
  const selected = presets[name];
  if (!selected) return;
  for (const id of ['waveShape', 'frequency', 'amplitude', 'offset']) setParameter(id, selected[id], 'preset');
  for (const id of ['scopeWindow', 'scopeSamples', 'scopePeriods', 'scopeRange', 'scopeOffset']) setDisplayValue(id, selected[id], 'preset');
  xLabels.value = selected.xLabels;
  yLabels.value = selected.yLabels;
  scope.setAttribute('x-marker-labels', selected.xLabels);
  scope.setAttribute('y-marker-labels', selected.yLabels);
}

function syncAudioParameters() {
  for (const [id, value] of Object.entries(values)) setParameter(id, value, 'setup');
}

function noteOn(note, source) {
  setParameter('frequency', midiNoteToFrequency(note), source);
}

function handlePackedNote(message, source) {
  if (isNoteOnMessage(message)) noteOn(noteFromMessage(message), source);
}

cleanupAudio();
