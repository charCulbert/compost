import '../../src/components/index.js';
import '../shared/example-page.js';
import { isNoteOffMessage, isNoteOnMessage, noteFromMessage } from '../../src/midi.js';
import { createMIDIMappings } from '../../src/midi-mappings.js';
import { createParameterController } from '../../src/parameter-controller.js';
import { quantizedNotes } from '../../src/piano-roll-model.js';

const values = {
  waveShape: 0,
  transpose: 0,
  amplitude: .8,
  offset: 0,
  outputGain: .5,
  tempo: 120,
  attack: .001,
  decay: .08,
  sustain: .07,
  release: .08,
};
const displayValues = { scopeRange: 1, scopeOffset: 0 };
let pitchEnvelope = [
  { time: 0, value: 12, curve: -.35 },
  { time: .15, value: -12 },
  { time: 1, value: -12 },
];
const melodicNotes = [
  { id: 'note-1', note: 60, start: 0, duration: .45, velocity: 110, channel: 0 },
  { id: 'note-2', note: 64, start: .5, duration: .45, velocity: 96, channel: 0 },
  { id: 'note-3', note: 67, start: 1, duration: .45, velocity: 104, channel: 0 },
  { id: 'note-4', note: 71, start: 1.5, duration: .45, velocity: 92, channel: 0 },
  { id: 'note-5', note: 72, start: 2, duration: .7, velocity: 116, channel: 0 },
  { id: 'note-6', note: 67, start: 2.75, duration: .2, velocity: 88, channel: 0 },
  { id: 'note-7', note: 64, start: 3, duration: .45, velocity: 100, channel: 0 },
  { id: 'note-8', note: 62, start: 3.5, duration: .45, velocity: 94, channel: 0 },
];
const kickNotes = [
  { id: 'kick-1', note: 48, start: 0, duration: .25, velocity: 110, channel: 0 },
  { id: 'kick-2', note: 55, start: 1.5, duration: .0625, velocity: 100, channel: 0 },
  { id: 'kick-3', note: 46, start: 3, duration: 1, velocity: 105, channel: 0 },
];
let notes = kickNotes.map((note) => ({ ...note }));

const audioControl = document.querySelector('compost-audio');
const scope = document.querySelector('compost-scope');
const meter = document.querySelector('compost-meter');
const piano = document.querySelector('compost-piano');
const noteEditor = document.querySelector('compost-note-editor');
const envelopeEditor = document.querySelector('compost-envelope-editor');
const midi = document.querySelector('compost-midi');
const midiDrawer = document.querySelector('.midi-drawer');
const mappingsView = document.querySelector('compost-midi-mappings');
const mapToggle = document.querySelector('[data-midi-map-toggle]');
const transport = document.querySelector('[data-transport]');
const preset = document.querySelector('[data-synth-preset]');
const xLabels = document.querySelector('[data-scope-x-labels]');
const yLabels = document.querySelector('[data-scope-y-labels]');
const scopeFPS = document.querySelector('[data-scope-fps]');
const midiActivity = document.querySelector('[data-midi-activity]');
const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameterProvider: parameters });
let audio = null;
let audioSetup = null;
let playing = false;
let nextNoteID = 9;
let midiActivityTimeout = 0;
let scopeFrames = 0;
let scopeFrameStart = performance.now();

noteEditor.noteIdFactory = () => `note-${nextNoteID++}`;
noteEditor.notes = notes;
envelopeEditor.points = pitchEnvelope;
mappingsView.mappings = mappings;
mappings.addEventListener('midi-mapping-request', ({ detail }) => mappings.applyMapping(detail));
mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
mappings.applyMappings([
  { parameterID: 'outputGain', cc: 7 },
  { parameterID: 'transpose', cc: 74 },
  { parameterID: 'amplitude', cc: 20 },
  { parameterID: 'offset', cc: 71 },
  { parameterID: 'waveShape', cc: 79 },
  { parameterID: 'phaseReset', cc: 80 },
  { parameterID: 'tempo', cc: 76 },
  { parameterID: 'attack', cc: 73 },
  { parameterID: 'decay', cc: 75 },
  { parameterID: 'sustain', cc: 70 },
  { parameterID: 'release', cc: 72 },
  { parameterID: 'scopeRange', cc: 77 },
  { parameterID: 'scopeOffset', cc: 78 },
]);

parameters.addEventListener('parameter-edit', ({ detail }) => applyParameterIntent(detail));
mappings.addEventListener('midi-parameter', ({ detail }) => applyParameterIntent({ ...detail, source: 'midi' }));

mapToggle.addEventListener('click', () => {
  const active = mapToggle.getAttribute('aria-pressed') !== 'true';
  mapToggle.setAttribute('aria-pressed', String(active));
  if (active) mappingsView.controller?.beginSelecting();
  else mappingsView.controller?.cancel('toolbar');
});

transport.addEventListener('click', async () => {
  const context = await audioControl.start();
  if (!context) return;
  await setupAudio(context);
  playing = !playing;
  transport.textContent = playing ? 'Stop' : 'Play';
  transport.setAttribute('aria-pressed', String(playing));
  audio?.synth.port.postMessage({ type: 'transport', playing });
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

noteEditor.addEventListener('notes-change', ({ detail }) => {
  notes = detail.notes;
  noteEditor.notes = notes;
  postSequence();
});
noteEditor.addEventListener('note-quantize', ({ detail }) => {
  notes = quantizedNotes(notes, detail.step,
    { ids: detail.ids, lengths: detail.lengths, beats: noteEditor.beats });
  noteEditor.notes = notes;
  postSequence();
});
noteEditor.addEventListener('note-preview', ({ detail }) => postNote('noteOn', detail, 'editor'));
noteEditor.addEventListener('note-preview-end', ({ detail }) => postNote('noteOff', detail, 'editor'));

envelopeEditor.addEventListener('envelope-input', ({ detail }) => postPitchEnvelope(detail.points));
envelopeEditor.addEventListener('envelope-change', ({ detail }) => {
  pitchEnvelope = detail.points;
  envelopeEditor.points = pitchEnvelope;
  postPitchEnvelope(pitchEnvelope);
});

function syncDrawerLayout() {
  document.body.toggleAttribute('data-midi-drawer-open', midiDrawer.open);
  const occupiesLeftEdge = midiDrawer.open && midiDrawer.getAttribute('edge') === 'left';
  document.documentElement.style.setProperty('--midi-drawer-space', occupiesLeftEdge ? `${midiDrawer.getBoundingClientRect().width}px` : '0px');
}

const narrowLayout = matchMedia('(max-width: 44em)');
function syncDrawerEdge() {
  midiDrawer.setAttribute('edge', narrowLayout.matches ? 'top' : 'left');
  requestAnimationFrame(syncDrawerLayout);
}

midiDrawer.addEventListener('toggle', () => requestAnimationFrame(syncDrawerLayout));
midiDrawer.addEventListener('drawer-resize', () => requestAnimationFrame(syncDrawerLayout));
narrowLayout.addEventListener('change', syncDrawerEdge);
syncDrawerEdge();
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

piano.addEventListener('note-down', ({ detail }) => postNote('noteOn', detail, 'piano'));
piano.addEventListener('note-up', ({ detail }) => postNote('noteOff', detail, 'piano'));

audioControl.addEventListener('audio-started', ({ detail }) => setupAudio(detail.context));
audioControl.addEventListener('audio-stopped', cleanupAudio);

async function setupAudio(context) {
  if (audio?.context === context) return audio;
  if (audioSetup) return audioSetup;
  audioSetup = (async () => {
    cleanupAudio();
    await context.audioWorklet.addModule('./worklets/monosynth.js');
    const synth = new AudioWorkletNode(context, 'compost-mono-synth', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: values,
    });
    synth.connect(context.destination);
    synth.port.onmessage = ({ data }) => {
      if (data?.type !== 'scope-samples'
        || !(data.samples instanceof Float32Array)
        || !(data.outputSamples instanceof Float32Array)) return;
      scope.setSamples(data.samples);
      updateMeter(data.outputSamples);
      noteEditor.playhead = data.beat;
      noteEditor.refresh();
    };
    audio = { context, synth };
    syncAudioParameters();
    postSequence();
    postPitchEnvelope(pitchEnvelope);
    synth.port.postMessage({ type: 'transport', playing });
    return audio;
  })();
  try { return await audioSetup; } finally { audioSetup = null; }
}

function cleanupAudio() {
  audio?.synth.disconnect();
  audio = null;
  meter.setState({ channels: [{ primary: -60, secondary: -60 }] });
}

function applyParameterIntent({ parameterID, value, source }) {
  if (parameterID === 'phaseReset') {
    if (value === 1) audio?.synth.port.postMessage({ type: 'resetPhase' });
    return;
  }
  setValue(parameterID, value, source);
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
  const parameter = audio?.synth.parameters.get(parameterID);
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
    kick: {
      waveShape: 0, transpose: 0, amplitude: .8, offset: 0,
      adsr: [.001, .08, .07, .08],
      pitch: [[0, 12, -.35], [.15, -12], [1, -12]],
      notes: kickNotes,
      rootNote: 45,
    },
    'saw-pluck': { waveShape: 1, transpose: 0, amplitude: .8, offset: 0, adsr: [.08, .2, .65, .35], pitch: [[0, 12, -.35], [.05, -12, .35], [.1, 0], [1, 0]], notes: melodicNotes, rootNote: 48 },
    'sine-pad': { waveShape: 0, transpose: -12, amplitude: .8, offset: 0, adsr: [.35, .6, .75, 1.4], pitch: [[0, 0], [1, 0]], notes: melodicNotes, rootNote: 48 },
    'square-short': { waveShape: 2, transpose: 0, amplitude: .5, offset: .5, adsr: [.005, .08, .8, .12], pitch: [[0, -12], [.08, 0], [1, 0]], notes: melodicNotes, rootNote: 48 },
  };
  const selected = presets[name];
  if (!selected) return;
  for (const id of ['waveShape', 'transpose', 'amplitude', 'offset']) setParameter(id, selected[id], 'preset');
  ['attack', 'decay', 'sustain', 'release'].forEach((id, index) =>
    setParameter(id, selected.adsr[index], 'preset'));
  pitchEnvelope = selected.pitch.map(([time, value, curve]) => ({ time, value, curve }));
  envelopeEditor.points = pitchEnvelope;
  postPitchEnvelope(pitchEnvelope);
  notes = selected.notes.map((note) => ({ ...note }));
  noteEditor.setAttribute('root-note', String(selected.rootNote));
  noteEditor.notes = notes;
  postSequence();
}

function syncAudioParameters() {
  for (const [id, value] of Object.entries(values)) setParameter(id, value, 'setup');
}

function postPitchEnvelope(points) {
  audio?.synth.port.postMessage({ type: 'pitchEnvelope', points });
}

function postSequence() {
  audio?.synth.port.postMessage({
    type: 'sequence', notes,
    loopStart: 0,
    loopEnd: 4,
  });
}

function postNote(type, detail, source) {
  audio?.synth.port.postMessage({ type, source, ...detail });
}

function handlePackedNote(message, source) {
  const detail = { note: noteFromMessage(message), velocity: 100, channel: 0 };
  if (isNoteOnMessage(message)) postNote('noteOn', detail, source);
  else if (isNoteOffMessage(message)) postNote('noteOff', detail, source);
}

cleanupAudio();
