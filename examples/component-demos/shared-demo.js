import { createParameterController } from '../../src/parameter-controller.js';
import { createMIDIMappings } from '../../src/midi-mappings.js';
import { getDemo } from './catalog.js';
import '../shared/example-page.js';

const demo = getDemo(document.body.dataset.demo);
const root = document.querySelector('[data-demo-root]');
const log = document.querySelector('[data-log]');

if (demo) {
  document.title = `${demo.title} demo`;
  document.querySelector('[data-title]').textContent = demo.title;
  document.querySelector('[data-summary]').textContent = demo.summary;
}

const parameters = createParameterController({ root: document });
const mappings = createMIDIMappings({ parameters });
const mappingsEditor = document.querySelector('compost-midi-mappings');
if (mappingsEditor) mappingsEditor.mappings = mappings;
const webMIDI = document.querySelector('compost-midi');
webMIDI?.addEventListener('midi-input-selected', ({ detail }) => webMIDI.selectInput(detail.id));
webMIDI?.addEventListener('midi-output-selected', ({ detail }) => webMIDI.selectOutput(detail.id));
webMIDI?.addEventListener('midi-message', (event) => {
  mappings.handleMIDIMessage(event);
});

mappings.addEventListener('midi-mapping-request', ({ detail }) => mappings.applyMapping(detail));
mappings.addEventListener('midi-unmapping-request', ({ detail }) => mappings.applyClear(detail.parameterID));
mappings.addEventListener('midi-parameter', ({ detail }) => {
  if (detail.kind === 'trigger') {
    document.querySelector(`[parameter-id="${detail.parameterID}"]`)?.trigger?.('midi');
    return;
  }
  parameters.applyValue(detail.parameterID, detail.value, { source: 'midi' });
});
if (demo?.id === 'compost-midi-mappings') {
  mappings.applyMappings([
    { parameterID: 'cutoff', cc: 74, channel: 1 },
    { parameterID: 'resonance', cc: 71 },
    { parameterID: 'panic', cc: 123 },
  ]);
}
for (const type of ['parameter-begin', 'parameter-edit', 'parameter-end']) {
  parameters.addEventListener(type, ({ detail }) => writeLog(`${type} ${detail.parameterID}: ${detail.value}`));
}
mappings.addEventListener('midi-map', ({ detail }) => writeLog(`midi-map ${detail.parameterID}: ${detail.mappingLabel}`));
mappings.addEventListener('midi-unmap', ({ detail }) => writeLog(`midi-unmap ${detail.parameterID}`));
document.addEventListener('button-trigger', ({ detail }) => writeLog(`button-trigger ${detail.parameterID}`));

const heldNotes = new Set();
document.addEventListener('note-down', ({ detail }) => {
  heldNotes.add(detail.note);
  writeLog(`note-on ${detail.note} velocity ${detail.velocity ?? 0} held ${[...heldNotes].join(', ')}`);
});
document.addEventListener('note-up', ({ detail }) => {
  heldNotes.delete(detail.note);
  writeLog(`note-off ${detail.note} held ${[...heldNotes].join(', ') || 'none'}`);
});

function option(name) {
  return document.querySelector(`[data-option="${name}"]`);
}

function setupKnobOptions() {
  const target = document.querySelector('[data-option-target="knob"]');
  const curve = option('knob-curve');
  const min = option('knob-min');
  const max = option('knob-max');
  const step = option('knob-step');
  const mid = option('knob-mid');
  const editable = option('knob-editable');
  const reset = option('knob-reset');
  const state = document.querySelector('[data-option-state]');
  if (!target || !curve || !min || !max || !step || !mid || !editable || !reset) return;

  const apply = () => {
    const minValue = Number(min.value);
    const maxValue = Number(max.value);
    const stepValue = Number(step.value);
    const midValue = Number(mid.value);
    const resetValue = Number(reset.value);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)
        || !Number.isFinite(stepValue) || minValue >= maxValue || stepValue <= 0) {
      state.textContent = 'Choose a valid range and positive step';
      return;
    }
    target.setAttribute('min', String(minValue));
    target.setAttribute('max', String(maxValue));
    target.setAttribute('step', String(stepValue));
    target.setAttribute('curve', curve.value);
    if (Number.isFinite(midValue)) target.setAttribute('mid', String(midValue));
    else target.removeAttribute('mid');
    target.toggleAttribute('editable', editable.checked);
    if (Number.isFinite(resetValue)) target.setAttribute('reset-value', String(resetValue));
    state.textContent = `${curve.value} · ${minValue}–${maxValue} · step ${stepValue} · mid ${Number.isFinite(midValue) ? midValue : 'auto'} · ${editable.checked ? 'editable' : 'read-only'} · reset ${Number.isFinite(resetValue) ? resetValue : 'default'}`;
  };

  curve.addEventListener('change', apply);
  min.addEventListener('input', apply);
  max.addEventListener('input', apply);
  step.addEventListener('input', apply);
  mid.addEventListener('input', apply);
  editable.addEventListener('change', apply);
  reset.addEventListener('input', apply);
  apply();
}

function setupSliderOptions() {
  const target = document.querySelector('[data-option-target="slider"]');
  const orientation = option('slider-orientation');
  const curve = option('slider-curve');
  const min = option('slider-min');
  const max = option('slider-max');
  const step = option('slider-step');
  const mid = option('slider-mid');
  const editable = option('slider-editable');
  const reset = option('slider-reset');
  const state = document.querySelector('[data-option-state]');
  if (!target || !orientation || !curve || !min || !max || !step || !mid || !editable || !reset) return;

  const apply = () => {
    const minValue = Number(min.value);
    const maxValue = Number(max.value);
    const stepValue = Number(step.value);
    const midValue = Number(mid.value);
    const resetValue = Number(reset.value);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)
        || !Number.isFinite(stepValue) || minValue >= maxValue || stepValue <= 0) {
      state.textContent = 'Choose a valid range and positive step';
      return;
    }
    target.setAttribute('min', String(minValue));
    target.setAttribute('max', String(maxValue));
    target.setAttribute('step', String(stepValue));
    target.setAttribute('orientation', orientation.value);
    target.setAttribute('curve', curve.value);
    if (Number.isFinite(midValue)) target.setAttribute('mid', String(midValue));
    else target.removeAttribute('mid');
    target.toggleAttribute('editable', editable.checked);
    if (Number.isFinite(resetValue)) target.setAttribute('reset-value', String(resetValue));
    state.textContent = `${orientation.value} · ${curve.value} · ${minValue}–${maxValue} · step ${stepValue} · mid ${Number.isFinite(midValue) ? midValue : 'auto'} · reset ${Number.isFinite(resetValue) ? resetValue : 'default'} · ${editable.checked ? 'editable' : 'read-only'}`;
  };

  orientation.addEventListener('change', apply);
  curve.addEventListener('change', apply);
  min.addEventListener('input', apply);
  max.addEventListener('input', apply);
  step.addEventListener('input', apply);
  mid.addEventListener('input', apply);
  editable.addEventListener('change', apply);
  reset.addEventListener('input', apply);
  apply();
}

function setupNumberBoxOptions() {
  const target = document.querySelector('[data-option-target="number"]');
  const curve = option('number-curve');
  const min = option('number-min');
  const max = option('number-max');
  const step = option('number-step');
  const mid = option('number-mid');
  const reset = option('number-reset');
  const allowEmpty = option('number-allow-empty');
  const splitDrag = option('number-split-drag');
  const dragStepLeft = option('number-drag-step-left');
  const dragStepMiddle = option('number-drag-step-middle');
  const dragStepRight = option('number-drag-step-right');
  const state = document.querySelector('[data-option-state]');
  if (!target || !curve || !min || !max || !step || !mid || !reset || !allowEmpty
      || !splitDrag || !dragStepLeft || !dragStepMiddle || !dragStepRight) return;

  const apply = () => {
    const minValue = Number(min.value);
    const maxValue = Number(max.value);
    const stepValue = Number(step.value);
    const midValue = Number(mid.value);
    const resetValue = Number(reset.value);
    const leftScale = Number(dragStepLeft.value);
    const middleScale = Number(dragStepMiddle.value);
    const rightScale = Number(dragStepRight.value);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)
        || !Number.isFinite(stepValue) || minValue >= maxValue || stepValue <= 0
        || !Number.isFinite(leftScale) || !Number.isFinite(middleScale)
        || !Number.isFinite(rightScale) || leftScale <= 0 || middleScale <= 0 || rightScale <= 0) {
      state.textContent = 'Choose a valid range and positive step';
      return;
    }
    target.setAttribute('min', String(minValue));
    target.setAttribute('max', String(maxValue));
    target.setAttribute('step', String(stepValue));
    target.setAttribute('curve', curve.value);
    if (Number.isFinite(midValue)) target.setAttribute('mid', String(midValue));
    else target.removeAttribute('mid');
    if (Number.isFinite(resetValue)) target.setAttribute('reset-value', String(resetValue));

    const parameterID = target.parameterID || target.getAttribute('parameter-id');
    const definition = parameterID ? parameters.definition(parameterID) : null;
    if (definition && (definition.min !== minValue || definition.max !== maxValue
        || definition.step !== stepValue || definition.defaultValue !== resetValue)) {
      const candidate = Number.isFinite(resetValue) ? resetValue : target.value;
      const clamped = Math.min(maxValue, Math.max(minValue, Number(candidate)));
      const defaultValue = stepValue > 0
        ? Number((minValue + Math.round((clamped - minValue) / stepValue) * stepValue).toPrecision(15))
        : clamped;
      parameters.setDefinitions([...parameters.definitions.values()].map((entry) => (
        entry.parameterID === parameterID
          ? { ...entry, min: minValue, max: maxValue, step: stepValue, defaultValue }
          : entry
      )));
    }

    target.toggleAttribute('allow-empty', allowEmpty.checked);
    target.toggleAttribute('split-drag', splitDrag.checked);
    target.setAttribute('drag-step-left', String(leftScale));
    target.setAttribute('drag-step-middle', String(middleScale));
    target.setAttribute('drag-step-right', String(rightScale));
    state.textContent = `${curve.value} · ${minValue}–${maxValue} · step ${stepValue} · mid ${Number.isFinite(midValue) ? midValue : 'auto'} · reset ${Number.isFinite(resetValue) ? resetValue : 'default'} · ${allowEmpty.checked ? 'allow empty' : 'required'} · ${splitDrag.checked ? `split ${leftScale} / ${middleScale} / ${rightScale}` : 'single rate'}`;
  };

  curve.addEventListener('change', apply);
  min.addEventListener('input', apply);
  max.addEventListener('input', apply);
  step.addEventListener('input', apply);
  mid.addEventListener('input', apply);
  reset.addEventListener('input', apply);
  allowEmpty.addEventListener('change', apply);
  splitDrag.addEventListener('change', apply);
  dragStepLeft.addEventListener('input', apply);
  dragStepMiddle.addEventListener('input', apply);
  dragStepRight.addEventListener('input', apply);
  apply();
}

function setupButtonOptions() {
  const target = document.querySelector('[data-option-target="button"]');
  const mode = option('button-mode');
  const label = option('button-label');
  const state = document.querySelector('[data-option-state]');
  if (!target || !mode || !label) return;

  const apply = () => {
    if (mode.value === 'switch') target.setAttribute('mode', 'switch');
    else target.removeAttribute('mode');
    target.setAttribute('label', label.value || 'Button');
    target.style.setProperty('--compost-button-radius', '0');
    state.textContent = `${mode.value === 'switch' ? 'Switch' : 'Momentary'} · square corners`;
  };

  mode.addEventListener('change', apply);
  label.addEventListener('input', apply);
  apply();
}

function setupPianoOptions() {
  const target = document.querySelector('[data-option-target="piano"]');
  const rootNote = option('piano-root');
  const noteCount = option('piano-count');
  const docked = option('piano-docked');
  const state = document.querySelector('[data-option-state]');
  if (!target || !rootNote || !noteCount || !docked) return;

  const apply = () => {
    target.setAttribute('root-note', rootNote.value);
    target.setAttribute('note-count', noteCount.value);
    target.toggleAttribute('dock', docked.checked);
    target.toggleAttribute('inline', !docked.checked);
    state.textContent = `${rootNote.value} · ${noteCount.value} notes · ${docked.checked ? 'docked' : 'inline'}`;
  };

  rootNote.addEventListener('input', apply);
  noteCount.addEventListener('input', apply);
  docked.addEventListener('change', apply);
  apply();
}

function setupAudioDemo() {
  const audio = document.querySelector('compost-audio');
  if (!audio) return;

  const modal = option('audio-modal');
  const centered = option('audio-centered');
  const latency = option('audio-latency');
  const close = option('audio-close');
  const state = document.querySelector('[data-option-state]');
  const applyOptions = () => {
    if (!modal || !centered || !latency) return;
    audio.toggleAttribute('modal', modal.checked);
    audio.toggleAttribute('centered-while-off', centered.checked);
    audio.setAttribute('latency-hint', latency.value);
    if (state) state.textContent = `${modal.checked ? 'Modal' : 'Inline'} · ${latency.value === '0' ? 'exact 0' : latency.value}`;
  };
  modal?.addEventListener('change', applyOptions);
  centered?.addEventListener('change', applyOptions);
  latency?.addEventListener('change', applyOptions);
  close?.addEventListener('click', () => audio.stop(true));
  applyOptions();

  const fields = new Map([...document.querySelectorAll('[data-audio-stat]')]
    .map((field) => [field.dataset.audioStat, field]));
  let timer = 0;

  const refresh = (context = audio.getContext?.()) => {
    fields.get('state').textContent = context?.state || 'not started';
    fields.get('sampleRate').textContent = context ? `${context.sampleRate} Hz` : 'not available';
    fields.get('baseLatency').textContent = context?.baseLatency ? `${Math.round(context.baseLatency * 1000)} ms` : 'not available';
    fields.get('currentTime').textContent = context ? `${context.currentTime.toFixed(3)} s` : 'not available';
  };

  ['audio-started', 'audio-resumed', 'audio-suspended', 'audio-stopped', 'audio-state-change']
    .forEach((type) => audio.addEventListener(type, () => refresh()));
  timer = window.setInterval(() => refresh(), 250);
  refresh();
  window.addEventListener('unload', () => window.clearInterval(timer), { once: true });
}

async function setupDeviceSelectorDemo() {
  const selector = document.querySelector('compost-device-selector');
  if (!selector) return;

  let snapshot = {
    audio: {
      api: 'Core Audio',
      apis: ['Core Audio', 'WASAPI'],
      inputDevices: [{ id: 'mic', name: 'Built-in Microphone' }],
      outputDevices: [{ id: 'speakers', name: 'Built-in Output' }, { id: 'headphones', name: 'Headphones' }],
      inputDeviceId: 'mic',
      outputDeviceId: 'speakers',
      sampleRate: 48000,
      bufferSize: 128,
      sampleRates: [44100, 48000, 96000],
      bufferSizes: [64, 128, 256],
    },
    midi: {
      inputDevices: [{ id: 'keyboard', name: 'Demo Keyboard' }],
      outputDevices: [{ id: 'synth', name: 'Demo Synth' }],
      inputDeviceIds: ['keyboard'],
      outputDeviceIds: ['synth'],
    },
  };

  const updateStatus = () => {
    const values = {
      output: snapshot.audio.outputDeviceId || 'System default',
      sampleRate: `${snapshot.audio.sampleRate} Hz`,
      bufferSize: `${snapshot.audio.bufferSize} samples`,
      midiOutputs: snapshot.midi.outputDeviceIds.join(', ') || 'None',
    };
    for (const [key, value] of Object.entries(values)) {
      const field = document.querySelector(`[data-device-demo-state="${key}"]`);
      if (field) field.textContent = value;
    }
  };

  await selector.connectHost({
    getSnapshot: async () => snapshot,
    applySettings: async (request) => {
      snapshot = {
        ...snapshot,
        audio: { ...snapshot.audio, ...request.settings.audio },
        midi: { ...snapshot.midi, ...request.settings.midi },
      };
      updateStatus();
      writeLog(`host applied ${request.changed}`);
      return snapshot;
    },
  });
  updateStatus();
}

function setupScopeDemo() {
  const scope = document.querySelector('compost-scope');
  if (!scope) return;

  const frequency = option('scope-frequency');
  const channels = option('scope-channels');
  const triggerButtons = [...document.querySelectorAll('[data-scope-trigger-value]')];
  const windowButtons = [...document.querySelectorAll('[data-scope-window-value]')];
  const periods = option('scope-periods');
  const samples = option('scope-samples');
  const triggerLevel = option('scope-trigger-level');
  const range = option('scope-range');
  const center = option('scope-center');
  const xLabels = option('scope-x-labels');
  const yLabels = option('scope-y-labels');
  const state = document.querySelector('[data-option-state]');
  const signalOutput = document.querySelector('[data-scope-signal]');
  const viewOutput = document.querySelector('[data-scope-view]');
  const syncOutput = document.querySelector('[data-scope-sync]');
  let triggerValue = 'up';
  let windowValue = 'periods';

  const triggerLabel = (value) => ({
    off: 'off',
    up: 'rising',
    down: 'falling',
    external: 'external',
    manual: 'manual',
  }[value] || 'off');

  const applyOptions = () => {
    if (!frequency || !channels || !periods || !samples
        || !triggerLevel || !range || !center || !xLabels || !yLabels) return;

    const channelValue = channels.value;
    const frequencyValue = Number(frequency.value);
    const periodsValue = Number(periods.value);
    const samplesValue = Number(samples.value);
    const triggerLevelValue = Number(triggerLevel.value);
    const rangeValue = Number(range.value);
    const centerValue = Number(center.value);
    const usesPeriods = windowValue === 'periods';

    scope.setAttribute('channels', channelValue);
    scope.setAttribute('frequency', String(frequencyValue));
    scope.setAttribute('trigger', triggerValue);
    scope.setAttribute('trigger-level', String(triggerLevelValue));
    scope.setAttribute('value-range', String(rangeValue));
    scope.setAttribute('y-offset', String(centerValue));
    scope.setAttribute('x-marker-labels', xLabels.value);
    scope.setAttribute('y-marker-labels', yLabels.value);
    if (triggerValue === 'external') scope.setAttribute('trigger-channel', '0');
    else scope.removeAttribute('trigger-channel');

    if (usesPeriods) {
      scope.setAttribute('periods-shown', String(periodsValue));
      scope.removeAttribute('samples-shown');
    } else {
      scope.removeAttribute('periods-shown');
      scope.setAttribute('samples-shown', String(samplesValue));
    }

    const windowLabel = usesPeriods
      ? `${periodsValue} period${periodsValue === 1 ? '' : 's'}`
      : `${samplesValue} samples`;
    if (state) state.textContent = `${channelValue} channel${channelValue === '1' ? '' : 's'} · ${windowLabel} · ${triggerLabel(triggerValue)}`;
    if (signalOutput) signalOutput.textContent = `Generated · ${frequencyValue} Hz`;
    if (viewOutput) viewOutput.textContent = `${channelValue} channel${channelValue === '1' ? '' : 's'} · ${windowLabel} · ±${rangeValue.toFixed(2)} centered at ${centerValue.toFixed(2)}`;
    if (syncOutput) syncOutput.textContent = ['up', 'down'].includes(triggerValue)
      ? `${triggerLabel(triggerValue)} edge at ${triggerLevelValue.toFixed(2)}`
      : triggerLabel(triggerValue);

    document.querySelector('[data-window-control="periods"]').hidden = !usesPeriods;
    document.querySelector('[data-window-control="samples"]').hidden = usesPeriods;
    triggerLevel.toggleAttribute('disabled', !['up', 'down'].includes(triggerValue));
    for (const button of triggerButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.scopeTriggerValue === triggerValue));
    }
    for (const button of windowButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.scopeWindowValue === windowValue));
    }
  };

  channels.addEventListener('change', applyOptions);
  for (const button of triggerButtons) {
    button.addEventListener('click', () => {
      triggerValue = button.dataset.scopeTriggerValue;
      applyOptions();
      if (triggerValue === 'manual') {
        scope.captureTrigger?.();
        writeLog('manual scope frame captured');
        if (syncOutput) syncOutput.textContent = 'manual · frame held';
      }
    });
  }
  for (const button of windowButtons) {
    button.addEventListener('click', () => {
      windowValue = button.dataset.scopeWindowValue;
      applyOptions();
    });
  }
  for (const control of [frequency, periods, samples, triggerLevel, range, center]) {
    control?.addEventListener('parameter-edit', applyOptions);
  }
  for (const control of [xLabels, yLabels]) {
    control?.addEventListener('input', applyOptions);
  }
  applyOptions();
}

function setupGainDemo() {
  const meters = [...document.querySelectorAll('[data-gain-meter]')];
  if (!meters.length) return;

  const state = document.querySelector('[data-option-state]');
  const running = option('gain-running');
  const phases = new Map(meters.map((meter) => [meter, meter.channels === 1 ? [0] : [0, Math.PI / 3]]));
  let animate = true;
  let last = performance.now();

  const tick = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    if (animate) {
      for (const meter of meters) {
        const phase = phases.get(meter);
        const levels = phase.map((base, i) => {
          const next = base + dt * (1.7 + i * 0.6);
          phase[i] = next;
          // A wandering peak that occasionally spikes into the clip region.
          const swell = (Math.sin(next) * 0.5 + 0.5) ** 2;
          const spike = Math.sin(next * 0.17) > 0.93 ? 10 : 0;
          return -54 + swell * 56 + spike;
        });
        meter.setLevels(levels);
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  running?.addEventListener('change', () => {
    animate = running.checked;
    if (state) state.textContent = animate ? 'Meters running' : 'Meters paused';
  });
  document.querySelector('[data-gain-clip]')?.addEventListener('click', () => {
    for (const meter of meters) {
      const count = meter.channels;
      meter.setLevels(Array.from({ length: count }, () => 3));
    }
    writeLog('host pushed a clip on every channel');
  });
  document.querySelector('[data-gain-clear]')?.addEventListener('click', () => {
    for (const meter of meters) meter.clearClip();
    writeLog('clearClip() called on every meter');
  });
  if (state) state.textContent = 'Meters running';
}

if (demo?.id === 'compost-audio') setupAudioDemo();
if (demo?.id === 'compost-gain') setupGainDemo();
if (demo?.id === 'compost-device-selector') setupDeviceSelectorDemo();
if (demo?.id === 'compost-scope') setupScopeDemo();
if (demo?.id === 'compost-knob') setupKnobOptions();
if (demo?.id === 'compost-slider') setupSliderOptions();
if (demo?.id === 'compost-number-box') setupNumberBoxOptions();
if (demo?.id === 'compost-button') setupButtonOptions();
if (demo?.id === 'compost-piano') setupPianoOptions();

function setupPianoRollDemo() {
  const roll = document.querySelector('#roll');
  const state = document.querySelector('[data-option-state]');
  const grid = document.querySelector('[data-option="roll-grid"]');
  const snap = document.querySelector('[data-option="roll-snap"]');
  if (!roll) return;

  let nextNoteId = 1;
  roll.noteIdFactory = () => `demo-roll-note-${nextNoteId++}`;
  roll.setNotes([
    { note: 60, start: 0, duration: 1, velocity: 100, channel: 0 },
    { note: 64, start: 1, duration: 0.5, velocity: 90, channel: 0 },
    { note: 67, start: 1.75, duration: 0.75, velocity: 110, channel: 0 },
    { note: 72, start: 3.1, duration: 1.4, velocity: 80, channel: 0 },
  ].map((note) => ({ ...note, id: roll.noteIdFactory() })));

  const report = () => {
    if (state) {
      state.textContent = `1/${roll.getAttribute('grid')} · `
        + `${snap?.checked ? 'snapping' : 'free'} · ${roll.notes.length} notes`;
    }
  };
  grid?.addEventListener('change', () => { roll.setAttribute('grid', grid.value); report(); });
  snap?.addEventListener('change', () => {
    roll.setAttribute('snap', snap.checked ? 'grid' : 'off'); report();
  });
  document.querySelector('[data-roll-quantize]')?.addEventListener('click', () => roll.quantize());
  document.querySelector('[data-roll-quantize-lengths]')
    ?.addEventListener('click', () => roll.quantize({ lengths: true }));
  document.querySelector('[data-roll-clear]')?.addEventListener('click', () => roll.setNotes([], true));
  roll.addEventListener('notes-change', report);
  report();
}

if (demo?.id === 'compost-piano-roll') setupPianoRollDemo();

function setupChannelStripDemo() {
  const strips = [...document.querySelectorAll('compost-channel-strip[data-strip-meter]')];
  const target = document.querySelector('[data-option-target="strip"]');
  if (!strips.length || !target) return;
  const state = document.querySelector('[data-option-state]');
  const running = option('strip-running');
  const muted = option('strip-muted');
  const meter = option('strip-meter');
  const scale = option('strip-scale');
  const channels = option('strip-channels');
  let animate = true;
  let phase = 0;
  // Gain reduction is a host-owned display stream, separate from peak levels.
  strips.forEach((strip, index) => strip.setGainReduction(index === 0 ? -12 : index === 1 ? -6 : -18));
  // a host would hand over real peak levels; here they wander near the gain
  const tick = () => {
    phase += 1 / 40;
    if (animate) {
      strips.forEach((strip, index) => {
        const levels = Array.from({ length: strip.channels }, (_, channel) =>
          strip.value - 4 + Math.sin(phase * (1.6 + index * 0.3) + channel) * 5
          - Math.random() * 3);
        strip.setLevels(levels);
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  running?.addEventListener('change', () => {
    animate = running.checked;
    if (!animate) strips.forEach((strip) => strip.setLevels(strip.levels.map(() => -90)));
    if (state) state.textContent = animate ? 'Meters running' : 'Meters paused';
  });
  muted?.addEventListener('change', () => target.toggleAttribute('muted', muted.checked));
  meter?.addEventListener('change', () => target.setAttribute('meter-position', meter.value));
  scale?.addEventListener('change', () => target.setAttribute('scale', scale.value));
  channels?.addEventListener('input', () => target.setAttribute('channels', channels.value));
}

function setupChannelCardDemo() {
  const card = document.querySelector('[data-option-target="card"]');
  const strip = document.querySelector('[data-option-target="card-strip"]');
  const popup = document.querySelector('[data-card-inputs]');
  if (!card || !strip) return;
  const state = document.querySelector('[data-option-state]');
  const width = option('card-width');
  const sendCount = option('card-sends');
  const pan = option('card-pan');
  const soloSafe = option('card-solo-safe');
  const inputs = ['no input', 'MIDI 1 · 1', 'MIDI 1 · 2', 'MIDI 1 all', 'MIDI 2 all'];
  let inputIndex = 1;
  const apply = () => {
    const px = Number(width?.value) || 132;
    strip.style.width = `${px}px`;
    const count = Math.max(0, Math.min(4, Number(sendCount?.value) || 0));
    card.sends = Array.from({ length: count }, (_, index) => ({
      label: String.fromCharCode(65 + index), value: index === 0 ? -12 : -90,
      parameterID: `keys-send-${String.fromCharCode(65 + index).toLowerCase()}`, min: -90, max: 6,
    }));
    if (pan?.checked) card.setAttribute('pan', String(card.pan));
    else card.removeAttribute('pan');
    card.toggleAttribute('solo-safe', Boolean(soloSafe?.checked));
    if (state) state.textContent = `${px}px · ${count} send${count === 1 ? '' : 's'}`;
  };
  width?.addEventListener('input', apply);
  sendCount?.addEventListener('input', apply);
  pan?.addEventListener('change', apply);
  soloSafe?.addEventListener('change', apply);
  apply();
  // the strip and the card are two views of one channel; the host keeps them in step
  strip.addEventListener('parameter-edit', ({ detail }) => {
    if (detail.parameterID === 'keys-gain') card.setValue(detail.value, false, 'host');
    if (detail.parameterID === 'keys-pan') card.setPan(detail.value, false, 'host');
  });
  card.addEventListener('parameter-edit', ({ detail }) => {
    if (detail.parameterID === 'keys-gain') strip.setValue(detail.value, false, 'host');
    if (detail.parameterID === 'keys-pan') strip.setPan(detail.value, false, 'host');
    if (detail.name && ['arm', 'monitor', 'mute', 'solo', 'solo-safe'].includes(detail.name)) {
      card.toggleAttribute(detail.name, detail.value >= 0.5);
      if (detail.name === 'mute') {
        strip.toggleAttribute('muted', detail.value >= 0.5);
        card.toggleAttribute('muted', detail.value >= 0.5);
      }
    }
  });
  if (popup) {
    popup.setItems(inputs.map((label, index) => ({ value: String(index), label, selected: index === inputIndex })));
    card.addEventListener('input-click', ({ detail }) => popup.open({ anchor: detail.anchor }));
    popup.addEventListener('popup-select', ({ detail }) => {
      inputIndex = Number(detail.value);
      card.setAttribute('input', inputs[inputIndex]);
      card.toggleAttribute('input-live', inputIndex > 0);
      popup.setItems(inputs.map((label, index) => ({ value: String(index), label, selected: index === inputIndex })));
      writeLog(`input → ${inputs[inputIndex]}`);
    });
  }
}

function setupClipGridDemo() {
  const grids = [...document.querySelectorAll('compost-clip-grid[data-grid]')];
  if (!grids.length) return;
  const state = document.querySelector('[data-option-state]');
  const armed = option('grid-armed');
  const quant = option('grid-quant');
  // the demo is the host: it owns the clips, the clock and the launch rules
  const tracks = [
    [{ name: 'break.a', bars: 2 }, { name: 'fill.b', bars: 1 }, { name: 'ride.c', bars: 1 }, null, null],
    [{ name: 'sub.a', bars: 4 }, { name: 'walk.b', bars: 2 }, null, null, null],
  ];
  const playing = tracks.map(() => ({ index: -1, queued: -1, at: 0, start: 0, stopQueued: false, stopAt: 0 }));
  let beat = 0;
  let last = performance.now();
  const quantization = () => Math.max(0, Number(quant?.value) || 0);
  const nextPoint = () => {
    const q = quantization();
    return q > 0 ? Math.ceil((beat + 1e-6) / q) * q : beat;
  };
  const render = (track) => {
    const grid = grids[track];
    const live = playing[track];
    grid.setClips(tracks[track].map((clip, index) => clip && {
      name: clip.name,
      state: live.index === index ? 'playing' : live.queued === index ? 'queued' : 'stopped',
      progress: live.index === index ? (((beat - live.start) / (clip.bars * 4)) % 1 + 1) % 1 : 0,
    }));
    grid.setFrom(track === 0
      ? { kind: 'timeline', name: 'verse', progress: 0.62 }
      : { kind: 'overridden' });
    grid.setAttribute('stop', live.stopQueued ? 'queued' : live.index >= 0 || live.queued >= 0 ? 'active' : '');
  };
  const renderAll = () => {
    tracks.forEach((_, track) => render(track));
    if (state) {
      const words = playing.map((live, track) => (live.index >= 0
        ? `${tracks[track][live.index]?.name} playing` : live.queued >= 0
          ? `${tracks[track][live.queued]?.name} queued` : 'stopped'));
      state.textContent = words.join(' · ');
    }
  };
  grids.forEach((grid, track) => {
    grid.addEventListener('clip-launch', ({ detail }) => {
      const live = playing[track];
      if (live.index === detail.index || live.queued === detail.index) {
        live.index = -1; live.queued = -1;
      } else {
        live.queued = detail.index; live.at = nextPoint(); live.stopQueued = false;
      }
      renderAll();
    });
    grid.addEventListener('clip-stop', () => {
      const live = playing[track];
      if (live.stopQueued) live.stopQueued = false;
      else if (quantization() > 0 && (live.index >= 0 || live.queued >= 0)) {
        live.stopQueued = true; live.stopAt = nextPoint(); live.queued = -1;
      } else { live.index = -1; live.queued = -1; }
      renderAll();
    });
    grid.addEventListener('clip-record', ({ detail }) => {
      tracks[track][detail.index] = { name: `take ${detail.index + 1}`, bars: 2 };
      renderAll();
      writeLog(`clip-record slot ${detail.index + 1} on ${grid.label}`);
    });
    grid.addEventListener('clip-drop', ({ detail }) => {
      const from = grids.indexOf(detail.source);
      const moved = tracks[from][detail.fromIndex];
      if (!moved) return;
      const landed = tracks[track][detail.toIndex];
      tracks[track][detail.toIndex] = { ...moved, name: detail.copy ? `${moved.name} copy` : moved.name };
      // slots are fixed cells, so a move swaps rather than overwriting
      if (!detail.copy) tracks[from][detail.fromIndex] = landed ?? null;
      renderAll();
      writeLog(`clip-drop ${moved.name} → ${grid.label} slot ${detail.toIndex + 1}${detail.copy ? ' (copy)' : ''}`);
    });
    grid.addEventListener('clip-rename', ({ detail }) => {
      const clip = tracks[track][detail.index];
      if (clip) clip.name = detail.name;
      renderAll();
      writeLog(`clip-rename → ${detail.name}`);
    });
    grid.addEventListener('clip-open', ({ detail }) => writeLog(`clip-open ${tracks[track][detail.index]?.name}`));
    grid.addEventListener('clip-context', ({ detail }) => writeLog(`clip-context ${tracks[track][detail.index]?.name} at ${detail.clientX},${detail.clientY}`));
    grid.addEventListener('clip-select', ({ detail }) => {
      grids.forEach((other) => { other.selected = other === grid ? detail.index : -1; });
    });
    grid.addEventListener('clip-delete', ({ detail }) => { tracks[track][detail.index] = null; renderAll(); });
  });
  armed?.addEventListener('change', () => grids.forEach((grid) => grid.toggleAttribute('armed', armed.checked)));
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    beat += dt * 2;   // 120 bpm
    let changed = false;
    playing.forEach((live, track) => {
      if (live.stopQueued && beat >= live.stopAt) { live.stopQueued = false; live.index = -1; changed = true; }
      if (live.queued >= 0 && beat >= live.at) { live.index = live.queued; live.queued = -1; live.start = live.at; changed = true; }
      if (live.index >= 0) {
        const clip = tracks[track][live.index];
        if (clip) grids[track].setProgress(live.index, (((beat - live.start) / (clip.bars * 4)) % 1 + 1) % 1);
      }
    });
    if (changed) renderAll();
    requestAnimationFrame(tick);
  };
  renderAll();
  requestAnimationFrame(tick);
}

function setupNoteEditorDemo() {
  const editor = document.querySelector('[data-option-target="editor"]');
  if (!editor) return;
  const state = document.querySelector('[data-option-state]');
  const grid = option('editor-grid');
  const snap = option('editor-snap');
  const draw = option('editor-draw');
  const fold = option('editor-fold');
  const playhead = option('editor-playhead');
  let nextNoteId = 1;
  editor.noteIdFactory = () => `demo-editor-note-${nextNoteId++}`;
  editor.setNotes([
    { note: 60, start: 0, duration: 0.5, velocity: 100 }, { note: 64, start: 2, duration: 0.5, velocity: 88 },
    { note: 60, start: 4, duration: 0.5, velocity: 100 }, { note: 64, start: 6, duration: 0.5, velocity: 88 },
    { note: 67, start: 6.5, duration: 0.5, velocity: 96 },
  ].map((note) => ({ ...note, id: editor.noteIdFactory() })));
  const report = () => {
    if (!state) return;
    const bars = Math.round((editor.loopEnd - editor.loopStart) / editor.beatsPerBar * 1000) / 1000;
    state.textContent = `1/${editor.grid} · ${snap?.checked ? 'snapping' : 'free'} · ${bars} bar${bars === 1 ? '' : 's'} · ${editor.notes.length} notes`;
  };
  grid?.addEventListener('change', () => { editor.setAttribute('grid', grid.value); report(); });
  snap?.addEventListener('change', () => { editor.setAttribute('snap', snap.checked ? 'grid' : 'off'); report(); });
  draw?.addEventListener('change', () => editor.toggleAttribute('draw', draw.checked));
  fold?.addEventListener('change', () => editor.toggleAttribute('fold', fold.checked));
  document.querySelector('[data-editor-quantize]')?.addEventListener('click', () => editor.quantize());
  document.querySelector('[data-editor-zoom]')?.addEventListener('click', () => editor.zoomReset());
  editor.addEventListener('notes-change', report);
  editor.addEventListener('loop-change', ({ detail }) => { report(); writeLog(`loop-change ${detail.start}–${detail.end}`); });
  editor.addEventListener('note-preview', ({ detail }) => writeLog(`note-preview ${detail.note}`));
  // a host supplies the playhead: here a clock running round the loop
  let last = performance.now();
  let position = 0;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (playhead?.checked) {
      const span = Math.max(0.25, editor.loopEnd - editor.loopStart);
      position = editor.loopStart + ((position - editor.loopStart + dt * 2) % span + span) % span;
      editor.setAttribute('playhead', position.toFixed(3));
    } else if (editor.hasAttribute('playhead')) editor.removeAttribute('playhead');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  report();
}

function setupWindowDemo() {
  const window_ = document.querySelector('[data-option-target="window"]');
  if (!window_) return;
  const state = document.querySelector('[data-option-state]');
  const ratio = option('window-ratio');
  const fullscreen = option('window-fullscreen');
  const minimum = option('window-min');
  const report = () => {
    if (!state) return;
    const size = window_.contentSize;
    state.textContent = window_.open
      ? `open at ${window_.getAttribute('x')},${window_.getAttribute('y')} · content ${size.width}×${size.height}` : 'closed';
  };
  document.querySelector('[data-window-open]')?.addEventListener('click', () => { window_.open = true; report(); });
  ratio?.addEventListener('change', () => {
    if (ratio.checked) window_.setAttribute('aspect-ratio', '4/3'); else window_.removeAttribute('aspect-ratio');
    const size = window_.contentSize;
    window_.setContentSize(size.width, size.height);
    report();
  });
  fullscreen?.addEventListener('change', () => { window_.toggleAttribute('fullscreen', fullscreen.checked); report(); });
  minimum?.addEventListener('input', () => {
    window_.setAttribute('min-width', minimum.value);
    window_.setAttribute('min-height', String(Math.round(Number(minimum.value) * 0.6)));
  });
  for (const type of ['window-open', 'window-close', 'window-move', 'window-resize', 'window-focus']) {
    window_.addEventListener(type, ({ detail }) => {
      if (type !== 'window-focus') writeLog(`${type}${detail && Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`);
      requestAnimationFrame(report);
    });
  }
  report();
}

function setupPopupDemo() {
  const popup = document.querySelector('[data-option-target="popup"]');
  const quantMenu = document.querySelector('[data-popup-quant-menu]');
  const context = document.querySelector('[data-popup-context]');
  if (!popup || !quantMenu || !context) return;
  const state = document.querySelector('[data-option-state]');
  const anchor = document.querySelector('[data-popup-anchor]');
  const quant = document.querySelector('[data-popup-quant]');
  const surface = document.querySelector('[data-popup-surface]');
  quantMenu.setItems([
    { value: '8', label: '2 bars' }, { value: '4', label: '1 bar' }, { value: '2', label: '1/2' },
    { value: '1', label: '1/4', selected: true }, { value: '0.5', label: '1/8' }, { value: '0', label: 'off' },
  ]);
  anchor?.addEventListener('click', () => popup.open({ anchor }));
  quant?.addEventListener('click', () => quantMenu.open({ anchor: quant }));
  surface?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    context.openAt(event.clientX, event.clientY);
  });
  for (const menu of [popup, quantMenu, context]) {
    menu.addEventListener('popup-select', ({ detail }) => {
      menu.value = detail.value;
      if (state) state.textContent = `${menu.getAttribute('label')}: ${detail.label}`;
      writeLog(`popup-select ${menu.getAttribute('label')} → ${detail.value}`);
    });
  }
}

if (demo?.id === 'compost-channel-strip') setupChannelStripDemo();
if (demo?.id === 'compost-channel-card') setupChannelCardDemo();
if (demo?.id === 'compost-clip-grid') setupClipGridDemo();
if (demo?.id === 'compost-note-editor') setupNoteEditorDemo();
if (demo?.id === 'compost-window') setupWindowDemo();
if (demo?.id === 'compost-popup') setupPopupDemo();

function writeLog(line) {
  if (!log) return;
  log.textContent = `${line}\n${log.textContent}`.slice(0, 4000);
}
