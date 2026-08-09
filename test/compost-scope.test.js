import assert from 'node:assert/strict';
import test from 'node:test';

class FakeContext {
  clearRect() {}
  beginPath() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  setLineDash() {}
  fillText() {}
}

const scopeElement = {
  style: {},
  getBoundingClientRect: () => ({ width: 640, height: 320 }),
};

const waveCanvas = {
  width: 640,
  height: 320,
  getContext: () => new FakeContext(),
};

const overlayCanvas = {
  width: 640,
  height: 320,
  getContext: () => new FakeContext(),
};

globalThis.HTMLElement = class HTMLElement {};
globalThis.HTMLElement.prototype.attachShadow = () => ({
  innerHTML: '',
  querySelector(selector) {
    if (selector === '.scope') return scopeElement;
    if (selector === '.wave') return waveCanvas;
    if (selector === '.overlay') return overlayCanvas;
    return null;
  },
});

globalThis.customElements = {
  elements: new Map(),
  get(name) {
    return this.elements.get(name);
  },
  define(name, constructor) {
    this.elements.set(name, constructor);
  },
};

const { ScopeVisualizer } = await import('../src/components/compost-scope.js');

test('scope exposes a stable configuration description without announcing samples', () => {
  const scope = new ScopeVisualizer();
  const attributes = new Map();
  scope.getAttribute = (name) => attributes.get(name) ?? null;
  scope.setAttribute = (name, value) => attributes.set(name, String(value));
  scope.channelIndexes = [0, 1];
  scope.samplesShown = 512;
  scope.periodsShown = null;
  scope.valueRange = 1;
  scope.yOffset = 0;
  scope.trigger = 'up';
  scope.triggerLevel = 0.25;

  scope.refreshAccessibilityDescription();

  assert.equal(
    attributes.get('aria-description'),
    '2 channels; 512-sample window; vertical range -1 to 1; rising edge trigger at 0.25.',
  );
});

test('setSamples retains typed arrays without reducing precision or copying', () => {
  const scope = new ScopeVisualizer();
  const left = new Float64Array([0.123456789012345, -0.25, 0.5]);
  const right = new Float32Array([0.75, 0, -0.75]);
  const trigger = new Float32Array([0, 1, 0]);

  const result = scope.setSamples([left, right], { triggerSamples: trigger });

  assert.equal(result, scope);
  assert.equal(scope.sampleSource, 'manual');
  assert.equal(scope.channelSamples[0], left);
  assert.equal(scope.channelSamples[1], right);
  assert.equal(scope.samples, left);
  assert.equal(scope.triggerSamples, trigger);
  assert.equal(scope.samples[0], 0.123456789012345);
});

test('setSamples can own a typed-array snapshot', () => {
  const scope = new ScopeVisualizer();
  const samples = new Float64Array([0.1, 0.2, 0.3]);

  scope.setSamples(samples, { copy: true });

  assert.notEqual(scope.samples, samples);
  assert.ok(scope.samples instanceof Float64Array);
  assert.deepEqual(scope.samples, samples);
});

test('setSamples retains plain mono arrays without copying or reducing precision', () => {
  const scope = new ScopeVisualizer();
  const samples = [0.123456789012345, 0.5];

  scope.setSamples(samples);

  assert.equal(scope.samples, samples);
  assert.equal(scope.samples[0], 0.123456789012345);
});

test('setSamples can own a plain-array snapshot', () => {
  const scope = new ScopeVisualizer();
  const samples = [0.1, 0.2, 0.3];

  scope.setSamples(samples, { copy: true });

  assert.notEqual(scope.samples, samples);
  assert.deepEqual(scope.samples, samples);
});

test('setSamples rejects unaligned channel and trigger windows', () => {
  const scope = new ScopeVisualizer();

  assert.throws(
    () => scope.setSamples([new Float32Array(4), new Float32Array(3)]),
    /every channel to have the same length/,
  );
  assert.throws(
    () => scope.setSamples(new Float32Array(4), { triggerSamples: new Float32Array(3) }),
    /triggerSamples to match the channel length/,
  );
});

test('switching back to analyser input restores Web Audio Float32 buffers', () => {
  const scope = new ScopeVisualizer();
  const manualSamples = new Float64Array(scope.fftSize);
  const manualTrigger = new Float64Array(scope.fftSize);

  scope.setSamples(manualSamples, { triggerSamples: manualTrigger });
  scope.sampleSource = 'audio';
  scope.triggerChannel = 1;
  scope.ensureSampleBuffer();

  assert.ok(scope.samples instanceof Float32Array);
  assert.ok(scope.triggerSamples instanceof Float32Array);
  assert.notEqual(scope.samples, manualSamples);
  assert.notEqual(scope.triggerSamples, manualTrigger);
});

test('external trigger samples select the exactly aligned capture position', () => {
  const scope = new ScopeVisualizer();
  const samples = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  const trigger = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);

  scope.samplesShown = 4;
  scope.trigger = 'external';
  scope.setSamples(samples, { triggerSamples: trigger });

  assert.equal(scope.getTriggeredStartIndex(), 3);
});

test('up and down trigger modes find signal crossings', () => {
  const scope = new ScopeVisualizer();
  scope.samplesShown = 4;
  scope.triggerLevel = 0;
  scope.samples = new Float32Array([-0.5, -0.25, 0.25, 0.5, -0.25, -0.5, -0.25, -0.5]);

  scope.trigger = 'up';
  assert.equal(scope.getTriggeredStartIndex(), 1);

  scope.trigger = 'down';
  assert.equal(scope.getTriggeredStartIndex(), 3);
});

test('up and down trigger modes use the newest valid crossing', () => {
  const scope = new ScopeVisualizer();
  scope.samplesShown = 4;
  scope.triggerLevel = 0;
  scope.samples = new Float32Array([-0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5]);

  scope.trigger = 'up';
  assert.equal(scope.getTriggeredStartIndex(), 2);

  scope.samples = new Float32Array([0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -0.5]);
  scope.trigger = 'down';
  assert.equal(scope.getTriggeredStartIndex(), 2);
});

test('external period windows span a whole number of trigger intervals', () => {
  const scope = new ScopeVisualizer();
  const samples = new Float32Array(12);
  const trigger = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);

  scope.trigger = 'external';
  scope.periodsShown = 2;
  scope.setSamples(samples, { triggerSamples: trigger });

  assert.deepEqual(scope.getExternalPeriodWindow(), { startIndex: 4, endIndex: 11 });
  assert.deepEqual(scope.displayWindow(), { startIndex: 4, endIndex: 11 });
  assert.equal(scope.getTriggeredStartIndex(), 4);
});

test('external period windows never fall back to an unsynchronised sample window', () => {
  const scope = new ScopeVisualizer();
  const samples = new Float32Array(8);
  const trigger = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0]);

  scope.trigger = 'external';
  scope.periodsShown = 2;
  scope.setSamples(samples, { triggerSamples: trigger });

  assert.equal(scope.getExternalPeriodWindow(), null);
  assert.equal(scope.displayWindow(), null);
});

test('manual trigger holds only after an explicit capture', () => {
  const scope = new ScopeVisualizer();
  assert.equal(scope.normaliseTrigger('manual'), 'manual');
  scope.samplesShown = 4;
  scope.samples = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
  scope.triggerSamples = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0]);
  scope.trigger = 'manual';

  assert.equal(scope.getTriggeredStartIndex(), 4);
  scope.manualTriggerHold = true;
  assert.equal(scope.getTriggeredStartIndex(), 3);

  scope.trigger = 'external';
  assert.equal(scope.captureTrigger(), false);
});

test('connectAudio disconnects a previously connected source', () => {
  const scope = new ScopeVisualizer();
  const context = {};
  const input = { context };
  const connections = [];
  const disconnections = [];
  const first = {
    connect: (target) => connections.push(['first', target]),
    disconnect: (target) => disconnections.push(['first', target]),
  };
  const second = {
    connect: (target) => connections.push(['second', target]),
    disconnect: (target) => disconnections.push(['second', target]),
  };

  scope.configureAudioTap = () => {
    scope.input = input;
  };
  scope.applyAudioOptions = () => {};
  scope.connectAudio(context, { source: first });
  scope.connectAudio(context, { source: second });

  assert.deepEqual(connections, [['first', input], ['second', input]]);
  assert.deepEqual(disconnections, [['first', input]]);
  assert.equal(scope.connectedSource, second);
});
