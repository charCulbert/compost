import assert from 'node:assert/strict';
import test from 'node:test';

test('the mono synth worklet gates a note through release', async () => {
  const previousProcessor = globalThis.AudioWorkletProcessor;
  const previousRegister = globalThis.registerProcessor;
  const previousSampleRate = globalThis.sampleRate;
  let Processor;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { messages: [], postMessage: (message) => this.port.messages.push(message) };
    }
  };
  globalThis.registerProcessor = (_name, constructor) => { Processor = constructor; };
  globalThis.sampleRate = 48000;

  try {
    await import('../examples/signal-generator/worklets/signal-generator.js');
    const processor = new Processor();
    const parameters = Object.fromEntries(Processor.parameterDescriptors.map(
      ({ name, defaultValue }) => [name, new Float32Array([defaultValue])],
    ));
    const output = [new Float32Array(128), new Float32Array(128)];
    processor.handleMessage({ type: 'adsr', attack: .001, decay: .001, sustain: .5, release: .001 });
    processor.handleMessage({ type: 'noteOn', source: 'test', note: 69, velocity: 127 });
    processor.process([], [output], parameters);
    assert.ok(output[0].some((sample) => sample !== 0));

    processor.handleMessage({ type: 'noteOff', source: 'test', note: 69 });
    processor.process([], [output], parameters);
    assert.equal(processor.stage, 'idle');
    assert.equal(processor.level, 0);
  } finally {
    globalThis.AudioWorkletProcessor = previousProcessor;
    globalThis.registerProcessor = previousRegister;
    globalThis.sampleRate = previousSampleRate;
  }
});
