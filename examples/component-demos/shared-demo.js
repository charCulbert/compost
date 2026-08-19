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
document.querySelector('compost-midi')?.addEventListener('midi-message', (event) => {
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

  roll.setNotes([
    { note: 60, start: 0, duration: 1, velocity: 100, channel: 0 },
    { note: 64, start: 1, duration: 0.5, velocity: 90, channel: 0 },
    { note: 67, start: 1.75, duration: 0.75, velocity: 110, channel: 0 },
    { note: 72, start: 3.1, duration: 1.4, velocity: 80, channel: 0 },
  ]);

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

function writeLog(line) {
  if (!log) return;
  log.textContent = `${line}\n${log.textContent}`.slice(0, 4000);
}
