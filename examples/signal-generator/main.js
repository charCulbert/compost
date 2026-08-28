import '../../src/components/index.js';
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

const audioControl = document.querySelector('compost-audio');
const scope = document.querySelector('compost-scope');
const piano = document.querySelector('compost-piano');
const midi = document.querySelector('compost-midi');
const midiDrawer = document.querySelector('.midi-drawer');
const mappingsView = document.querySelector('compost-midi-mappings');
const mapToggle = document.querySelector('[data-midi-map-toggle]');
const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameterProvider: parameters });
let audio = null;

mappingsView.mappings = mappings;
mappings.addEventListener('midi-mapping-request', ({ detail }) => mappings.applyMapping(detail));
mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
mappings.applyMappings([
  { parameterID: 'outputGain', cc: 7 },
  { parameterID: 'frequency', cc: 74 },
  { parameterID: 'amplitude', cc: 20 },
  { parameterID: 'offset', cc: 71 },
  { parameterID: 'waveShape', cc: 79 },
]);

parameters.addEventListener('parameter-edit', ({ detail }) => setParameter(detail.parameterID, detail.value, detail.source));
mappings.addEventListener('midi-parameter', ({ detail }) => setParameter(detail.parameterID, detail.value, 'midi'));

document.querySelector('[data-midi-open]').addEventListener('click', () => { midiDrawer.open = true; });
mapToggle.addEventListener('change', () => {
  if (mapToggle.pressed) mappingsView.controller?.beginSelecting();
  else mappingsView.controller?.cancel('toolbar');
});
mappingsView.addEventListener('midi-map-mode-change', ({ detail }) => {
  mapToggle.pressed = detail.active;
  if (detail.active) midiDrawer.open = true;
});

midi.addEventListener('midi-input-selected', ({ detail }) => midi.selectInput(detail.id));
midi.addEventListener('midi-message', (event) => {
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
    }
  };
  audio = { context, oscillator };
  syncAudioParameters();
}

function cleanupAudio() {
  audio?.oscillator.disconnect();
  audio = null;
}

function setParameter(parameterID, value, source) {
  if (!(parameterID in values)) return;
  values[parameterID] = Number(value);
  parameters.applyValue(parameterID, values[parameterID], { source });
  const parameter = audio?.oscillator.parameters.get(parameterID);
  if (parameter) parameter.setTargetAtTime(values[parameterID], audio.context.currentTime, .01);
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
