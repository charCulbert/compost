import '../../src/components/compost-button.js';
import '../../src/components/compost-drawer.js';
import '../../src/components/compost-midi-mappings.js';
import '../../src/components/compost-midi-monitor.js';
import '../../src/components/compost-number-box.js';
import '../../src/components/compost-slider.js';
import '../../src/components/compost-piano.js';
import '../../src/components/compost-scope.js';
import '../../src/components/compost-select.js';
import '../../src/components/compost-knob.js';
import '../../src/components/compost-audio.js';
import '../../src/components/compost-midi.js';
import {
  isNoteOffMessage,
  isNoteOnMessage,
  midiNoteToFrequency,
  noteFromMessage,
} from '../../src/midi.js';
import { createParameterController } from '../../src/parameter-controller.js';
import { createMIDIMappings } from '../../src/midi-mappings.js';
import {
  beginParameterGesture,
  editParameterGesture,
  endParameterGesture,
} from '../../src/utils.js';
import { setTheme } from '../shared/example-page.js';

const params = {
  frequency: 220,
  amplitude: 1,
  offset: 0,
  outputGain: 0.75,
  waveShape: 1,
};

const scopeParams = {
  trigger: 'external',
  triggerLevel: 0,
  windowMode: 'periods',
  samplesShown: 1024,
  periodsShown: 4,
  valueRange: 1,
  yOffset: 0,
};

const scope = document.querySelector('compost-scope');
const scopeFPSOutput = document.querySelector('[data-scope-fps]');
const demoHeader = document.querySelector('.demo-header');
const triggerTypeButtons = [...document.querySelectorAll('[data-trigger-value]')];
const scopeWindowModeButtons = [...document.querySelectorAll('[data-window-mode]')];
const samplesControl = document.querySelector('[data-samples-control]');
const periodsControl = document.querySelector('[data-periods-control]');
const triggerLevelControl = document.querySelector('[parameter-id="triggerLevel"]');
const presetGroup = document.querySelector('[data-signal-preset-group]');
const themeButtons = [...document.querySelectorAll('[data-theme-value]')];
const waveShapeGroup = document.querySelector('[data-wave-shape-group]');
const waveShapeButtons = [...waveShapeGroup.querySelectorAll('[data-wave-shape]')];
const scopeXLabelsInput = document.querySelector('[data-scope-x-labels]');
const scopeYLabelsInput = document.querySelector('[data-scope-y-labels]');
const keyboard = document.querySelector('compost-piano');
const webAudio = document.querySelector('compost-audio');
const webMIDI = document.querySelector('compost-midi');
const midiMappingsEditor = document.querySelector('compost-midi-mappings');
const midiDrawer = document.querySelector('[data-midi-drawer]');
const midiActivityLED = document.querySelector('[data-midi-activity]');
const settingsDrawer = document.querySelector('.settings-drawer');
const midiMapButton = document.querySelector('[data-midi-map-button]');
const mobileLayout = matchMedia('(max-width: 560px)');
const activeNotes = new Set();
const scopeCaptureSize = 32768;
const scopeCaptureSignal = new Float32Array(scopeCaptureSize);
const scopeCaptureTrigger = new Float32Array(scopeCaptureSize);
const scopeDisplaySignal = new Float32Array(scopeCaptureSize);
const scopeDisplayTrigger = new Float32Array(scopeCaptureSize);
let audio = null;
let applyingPreset = false;
let scopeCaptureWriteIndex = 0;
let scopeCaptureFrame = 0;
let scopeFrameCount = 0;
let scopeFrameStartedAt = performance.now();
let mobileDrawerLayout = false;
let midiActivityTimeout = 0;

scope.addEventListener('scope-frame', ({ detail }) => {
  if (audio) recordScopeFrameRate(detail.time);
});

new ResizeObserver(([entry]) => {
  const height = mobileLayout.matches ? 50 : entry.target.getBoundingClientRect().height;
  document.documentElement.style.setProperty('--demo-toolbar-height', `${height}px`);
}).observe(demoHeader);

function syncMIDIDrawerLayout() {
  const isOpen = midiDrawer.open;
  document.body.toggleAttribute('data-midi-drawer-open', isOpen);
  document.documentElement.style.setProperty(
    '--midi-drawer-space',
    isOpen ? `${midiDrawer.getBoundingClientRect().width}px` : '0px',
  );
}

function syncMobileLayout() {
  if (mobileLayout.matches === mobileDrawerLayout) return;

  mobileDrawerLayout = mobileLayout.matches;
  midiDrawer.setAttribute('edge', mobileDrawerLayout ? 'top' : 'left');
  midiDrawer.setAttribute('min-size', mobileDrawerLayout ? '240' : '420');
  requestAnimationFrame(syncMIDIDrawerLayout);
}

midiDrawer.addEventListener('toggle', () => requestAnimationFrame(syncMIDIDrawerLayout));
midiDrawer.addEventListener('drawer-resize', () => requestAnimationFrame(syncMIDIDrawerLayout));
mobileLayout.addEventListener('change', syncMobileLayout);
syncMobileLayout();
syncMIDIDrawerLayout();

const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameters });
midiMappingsEditor.mappings = mappings;
mappings.addEventListener('midi-mapping-request', (event) => mappings.applyMapping(event.detail));
mappings.addEventListener('midi-unmapping-request', (event) => mappings.applyClear(event.detail.parameterID));
mappings.addEventListener('midi-learn-begin', () => {
  midiDrawer.open = true;
});
if (!mappings.applyMappings([
  { parameterID: 'outputGain', cc: 7 },
  { parameterID: 'frequency', cc: 74 },
  { parameterID: 'amplitude', cc: 20 },
  { parameterID: 'offset', cc: 71 },
  { parameterID: 'waveShape', cc: 79 },
  { parameterID: 'triggerLevel', cc: 75 },
  { parameterID: 'samplesShown', cc: 76 },
  { parameterID: 'periodsShown', cc: 81 },
  { parameterID: 'valueRange', cc: 77 },
  { parameterID: 'yOffset', cc: 78 },
])) {
  throw new Error('Could not apply the signal generator MIDI mappings.');
}
mappings.addEventListener('midi-parameter', (event) => {
  const { parameterID, value, kind } = event.detail;
  if (kind === 'trigger') {
    document.querySelector(`[parameter-id="${parameterID}"]`)?.trigger?.('midi');
    parameters.applyValue(parameterID, 0, { source: 'midi' });
    return;
  }
  if (parameterID in params) {
    setAudioParameter(parameterID, value, 'midi');
    syncDemo();
  } else if (parameterID in scopeParams) {
    setScopeValue(parameterID, value);
    syncDemo();
  }
});

const signalPresets = {
  'saw-standard': {
    waveShape: 'sawtooth',
    params: {
      frequency: 220,
      amplitude: 1,
      offset: 0,
    },
    scope: {
      trigger: 'external',
      triggerLevel: 0,
      windowMode: 'periods',
      samplesShown: 1024,
      periodsShown: 4,
      valueRange: 1,
      yOffset: 0,
    },
    xMarkers: '1,2,3,4',
    yMarkers: '-0.5,0,0.5',
    xLabels: '1,2,3,4',
    yLabels: '-0.5,0,0.5',
  },
  'sine-labels': {
    waveShape: 'sine',
    params: {
      frequency: 110,
      amplitude: 1,
      offset: 0,
    },
    scope: {
      trigger: 'external',
      triggerLevel: 0,
      windowMode: 'periods',
      samplesShown: 1536,
      periodsShown: 4,
      valueRange: 1,
      yOffset: 0,
    },
    xMarkers: '1,2,3,4',
    yMarkers: '-0.5,0,0.5',
    xLabels: '1:start,2:point 1,3:point 2,4:end',
    yLabels: '-0.5:low,0,0.5:high',
  },
  'unipolar-square': {
    waveShape: 'square',
    params: {
      frequency: 55,
      amplitude: 1,
      offset: 0.5,
    },
    scope: {
      trigger: 'external',
      triggerLevel: 0.5,
      windowMode: 'periods',
      samplesShown: 1024,
      periodsShown: 4,
      valueRange: 0.5,
      yOffset: 0.5,
    },
    xMarkers: '1,2,3,4',
    yMarkers: '0,0.5,1',
    xLabels: '1:start,2:point 1,3:point 2,4:end',
    yLabels: '0:min,0.5,1:max',
  },
};

parameters.addEventListener('parameter-edit', (event) => {
  const id = event.detail.parameterID;
  const { value } = event.detail;

  if (id in params) {
    setAudioParameter(id, value, 'web-audio');
  } else if (id in scopeParams) {
    scopeParams[id] = value;
  }

  syncDemo();
});

for (const button of triggerTypeButtons) {
  button.addEventListener('click', () => {
    scopeParams.trigger = button.dataset.triggerValue;
    if (!applyingPreset) setActiveSignalPreset('');
    syncDemo();
    if (scopeParams.trigger === 'manual') fireManualTrigger();
  });
}

scopeXLabelsInput.addEventListener('input', () => {
  scope.setAttribute('x-marker-labels', scopeXLabelsInput.value);
  if (!applyingPreset) setActiveSignalPreset('');
});

scopeYLabelsInput.addEventListener('input', () => {
  scope.setAttribute('y-marker-labels', scopeYLabelsInput.value);
  if (!applyingPreset) setActiveSignalPreset('');
});

for (const button of scopeWindowModeButtons) {
  button.addEventListener('click', () => {
    setScopeWindowMode(button.dataset.windowMode, { resetMarkers: true });
    setActiveSignalPreset('');
    syncDemo();
  });
}

presetGroup.addEventListener('change', (event) => {
  applySignalPreset(event.target.value);
});

for (const button of themeButtons) {
  button.addEventListener('click', () => applyColorPreset(button.dataset.themeValue));
}
window.addEventListener('compost-theme-change', (event) => syncThemeButtons(event.detail.theme));
syncThemeButtons(document.documentElement.dataset.compostTheme);

for (const button of waveShapeButtons) {
  button.addEventListener('click', () => {
    const value = Number(button.dataset.waveShape);
    if (!applyingPreset) setActiveSignalPreset('');
    beginParameterGesture(waveShapeGroup, params.waveShape, { source: 'wave-shape' });
    editParameterGesture(waveShapeGroup, value, { source: 'wave-shape' });
    endParameterGesture(waveShapeGroup, value, { source: 'wave-shape' });
  });
}

midiMapButton.addEventListener('change', () => {
  if (midiMapButton.pressed) {
    midiMappingsEditor.controller?.beginSelecting();
  } else {
    midiMappingsEditor.controller?.cancel('toolbar');
  }
});

midiMappingsEditor.addEventListener('midi-map-mode-change', (event) => {
  const active = event.detail?.active === true;
  midiMapButton.pressed = active;
  if (active) midiDrawer.open = true;
});

document.addEventListener('pointerdown', (event) => {
  if (settingsDrawer.open && !event.composedPath().includes(settingsDrawer)) {
    settingsDrawer.open = false;
  }
});

webAudio.addEventListener('audio-started', async (event) => {
  await setupAudio(event.detail.context);
});

webAudio.addEventListener('audio-stopped', () => {
  cleanupAudio();
});

keyboard.addEventListener('note-down', (event) => {
  const { note } = event.detail;
  activeNotes.add(note);
  setAudioParameter('frequency', midiNoteToFrequency(note), 'keyboard');
  audio?.synth.port.postMessage({ type: 'noteOn', note });
  syncDemo();
});

keyboard.addEventListener('note-up', (event) => {
  const { note } = event.detail;
  activeNotes.delete(note);
  audio?.synth.port.postMessage({ type: 'noteOff', note });
  syncDemo();
});

webMIDI.addEventListener('midi-message', (event) => {
  const { message } = event.detail;
  clearTimeout(midiActivityTimeout);
  midiActivityLED.classList.add('active');
  midiActivityTimeout = setTimeout(() => midiActivityLED.classList.remove('active'), 60);
  mappings.handleMIDIMessage(event);
  keyboard.handleExternalMIDI(message);

  if (isNoteOnMessage(message)) {
    const note = noteFromMessage(message);
    activeNotes.add(note);
    setAudioParameter('frequency', midiNoteToFrequency(note), 'midi');
    audio?.synth.port.postMessage({ type: 'noteOn', note });
  } else if (isNoteOffMessage(message)) {
    const note = noteFromMessage(message);
    activeNotes.delete(note);
    audio?.synth.port.postMessage({ type: 'noteOff', note });
  }

  syncDemo();
});

async function setupAudio(context) {
  if (audio?.context === context) return;

  cleanupAudio();
  await context.audioWorklet.addModule('./worklets/signal-generator.js');

  const synth = new AudioWorkletNode(context, 'compost-signal-generator', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [4],
    parameterData: params,
  });
  const speakerSplitter = new ChannelSplitterNode(context, { numberOfOutputs: 4 });
  const speakerOutput = new ChannelMergerNode(context, { numberOfInputs: 2 });

  synth.connect(speakerSplitter);
  speakerSplitter.connect(speakerOutput, 0, 0);
  speakerSplitter.connect(speakerOutput, 1, 1);
  speakerOutput.connect(context.destination);

  audio = { context, synth, speakerSplitter, speakerOutput };
  synth.port.onmessage = (event) => receiveScopeSamples(synth, event.data);
  resetScopeCapture();
  updateAudioParams();
}

function cleanupAudio() {
  if (audio) {
    audio.synth.disconnect();
    audio.speakerSplitter.disconnect();
    audio.speakerOutput.disconnect();
  }

  cancelAnimationFrame(scopeCaptureFrame);
  scopeCaptureFrame = 0;
  resetScopeFrameRate();
  audio = null;
}

function resetScopeCapture() {
  scopeCaptureSignal.fill(0);
  scopeCaptureTrigger.fill(0);
  scopeDisplaySignal.fill(0);
  scopeDisplayTrigger.fill(0);
  scopeCaptureWriteIndex = 0;
  resetScopeFrameRate();
}

function resetScopeFrameRate() {
  scopeFrameCount = 0;
  scopeFrameStartedAt = performance.now();
  scopeFPSOutput.textContent = '— fps';
  scopeFPSOutput.setAttribute('aria-label', 'Scope render rate unavailable');
}

function recordScopeFrameRate(now) {
  scopeFrameCount += 1;
  const elapsed = now - scopeFrameStartedAt;
  if (elapsed < 500) return;

  const fps = Math.round(scopeFrameCount * 1000 / elapsed);
  scopeFrameCount = 0;
  scopeFrameStartedAt = now;
  scopeFPSOutput.textContent = `${fps} fps`;
  scopeFPSOutput.setAttribute('aria-label', `Scope render rate ${fps} frames per second`);
}

function publishScopeCapture() {
  const tailSize = scopeCaptureSize - scopeCaptureWriteIndex;
  scopeDisplaySignal.set(scopeCaptureSignal.subarray(scopeCaptureWriteIndex), 0);
  scopeDisplaySignal.set(scopeCaptureSignal.subarray(0, scopeCaptureWriteIndex), tailSize);
  scopeDisplayTrigger.set(scopeCaptureTrigger.subarray(scopeCaptureWriteIndex), 0);
  scopeDisplayTrigger.set(scopeCaptureTrigger.subarray(0, scopeCaptureWriteIndex), tailSize);
  scope.setSamples(scopeDisplaySignal, { triggerSamples: scopeDisplayTrigger });
}

function receiveScopeSamples(synth, message) {
  if (audio?.synth !== synth || message?.type !== 'scope-samples') return;

  const { signal, trigger } = message;
  if (!(signal instanceof Float32Array) || signal.length !== trigger?.length) return;

  for (let index = 0; index < signal.length; index += 1) {
    scopeCaptureSignal[scopeCaptureWriteIndex] = signal[index];
    scopeCaptureTrigger[scopeCaptureWriteIndex] = trigger[index];
    scopeCaptureWriteIndex = (scopeCaptureWriteIndex + 1) % scopeCaptureSize;
  }

  if (scopeCaptureFrame) return;

  scopeCaptureFrame = requestAnimationFrame(() => {
    scopeCaptureFrame = 0;
    if (scopeParams.trigger === 'manual' && scope.manualTriggerHold) return;

    publishScopeCapture();
  });
}

function syncDemo() {
  scope.setAttribute('frequency', String(params.frequency));
  scope.setAttribute('trigger', scopeParams.trigger);
  scope.setAttribute('trigger-level', String(scopeParams.triggerLevel));
  if (scopeParams.windowMode === 'periods') {
    scope.setAttribute('periods-shown', String(scopeParams.periodsShown));
    scope.removeAttribute('samples-shown');
  } else {
    scope.removeAttribute('periods-shown');
    scope.setAttribute('samples-shown', String(scopeParams.samplesShown));
  }
  samplesControl.hidden = scopeParams.windowMode !== 'samples';
  periodsControl.hidden = scopeParams.windowMode !== 'periods';
  triggerLevelControl.toggleAttribute('disabled', !['up', 'down'].includes(scopeParams.trigger));
  syncToggleButtons(triggerTypeButtons, scopeParams.trigger, 'triggerValue');
  syncToggleButtons(scopeWindowModeButtons, scopeParams.windowMode, 'windowMode');
  scope.setAttribute('value-range', String(scopeParams.valueRange));
  scope.setAttribute('y-offset', String(scopeParams.yOffset));
  updateAudioParams();
}

function syncToggleButtons(buttons, value, key) {
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset[key] === value));
  }
}

function updateAudioParams() {
  if (!audio) return;

  const now = audio.context.currentTime;
  for (const [name, value] of Object.entries(params)) {
    audio.synth.parameters.get(name)?.setTargetAtTime(value, now, 0.01);
  }
}

function fireManualTrigger() {
  publishScopeCapture();
  scope.captureTrigger();
}

function applySignalPreset(name) {
  const preset = signalPresets[name];
  if (!preset) return;

  applyingPreset = true;
  setWaveShape(preset.waveShape);

  for (const [key, value] of Object.entries(preset.params)) {
    setParameterValue(key, value);
  }

  for (const [key, value] of Object.entries(preset.scope)) {
    setScopeValue(key, value);
  }

  scope.setAttribute('x-markers', preset.xMarkers);
  scope.setAttribute('y-markers', preset.yMarkers);
  setScopeLabelValues(preset.xLabels, preset.yLabels);
  setActiveSignalPreset(name);
  applyingPreset = false;
  syncDemo();
}

function setParameterValue(name, value) {
  setAudioParameter(name, value, 'preset');
}

function setAudioParameter(parameterID, value, source) {
  params[parameterID] = value;
  if (parameterID === 'waveShape') {
    waveShapeGroup.setAttribute('value', String(Math.round(value)));
    updateWaveShapeButtons();
  }
  audio?.synth.parameters.get(parameterID)?.setTargetAtTime(value, audio.context.currentTime, 0.01);
  parameters.applyValue(parameterID, value, { source });
}

function setScopeValue(name, value) {
  scopeParams[name] = value;

  if (name === 'trigger') {
    return;
  }

  if (name === 'windowMode') {
    return;
  }

  parameters.applyValue(name, value, { source: 'preset' });
}

function setActiveSignalPreset(name) {
  presetGroup.value = name;
}

function applyColorPreset(name) {
  if (!['dark', 'light', 'gruvbox'].includes(name)) return;

  document.body.removeAttribute('data-component-defaults');
  setTheme(name);
}

function syncThemeButtons(name) {
  for (const button of themeButtons) {
    button.setAttribute('aria-checked', String(button.dataset.themeValue === name));
  }
}

function setScopeWindowMode(mode, { resetMarkers = false } = {}) {
  scopeParams.windowMode = mode === 'samples' ? 'samples' : 'periods';

  if (!resetMarkers) return;

  const markers = scopeParams.windowMode === 'periods' ? '1,2,3,4' : '256,512,768,1024';
  scope.setAttribute('x-markers', markers);
  setScopeLabelValues(markers, scopeYLabelsInput.value);
}

function setScopeLabelValues(xLabels, yLabels) {
  scope.setAttribute('x-marker-labels', xLabels);
  scope.setAttribute('y-marker-labels', yLabels);
  scopeXLabelsInput.value = xLabels;
  scopeYLabelsInput.value = yLabels;
}

function setWaveShape(shape) {
  const shapes = ['sine', 'sawtooth', 'square'];
  const numericShape = Number(shape);
  const index = Number.isInteger(numericShape) ? numericShape : shapes.indexOf(shape);
  if (index < 0 || index >= shapes.length) return;

  params.waveShape = index;
  parameters.applyValue('waveShape', index, { source: 'wave-shape' });
  updateAudioParams();
  waveShapeGroup.setAttribute('value', String(index));
  updateWaveShapeButtons();
}

function updateWaveShapeButtons() {
  const value = String(Math.round(params.waveShape));
  for (const button of waveShapeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.waveShape === value));
  }
}

applySignalPreset('saw-standard');
applyColorPreset('dark');
syncDemo();
